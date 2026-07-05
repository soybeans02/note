// Bidirectional sync between local Dexie tables and a single S3 object
// (`state.json`) plus per-blob objects under `blobs/` and `imageblobs/`.
//
// Conflict model: last-write-wins per row, keyed by row.updatedAt. Deletions
// are tracked via the `tombstones` table so they propagate across devices.
// Blob uploads are tracked in `syncedBlobs`; if a row references a blob the
// remote bucket doesn't have, we re-upload from local on next push.
//
// Public surface:
//   initSync()            — call once at app start
//   getSyncState()        — current status snapshot (for UI)
//   subscribeSync(fn)     — re-render on status change
//   syncNow()             — manual pull+push
//   downloadDocBlob(id)   — fetch a document blob from S3 if local missing
//   downloadImagePageBlob(id)
//   isSyncEnabled()       — re-export

import {
  db,
  type Annotation,
  type DocumentBlob,
  type DocumentMeta,
  type Folder,
  type ImagePage,
  type NotePage,
  type Tombstone,
  type TombstoneTable,
} from '../db/db'
import {
  isS3Configured,
  s3Delete,
  s3GetBlob,
  s3GetJson,
  s3PutBlob,
  s3PutJson,
} from './s3'

export { isS3Configured as isSyncEnabled }

// ─── State + subscribers ──────────────────────────────────────────────────

export interface SyncState {
  enabled: boolean
  status: 'idle' | 'pulling' | 'pushing' | 'error'
  lastSyncedAt: number | null
  lastError: string | null
  pendingBlobs: number
}

let state: SyncState = {
  enabled: false,
  status: 'idle',
  lastSyncedAt: null,
  lastError: null,
  pendingBlobs: 0,
}

const subs = new Set<(s: SyncState) => void>()

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const fn of subs) fn(state)
}

// ─── Wire schema ──────────────────────────────────────────────────────────

const STATE_KEY = 'state.json'
const BLOB_KEY = (id: string) => `blobs/${id}`
const IMAGE_BLOB_KEY = (id: string) => `imageblobs/${id}`

interface RemoteState {
  schema: 1
  exportedAt: number
  folders: Folder[]
  documents: DocumentMeta[]
  notePages: NotePage[]
  // imagePages without the blob (blob lives separately in S3)
  imagePages: Array<Omit<ImagePage, 'blob'>>
  annotations: Annotation[]
  tombstones: Tombstone[]
}

const ALL_TABLES: TombstoneTable[] = [
  'folders',
  'documents',
  'notePages',
  'imagePages',
  'annotations',
]

// ─── Tombstone hooks ──────────────────────────────────────────────────────
// On any row delete, record a tombstone so the deletion can propagate.
//
// IMPORTANT: the tombstone is written AFTER the deleting transaction
// completes, not inside it. Most delete call sites open transactions that
// don't include the `tombstones` table, and `trans.table('tombstones')`
// would throw NotFoundError and abort the whole delete.

let hooksAttached = false

function attachTombstoneHooks() {
  if (hooksAttached) return
  hooksAttached = true
  const wire = (name: TombstoneTable) => {
    const table = db.table(name)
    table.hook('deleting', function (primKey, _obj, trans) {
      // Skip if the deletion is itself part of a tombstone-driven cleanup.
      if ((trans as unknown as { _syncSilent?: boolean })._syncSilent) return
      trans.on('complete', () => {
        db.tombstones
          .put({
            id: `${name}:${primKey}`,
            table: name,
            rowId: primKey as string,
            deletedAt: Date.now(),
          } satisfies Tombstone)
          .catch(() => {
            /* best-effort — worst case the delete doesn't propagate */
          })
      })
    })
  }
  for (const name of ALL_TABLES) wire(name)
}

// ─── Change subscription ──────────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null
let pushInFlight = false
let pushAgain = false

// After a credentials/permissions failure, automatic sync (focus pulls,
// debounced pushes) is paused so the console isn't flooded with 403s.
// Clicking the sync badge (syncNow) retries and clears the pause.
let authFailed = false

function isAuthError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? ''
  const msg = (err as { message?: string })?.message ?? ''
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode
  return (
    status === 403 ||
    /InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|ExpiredToken|CredentialsError/i.test(
      `${name} ${msg}`,
    )
  )
}

function recordSyncError(err: unknown) {
  if (isAuthError(err)) {
    authFailed = true
    setState({
      status: 'error',
      lastError:
        'AWSの認証に失敗（キー設定を確認）。バッジをクリックで再試行',
    })
  } else {
    setState({ status: 'error', lastError: (err as Error).message })
  }
}

function schedulePush(delayMs = 2500) {
  if (!isS3Configured() || authFailed) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void doPush()
  }, delayMs)
}

