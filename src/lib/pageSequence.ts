import { type NotePage } from '../db/db'

export type PageEntry =
  | { type: 'pdf'; pdfPageNum: number }
  | { type: 'note'; notePageId: string; content: string }

export function buildPageSequence(
  pdfPageCount: number,
  notePages: NotePage[],
): PageEntry[] {
  const sorted = [...notePages].sort((a, b) => {
    if (a.afterPage !== b.afterPage) return a.afterPage - b.afterPage
    return a.createdAt - b.createdAt
  })

  const notesByAfter = new Map<number, NotePage[]>()
  for (const np of sorted) {
    const key = np.afterPage
    if (!notesByAfter.has(key)) notesByAfter.set(key, [])
    notesByAfter.get(key)!.push(np)
  }

  const seq: PageEntry[] = []

  // Notes before first PDF page (afterPage = 0)
  for (const np of notesByAfter.get(0) ?? []) {
    seq.push({ type: 'note', notePageId: np.id, content: np.content })
  }

  for (let p = 1; p <= pdfPageCount; p++) {
    seq.push({ type: 'pdf', pdfPageNum: p })
    for (const np of notesByAfter.get(p) ?? []) {
      seq.push({ type: 'note', notePageId: np.id, content: np.content })
    }
  }

  // Notes after the last page (afterPage > pdfPageCount)
  for (const [afterPage, nps] of notesByAfter) {
    if (afterPage > pdfPageCount) {
      for (const np of nps) {
        seq.push({ type: 'note', notePageId: np.id, content: np.content })
      }
    }
  }

  return seq
}
