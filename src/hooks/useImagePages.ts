import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type ImagePage } from '../db/db'

export function useImagePages(documentId: string): ImagePage[] {
  return (
    useLiveQuery(
      () => db.imagePages.where('documentId').equals(documentId).toArray(),
      [documentId],
      [],
    ) ?? []
  )
}

export async function addImagePage(
  documentId: string,
  afterPage: number,
  blob: Blob,
): Promise<string> {
  const id = uid()
  const now = Date.now()
  await db.imagePages.add({
    id,
    documentId,
    afterPage,
    blob,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function deleteImagePage(id: string) {
  await db.imagePages.delete(id)
}

export async function deleteImagePagesForDocument(documentId: string) {
  const keys = await db.imagePages
    .where('documentId')
    .equals(documentId)
    .primaryKeys()
  await db.imagePages.bulkDelete(keys)
}
