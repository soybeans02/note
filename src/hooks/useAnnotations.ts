import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Annotation, type Stroke } from '../db/db'

export function useAnnotation(docId: string, pageNum: number): Annotation | undefined {
  return useLiveQuery(
    () => db.annotations.get(`${docId}-${pageNum}`),
    [docId, pageNum],
  )
}

export async function saveStrokes(docId: string, pageNum: number, strokes: Stroke[]) {
  const id = `${docId}-${pageNum}`
  const existing = await db.annotations.get(id)
  if (existing) {
    await db.annotations.update(id, { strokes, updatedAt: Date.now() })
  } else {
    await db.annotations.add({
      id,
      docId,
      pageNum,
      strokes,
      updatedAt: Date.now(),
    })
  }
}

export async function addStroke(docId: string, pageNum: number, stroke: Stroke) {
  const id = `${docId}-${pageNum}`
  const existing = await db.annotations.get(id)
  const strokes = existing ? [...existing.strokes, stroke] : [stroke]
  await saveStrokes(docId, pageNum, strokes)
}

export async function removeStroke(docId: string, pageNum: number, strokeId: string) {
  const id = `${docId}-${pageNum}`
  const existing = await db.annotations.get(id)
  if (!existing) return
  const strokes = existing.strokes.filter((s) => s.id !== strokeId)
  await saveStrokes(docId, pageNum, strokes)
}

export async function deleteAnnotationsForDocument(docId: string) {
  const keys = await db.annotations.where('docId').equals(docId).primaryKeys()
  await db.annotations.bulkDelete(keys)
}

export { uid }
