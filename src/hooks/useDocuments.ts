import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type DocumentMeta } from '../db/db'
import { extractPdfMeta } from '../lib/pdf'
import { addImagePage } from './useImagePages'

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
      ? (await db.documents.toArray()).filter((d) => d.folderId === null)
      : await db.documents.where('folderId').equals(folderId).toArray()
  if (!siblings.length) return 0
  return Math.max(...siblings.map((d) => d.order ?? 0)) + 1
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

export async function addImageFiles(files: File[], folderId: string | null) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    try {
      const id = uid()
      const now = Date.now()
      const order = await nextOrderInFolder(folderId)

      // Generate thumbnail
      const thumbDataUrl = await generateImageThumb(file)

      await db.documents.add({
        id,
        folderId,
        name: file.name.replace(/\.[^.]+$/, ''),
        size: file.size,
        pageCount: 0,
        thumbDataUrl,
        order,
        notes: '',
        createdAt: now,
        updatedAt: now,
      })

      const blob = new Blob([await file.arrayBuffer()], { type: file.type })
      await addImagePage(id, 0, blob)
    } catch (err) {
      console.error('Failed to import image', file.name, err)
    }
  }
}

function generateImageThumb(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const maxW = 200
      const maxH = 260
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      const w = img.width * scale
      const h = img.height * scale
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.6))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      resolve('')
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  })
}

export async function moveDocument(id: string, folderId: string | null) {
  const order = await nextOrderInFolder(folderId)
  await db.documents.update(id, { folderId, order, updatedAt: Date.now() })
}

export async function createBlankNote(folderId: string | null): Promise<string> {
  const id = uid()
  const now = Date.now()
  const order = await nextOrderInFolder(folderId)
  await db.documents.add({
    id,
    folderId,
    name: '新しいノート',
    size: 0,
    pageCount: 0,
    thumbDataUrl: '',
    order,
    notes: '',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/**
 * Reorder a document within its current folder.
 * targetId = the doc to anchor the drop on; null = append to end.
 * position = drop before or after the target (ignored when targetId is null).
 */
export async function reorderDocument(
  draggedId: string,
  targetId: string | null,
  position: 'before' | 'after' = 'before',
) {
  if (draggedId === targetId) return
  const dragged = await db.documents.get(draggedId)
  if (!dragged) return
  const folderId = dragged.folderId ?? null

  const siblings = (
    folderId === null
      ? (await db.documents.toArray()).filter((d) => d.folderId === null)
      : await db.documents.where('folderId').equals(folderId).toArray()
  ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const without = siblings.filter((d) => d.id !== draggedId)
  let insertAt = without.length
  if (targetId !== null) {
    const idx = without.findIndex((d) => d.id === targetId)
    if (idx >= 0) insertAt = position === 'after' ? idx + 1 : idx
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
  await db.transaction(
    'rw',
    [db.documents, db.blobs, db.annotations, db.notePages, db.imagePages],
    async () => {
      await db.documents.delete(id)
      await db.blobs.delete(id)
      // Cascade delete annotations
      const annKeys = await db.annotations.where('docId').equals(id).primaryKeys()
      await db.annotations.bulkDelete(annKeys)
      // Cascade delete note pages
      const npKeys = await db.notePages
        .where('documentId')
        .equals(id)
        .primaryKeys()
      await db.notePages.bulkDelete(npKeys)
      // Cascade delete image pages
      const ipKeys = await db.imagePages
        .where('documentId')
        .equals(id)
        .primaryKeys()
      await db.imagePages.bulkDelete(ipKeys)
    },
  )
}

export async function getDocumentBlob(id: string): Promise<Blob | undefined> {
  const row = await db.blobs.get(id)
  return row?.blob
}
