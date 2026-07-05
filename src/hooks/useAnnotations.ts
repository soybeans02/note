import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Annotation, type Stroke, type TextBox } from '../db/db'

export function useAnnotation(docId: string, pageKey: string): Annotation | undefined {
  return useLiveQuery(
    () => db.annotations.get(`${docId}-${pageKey}`),
    [docId, pageKey],
  )
}

export async function saveStrokes(docId: string, pageKey: string, strokes: Stroke[]) {
  const id = `${docId}-${pageKey}`
  const existing = await db.annotations.get(id)
  if (existing) {
    await db.annotations.update(id, { strokes, updatedAt: Date.now() })
  } else {
    await db.annotations.add({
      id,
      docId,
      pageNum: 0,
      strokes,
      updatedAt: Date.now(),
    })
  }
}

export async function addStroke(docId: string, pageKey: string, stroke: Stroke) {
  const id = `${docId}-${pageKey}`
  const existing = await db.annotations.get(id)
  const strokes = existing ? [...existing.strokes, stroke] : [stroke]
  await saveStrokes(docId, pageKey, strokes)
}

export async function removeStroke(docId: string, pageKey: string, strokeId: string) {
  const id = `${docId}-${pageKey}`
  const existing = await db.annotations.get(id)
  if (!existing) return
  const strokes = existing.strokes.filter((s) => s.id !== strokeId)
  await saveStrokes(docId, pageKey, strokes)
}

/** Trace-erase: remove points near (nx, ny) and split strokes */
export async function traceEraseAt(
  docId: string,
  pageKey: string,
  nx: number,
  ny: number,
  threshold = 0.03,
) {
  const id = `${docId}-${pageKey}`
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
        tool: stroke.tool,
      })
    }
  }
  await saveStrokes(docId, pageKey, newStrokes)
}

export async function addTextBox(docId: string, pageKey: string, textBox: TextBox) {
  const id = `${docId}-${pageKey}`
  const existing = await db.annotations.get(id)
  const textBoxes = existing?.textBoxes ? [...existing.textBoxes, textBox] : [textBox]
  if (existing) {
    await db.annotations.update(id, { textBoxes, updatedAt: Date.now() })
  } else {
    await db.annotations.add({
      id,
      docId,
      pageNum: 0,
      strokes: [],
      textBoxes,
      updatedAt: Date.now(),
    })
  }
}

export async function updateTextBox(docId: string, pageKey: string, textBoxId: string, updates: Partial<TextBox>) {
  const id = `${docId}-${pageKey}`
  const existing = await db.annotations.get(id)
  if (!existing?.textBoxes) return
  const textBoxes = existing.textBoxes.map((tb) =>
    tb.id === textBoxId ? { ...tb, ...updates } : tb,
  )
  await db.annotations.update(id, { textBoxes, updatedAt: Date.now() })
}

export async function removeTextBox(docId: string, pageKey: string, textBoxId: string) {
  const id = `${docId}-${pageKey}`
  const existing = await db.annotations.get(id)
  if (!existing?.textBoxes) return
  const textBoxes = existing.textBoxes.filter((tb) => tb.id !== textBoxId)
  await db.annotations.update(id, { textBoxes, updatedAt: Date.now() })
}

export async function restoreAnnotation(
  docId: string,
  pageKey: string,
  strokes: Stroke[],
  textBoxes: TextBox[],
) {
  const id = `${docId}-${pageKey}`
  const existing = await db.annotations.get(id)
  if (existing) {
    await db.annotations.update(id, { strokes, textBoxes, updatedAt: Date.now() })
  } else {
    await db.annotations.add({
      id,
      docId,
      pageNum: 0,
      strokes,
      textBoxes,
      updatedAt: Date.now(),
    })
  }
}

export async function deleteAnnotationsForDocument(docId: string) {
  const keys = await db.annotations.where('docId').equals(docId).primaryKeys()
  await db.annotations.bulkDelete(keys)
}
