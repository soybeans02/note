import { type NotePage, type ImagePage } from '../db/db'

export type PageEntry =
  | { type: 'pdf'; pdfPageNum: number }
  | { type: 'note'; notePageId: string; content: string }
  | { type: 'image'; imagePageId: string; blob: Blob }

interface InsertedPage {
  afterPage: number
  createdAt: number
  entry: PageEntry
}

export function buildPageSequence(
  pdfPageCount: number,
  notePages: NotePage[],
  imagePages: ImagePage[] = [],
): PageEntry[] {
  // Merge note pages and image pages into a single sorted list
  const inserted: InsertedPage[] = []

  for (const np of notePages) {
    inserted.push({
      afterPage: np.afterPage,
      createdAt: np.createdAt,
      entry: { type: 'note', notePageId: np.id, content: np.content },
    })
  }

  for (const ip of imagePages) {
    inserted.push({
      afterPage: ip.afterPage,
      createdAt: ip.createdAt,
      entry: { type: 'image', imagePageId: ip.id, blob: ip.blob },
    })
  }

  inserted.sort((a, b) => {
    if (a.afterPage !== b.afterPage) return a.afterPage - b.afterPage
    return a.createdAt - b.createdAt
  })

  const byAfter = new Map<number, PageEntry[]>()
  for (const item of inserted) {
    const key = item.afterPage
    if (!byAfter.has(key)) byAfter.set(key, [])
    byAfter.get(key)!.push(item.entry)
  }

  const seq: PageEntry[] = []

  // Pages before first PDF page (afterPage = 0)
  for (const e of byAfter.get(0) ?? []) seq.push(e)

  for (let p = 1; p <= pdfPageCount; p++) {
    seq.push({ type: 'pdf', pdfPageNum: p })
    for (const e of byAfter.get(p) ?? []) seq.push(e)
  }

  // Pages after the last page (afterPage > pdfPageCount)
  for (const [afterPage, entries] of byAfter) {
    if (afterPage > pdfPageCount) {
      for (const e of entries) seq.push(e)
    }
  }

  return seq
}
