import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export { pdfjsLib }

export async function loadPdfFromBlob(blob: Blob) {
  const buf = await blob.arrayBuffer()
  return pdfjsLib.getDocument({ data: buf }).promise
}

/** Render page 1 of the given PDF blob to a small JPEG data URL for the grid. */
export async function makeThumbnail(blob: Blob, maxWidth = 320): Promise<string> {
  const pdf = await loadPdfFromBlob(blob)
  try {
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(maxWidth / baseViewport.width, 2)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.7)
  } finally {
    pdf.destroy()
  }
}

export interface PdfMeta {
  pageCount: number
  thumbDataUrl: string
}

export async function extractPdfMeta(blob: Blob): Promise<PdfMeta> {
  const pdf = await loadPdfFromBlob(blob)
  const pageCount = pdf.numPages
  pdf.destroy()
  const thumbDataUrl = await makeThumbnail(blob)
  return { pageCount, thumbDataUrl }
}
