import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type NotePage } from '../db/db'

export function useNotePages(documentId: string): NotePage[] {
  return (
    useLiveQuery(
      () => db.notePages.where('documentId').equals(documentId).toArray(),
      [documentId],
      [],
    ) ?? []
  )
}

export async function addNotePage(
  documentId: string,
  afterPage: number,
): Promise<string> {
  const id = uid()
  const now = Date.now()
  await db.notePages.add({
    id,
    documentId,
    afterPage,
    content: '',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function saveNotePage(id: string, content: string) {
  await db.notePages.update(id, { content, updatedAt: Date.now() })
}

export async function deleteNotePage(id: string) {
  await db.notePages.delete(id)
}

export async function deleteNotePagesForDocument(documentId: string) {
  const keys = await db.notePages
    .where('documentId')
    .equals(documentId)
    .primaryKeys()
  await db.notePages.bulkDelete(keys)
}