function attachChangeHooks() {
  const trigger = () => schedulePush()
  const names = [
    'folders',
    'documents',
    'notePages',
    'imagePages',
    'annotations',
    'tombstones',
  ] as const
  for (const name of names) {
    const t = db.table(name)
    t.hook('creating', trigger)
    t.hook('updating', trigger)
    t.hook('deleting', trigger)
  }
  // Blob writes are also relevant — they signal a new upload needs to happen.
  db.blobs.hook('creating', () => schedulePush(500))
}

// ─── Collect local state for push ─────────────────────────────────────────

async function collectLocalState(): Promise<RemoteState> {
  const [folders, documents, notePages, imagePages, annotations, tombstones] =
    await Promise.all([
      db.folders.toArray(),
      db.documents.toArray(),
      db.notePages.toArray(),
      db.imagePages.toArray(),
      db.annotations.toArray(),
      db.tombstones.toArray(),
    ])
  return {
    schema: 1,
    exportedAt: Date.now(),
    folders,
    documents,
    notePages,
    imagePages: imagePages.map(({ blob: _b, ...rest }) => rest),
    annotations,
    tombstones,
  }
}

// ─── Merge remote into local ──────────────────────────────────────────────

async function mergeRemote(remote: RemoteState) {
  await db.transaction(
    'rw',
    [
      db.folders,
      db.documents,
      db.notePages,
      db.imagePages,
      db.annotations,
      db.tombstones,
    ],
    async (tx) => {
      // Mark this transaction so the tombstone hook doesn't fire when we apply
      // remote deletions locally (they're already tombstones).
      ;(tx as unknown as { _syncSilent: boolean })._syncSilent = true

      // 1. Apply tombstones first — they remove rows that other devices killed
      const localTombstones = new Map(
        (await tx.table('tombstones').toArray()).map((t: Tombstone) => [t.id, t]),
      )
      for (const t of remote.tombstones) {
        const existing = localTombstones.get(t.id)
        if (!existing || t.deletedAt > existing.deletedAt) {
          await tx.table('tombstones').put(t)
        }
        // Drop the row if it's still around and older than the tombstone
        const tableName = t.table
        const row = (await tx.table(tableName).get(t.rowId)) as { updatedAt?: number } | undefined
        if (row && (row.updatedAt ?? 0) <= t.deletedAt) {
          await tx.table(tableName).delete(t.rowId)
        }
      }

      // 2. Per-table row merge by max(updatedAt)
      const apply = async <T extends { id: string; updatedAt?: number }>(
        tableName: TombstoneTable,
        rows: T[],
      ) => {
        const tableHandle = tx.table(tableName)
        const allLocal = (await tableHandle.toArray()) as T[]
        const localById = new Map(allLocal.map((r) => [r.id, r]))
        // If a local tombstone is newer than this remote row, skip it.
        const tombByRow = new Map<string, Tombstone>()
        for (const [, tomb] of localTombstones) {
          if (tomb.table === tableName) tombByRow.set(tomb.rowId, tomb)
        }
        for (const r of rows) {
          const tomb = tombByRow.get(r.id)
          if (tomb && tomb.deletedAt > (r.updatedAt ?? 0)) continue
          const local = localById.get(r.id)
          if (!local || (r.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            await tableHandle.put(r)
          }
        }
      }
      await apply('folders', remote.folders)
      await apply('documents', remote.documents)
      await apply('notePages', remote.notePages)
      // imagePages: keep local blob if we have it; otherwise stub blob will be
      // filled in lazily via downloadImagePageBlob when the page is rendered.
      const ipTable = tx.table<ImagePage>('imagePages')
      const localIpById = new Map(
        (await ipTable.toArray()).map((r) => [r.id, r]),
      )
      const ipTombByRow = new Map<string, Tombstone>()
      for (const [, tomb] of localTombstones) {
        if (tomb.table === 'imagePages') ipTombByRow.set(tomb.rowId, tomb)
      }
      for (const r of remote.imagePages) {
        const tomb = ipTombByRow.get(r.id)
        if (tomb && tomb.deletedAt > (r.updatedAt ?? 0)) continue
        const local = localIpById.get(r.id)
        if (!local) {
          // No blob yet; insert with empty placeholder. Real blob comes on demand.
          await ipTable.put({ ...r, blob: new Blob([], { type: 'image/png' }) })
        } else if ((r.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
          // Preserve existing blob unless metadata-only change
          await ipTable.put({ ...r, blob: local.blob })
        }
      }
      await apply('annotations', remote.annotations)
    },
  )
}

// ─── Push ─────────────────────────────────────────────────────────────────

async function doPush() {
  if (!isS3Configured()) return
  if (pushInFlight) {
    pushAgain = true
    return
  }
  pushInFlight = true
  try {
    setState({ status: 'pushing', lastError: null })
    const local = await collectLocalState()
    await s3PutJson(STATE_KEY, local)
    await syncBlobs()
    setState({ status: 'idle', lastSyncedAt: Date.now() })
  } catch (err) {
    console.error('Push failed', err)
    recordSyncError(err)
  } finally {
    pushInFlight = false
    if (pushAgain) {
      pushAgain = false
      schedulePush(1000)
    }
  }
}

// ─── Blobs ────────────────────────────────────────────────────────────────

async function syncBlobs() {
  // For each known document with a local blob: upload if not in syncedBlobs.
  const allDocs = await db.documents.toArray()
  const allImagePages = await db.imagePages.toArray()
  const synced = new Set((await db.syncedBlobs.toArray()).map((b) => b.key))
  let pendingCount = 0
  const pending: Array<{ key: string; blob: Blob }> = []

  for (const doc of allDocs) {
    const key = BLOB_KEY(doc.id)
    if (synced.has(key)) continue
    const localBlob = await db.blobs.get(doc.id)
    if (!localBlob) continue
    pending.push({ key, blob: localBlob.blob })
  }
  for (const ip of allImagePages) {
    if (!ip.blob || ip.blob.size === 0) continue
    const key = IMAGE_BLOB_KEY(ip.id)
    if (synced.has(key)) continue
    pending.push({ key, blob: ip.blob })
  }

  pendingCount = pending.length
  setState({ pendingBlobs: pendingCount })

  for (const item of pending) {
    try {
      await s3PutBlob(item.key, item.blob)
      await db.syncedBlobs.put({ key: item.key, uploadedAt: Date.now() })
      pendingCount -= 1
      setState({ pendingBlobs: pendingCount })
    } catch (err) {
      console.warn('Blob upload failed', item.key, err)
      // Credentials problem — every remaining upload would fail the same way.
      if (isAuthError(err)) throw err
    }
  }

  // Tombstone-driven blob deletes
  const tombs = await db.tombstones.toArray()
  for (const t of tombs) {
    if (t.table === 'documents') {
      const key = BLOB_KEY(t.rowId)
      if (synced.has(key) || (await db.syncedBlobs.get(key))) {
        await s3Delete(key)
        await db.syncedBlobs.delete(key)
      }
    } else if (t.table === 'imagePages') {
      const key = IMAGE_BLOB_KEY(t.rowId)
      if (synced.has(key) || (await db.syncedBlobs.get(key))) {
        await s3Delete(key)
        await db.syncedBlobs.delete(key)
      }
    }
  }
}

/** Pull a document's PDF/image blob from S3 if local IndexedDB is missing it. */
export async function downloadDocBlob(docId: string): Promise<Blob | null> {
  const local = await db.blobs.get(docId)
  if (local) return local.blob
  if (!isS3Configured()) return null
  const blob = await s3GetBlob(BLOB_KEY(docId))
  if (!blob) return null
  const stored: DocumentBlob = { id: docId, blob }
  await db.blobs.put(stored)
  await db.syncedBlobs.put({ key: BLOB_KEY(docId), uploadedAt: Date.now() })
  return blob
}

/** Pull an inserted-image-page blob from S3 if the local row only has a placeholder. */
export async function downloadImagePageBlob(imagePageId: string): Promise<Blob | null> {
  const row = await db.imagePages.get(imagePageId)
  if (row && row.blob && row.blob.size > 0) return row.blob
  if (!isS3Configured()) return null
  const blob = await s3GetBlob(IMAGE_BLOB_KEY(imagePageId))
  if (!blob || !row) return null
  await db.imagePages.put({ ...row, blob })
  await db.syncedBlobs.put({
    key: IMAGE_BLOB_KEY(imagePageId),
    uploadedAt: Date.now(),
  })
  return blob
}

// ─── Pull ─────────────────────────────────────────────────────────────────

async function doPull() {
  if (!isS3Configured()) return
  try {
    setState({ status: 'pulling', lastError: null })
    const remote = await s3GetJson<RemoteState>(STATE_KEY)
    if (remote && remote.schema === 1) {
      await mergeRemote(remote)
    }
    setState({ status: 'idle', lastSyncedAt: Date.now() })
  } catch (err) {
    console.error('Pull failed', err)
    recordSyncError(err)
  }
}

// ─── Manual sync ──────────────────────────────────────────────────────────

export async function syncNow() {
  // Manual retry clears the auth-failure pause.
  authFailed = false
  await doPull()
  if (authFailed) return // still failing — don't double the error spam
  await doPush()
}

// ─── Boot ─────────────────────────────────────────────────────────────────

let initialized = false

export async function initSync() {
  if (initialized) return
  initialized = true
  setState({ enabled: isS3Configured() })
  if (!isS3Configured()) return
  attachTombstoneHooks()
  attachChangeHooks()
  await doPull()
  // Push any local-only state on first run (also picks up blob uploads).
  if (!authFailed) await doPush()
  // Refresh on focus (paused while credentials are known-bad).
  window.addEventListener('focus', () => {
    if (!authFailed) void doPull()
  })
}
