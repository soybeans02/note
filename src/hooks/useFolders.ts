import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Folder } from '../db/db'

export function useAllFolders(): Folder[] {
  return useLiveQuery(() => db.folders.orderBy('name').toArray(), [], []) ?? []
}

export async function createFolder(name: string, parentId: string | null) {
  const now = Date.now()
  const siblings = (await db.folders.toArray()).filter(
    (f) => (f.parentId ?? null) === parentId,
  )
  const order = siblings.length
    ? Math.max(...siblings.map((f) => f.order ?? 0)) + 1
    : 0
  const folder: Folder = {
    id: uid(),
    name: name.trim() || '無題のフォルダ',
    parentId,
    order,
    createdAt: now,
    updatedAt: now,
  }
  await db.folders.add(folder)
  return folder
}

export async function renameFolder(id: string, name: string) {
  await db.folders.update(id, { name: name.trim() || '無題', updatedAt: Date.now() })
}

function isDescendantOf(all: Folder[], ancestorId: string, candidateId: string | null): boolean {
  let cur = candidateId
  while (cur) {
    if (cur === ancestorId) return true
    const parent = all.find((f) => f.id === cur)
    cur = parent?.parentId ?? null
  }
  return false
}

export async function moveFolder(id: string, newParentId: string | null) {
  if (id === newParentId) return
  const all = await db.folders.toArray()
  if (newParentId && isDescendantOf(all, id, newParentId)) return
  // Append at the end of the destination parent
  const siblings = all.filter((f) => (f.parentId ?? null) === newParentId && f.id !== id)
  const order = siblings.length
    ? Math.max(...siblings.map((f) => f.order ?? 0)) + 1
    : 0
  await db.folders.update(id, { parentId: newParentId, order, updatedAt: Date.now() })
}

/**
 * Reorder a folder relative to a reference folder at the SAME level.
 * mode='before' → place dragged just before refId (same parent as refId)
 * mode='after'  → place dragged just after  refId (same parent as refId)
 */
export async function reorderFolder(
  draggedId: string,
  refId: string,
  mode: 'before' | 'after',
) {
  if (draggedId === refId) return
  const all = await db.folders.toArray()
  const dragged = all.find((f) => f.id === draggedId)
  const ref = all.find((f) => f.id === refId)
  if (!dragged || !ref) return

  const targetParentId = ref.parentId ?? null
  if (targetParentId && isDescendantOf(all, draggedId, targetParentId)) return

  const siblings = all
    .filter((f) => (f.parentId ?? null) === targetParentId && f.id !== draggedId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const refIndex = siblings.findIndex((f) => f.id === refId)
  if (refIndex < 0) return
  const insertAt = mode === 'before' ? refIndex : refIndex + 1
  siblings.splice(insertAt, 0, { ...dragged, parentId: targetParentId })

  await db.transaction('rw', db.folders, async () => {
    const now = Date.now()
    for (let i = 0; i < siblings.length; i++) {
      const f = siblings[i]
      const patch: Partial<Folder> = {}
      if ((f.order ?? -1) !== i) patch.order = i
      if (f.id === draggedId && (dragged.parentId ?? null) !== targetParentId) {
        patch.parentId = targetParentId
        patch.updatedAt = now
      }
      if (Object.keys(patch).length) {
        await db.folders.update(f.id, patch)
      }
    }
  })
}

/** Recursively delete folder, its subfolders, and all contained documents/blobs. */
export async function deleteFolder(id: string) {
  const all = await db.folders.toArray()
  const toDelete = new Set<string>()
  const collect = (fid: string) => {
    toDelete.add(fid)
    for (const f of all) if (f.parentId === fid) collect(f.id)
  }
  collect(id)

  await db.transaction('rw', db.folders, db.documents, db.blobs, async () => {
    const docs = await db.documents.where('folderId').anyOf([...toDelete]).toArray()
    const docIds = docs.map((d) => d.id)
    await db.blobs.bulkDelete(docIds)
    await db.documents.bulkDelete(docIds)
    await db.folders.bulkDelete([...toDelete])
  })
}
