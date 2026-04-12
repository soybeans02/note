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

/** Trace-erase: remove points near (nx, ny) and split strokes */
export async function traceEraseAt(
  docId: string,
  pageNum: number,
  nx: number,
  ny: number,
  threshold = 0.03,
) {
  const id = `${docId}-${pageNum}`
  const existing = await db.annotations.get(id)
  if (!existing) return

  const newStrokes: Stroke[] = []
  for (const stroke of existing.strokes) {
    // Split this stroke by removing points near the eraser
    const segments: [number, number, number][][] = []
    let current: [number, number, number][] = []
    for (const pt of stroke.points) {
      const dx = pt[0] - nx
      const dy = pt[1] - ny
      if (dx * dx + dy * dy < threshold * threshold) {
        // Point is within eraser range — break segment
        if (current.length >= 2) segments.push(current)
        current = []
      } else {
        current.push(pt)
      }
    }
    if (current.length >= 2) segments.push(current)

    for (const seg of segments) {
      newStrokes.push({
        id: uid(),
        points: seg,
        color: stroke.color,
        width: stroke.width,
      })
    }
  }
  await saveStrokes(docId, pageNum, newStrokes)
}

export async function deleteAnnotationsForDocument(docId: string) {
  const keys = await db.annotations.where('docId').equals(docId).primaryKeys()
  await db.annotations.bulkDelete(keys)
}

export { uid }
