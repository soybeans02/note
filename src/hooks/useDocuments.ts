import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type DocumentMeta } from '../db/db'
import { extractPdfMeta } from '../lib/pdf'

export function useDocumentsInFolder(
  folderId: string | null,
  search: string,
): DocumentMeta[] {
  return (
    useLiveQuery(
      async () => {
        const rows =
          folderId === null
            ? await db.documents.toArray()
            : await db.documents.where('folderId').equals(folderId).toArray()
        const q = search.trim().toLowerCase()
        const filtered = q
          ? rows.filter((d) => d.name.toLowerCase().includes(q))
          : rows
        return filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      },
      [folderId, search],
      [],
    ) ?? []
  )
}

async function nextOrderInFolder(folderId: string | null): Promise<number> {
  const siblings =
    folderId === null
      ? await db.documents.toArray()
      : await db.documents.where('folderId').equals(folderId).toArray()
  const sameFolder = siblings.filter((d) => (d.folderId ?? null) === folderId)
  if (!sameFolder.length) return 0
  return Math.max(...sameFolder.map((d) => d.order ?? 0)) + 1
}

export async function addPdfFiles(files: File[], folderId: string | null) {
  for (const file of files) {
    if (file.type && !file.type.includes('pdf')) continue
    try {
      const meta = await extractPdfMeta(file)
      const id = uid()
      const now = Date.now()
      const order = await nextOrderInFolder(folderId)
      await db.transaction('rw', db.documents, db.blobs, async () => {
        await db.documents.add({
          id,
          folderId,
          name: file.name.replace(/\.pdf$/i, ''),
          size: file.size,
          pageCount: meta.pageCount,
          thumbDataUrl: meta.thumbDataUrl,
          order,
          notes: '',
          createdAt: now,
          updatedAt: now,
        })
        await db.blobs.add({ id, blob: file })
      })
    } catch (err) {
      console.error('Failed to import', file.name, err)
    }
  }
}

export async function moveDocument(id: string, folderId: string | null) {
  const order = await nextOrderInFolder(folderId)
  await db.documents.update(id, { folderId, order, updatedAt: Date.now() })
}

export async function saveNotes(id: string, notes: string) {
  await db.documents.update(id, { notes })
}

/**
 * Reorder a document within its current folder.
 * `beforeId` = id of the doc that the dragged one should land in front of,
 * or `null` to append at the end.
 */
export async function reorderDocument(draggedId: string, beforeId: string | null) {
  if (draggedId === beforeId) return
  const dragged = await db.documents.get(draggedId)
  if (!dragged) return
  const folderId = dragged.folderId ?? null

  const siblings = (
    folderId === null
      ? await db.documents.toArray()
      : await db.documents.where('folderId').equals(folderId).toArray()
  )
    .filter((d) => (d.folderId ?? null) === folderId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const without = siblings.filter((d) => d.id !== draggedId)
  let insertAt = without.length
  if (beforeId !== null) {
    const idx = without.findIndex((d) => d.id === beforeId)
    if (idx >= 0) insertAt = idx
  }
  without.splice(insertAt, 0, dragged)

  await db.transaction('rw', db.documents, async () => {
    for (let i = 0; i < without.length; i++) {
      if ((without[i].order ?? -1) !== i) {
        await db.documents.update(without[i].id, { order: i })
      }
    }
  })
}

export async function renameDocument(id: string, name: string) {
  await db.documents.update(id, { name: name.trim() || '無題', updatedAt: Date.now() })
}

export async function deleteDocument(id: string) {
  await db.transaction('rw', db.documents, db.blobs, async () => {
    await db.documents.delete(id)
    await db.blobs.delete(id)
  })
}

export async function getDocumentBlob(id: string): Promise<Blob | undefined> {
  const row = await db.blobs.get(id)
  return row?.blob
}
