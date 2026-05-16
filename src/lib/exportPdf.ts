import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import getStroke from 'perfect-freehand'
import { db } from '../db/db'

function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return ''
  const d = points.reduce(
    (acc, [x, y], i, arr) => {
      if (i === 0) return `M ${x} ${y}`
      const [px, py] = arr[i - 1]
      const mx = (px + x) / 2
      const my = (py + y) / 2
      return `${acc} Q ${px} ${py}, ${mx} ${my}`
    },
    '',
  )
  return `${d} Z`
}

async function renderPageToImage(
  pdf: PDFDocumentProxy,
  pageNum: number,
  docId: string,
): Promise<{ imageBytes: Uint8Array; width: number; height: number }> {
  const page = await pdf.getPage(pageNum)
  const scale = 2
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!

  await page.render({ canvasContext: ctx, viewport }).promise

  const annotation = await db.annotations.get(`${docId}-${String(pageNum)}`)
  if (annotation) {
    // Strokes
    const baseStrokeScale = Math.min(viewport.width, viewport.height) / 500
    for (const stroke of annotation.strokes) {
      const isHighlighter = stroke.tool === 'highlighter'
      const scaledPoints = stroke.points.map(
        ([x, y, p]) => [x * viewport.width, y * viewport.height, p] as [number, number, number],
      )
      const outlinePoints = getStroke(scaledPoints, {
        size: stroke.width * baseStrokeScale,
        thinning: isHighlighter ? 0 : 0.6,
        smoothing: isHighlighter ? 0.4 : 0.5,
        streamline: 0.5,
        simulatePressure: !isHighlighter,
      })
      const path = new Path2D(getSvgPathFromStroke(outlinePoints))
      ctx.save()
      if (isHighlighter) {
        ctx.globalAlpha = 0.35
        ctx.globalCompositeOperation = 'multiply'
      }
      ctx.fillStyle = stroke.color
      ctx.fill(path)
      ctx.restore()
    }

    // Text boxes
    const baseScale = Math.min(viewport.width, viewport.height) / 500
    for (const tb of annotation.textBoxes ?? []) {
      const x = tb.x * viewport.width
      const y = tb.y * viewport.height
      const fs = tb.fontSize * baseScale
      ctx.font = `${tb.bold ? 'bold ' : ''}${fs}px sans-serif`
      ctx.fillStyle = tb.color
      ctx.textBaseline = 'top'
      const lines = tb.text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, y + i * fs * 1.4)
      }
    }
  }

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png'),
  )
  const arrayBuffer = await blob.arrayBuffer()
  return {
    imageBytes: new Uint8Array(arrayBuffer),
    width: viewport.width / scale,
    height: viewport.height / scale,
  }
}

export async function exportPdfWithAnnotations(
  pdf: PDFDocumentProxy,
  docId: string,
  docName: string,
) {
  const pdfDoc = await PDFDocument.create()

  for (let i = 1; i <= pdf.numPages; i++) {
    const { imageBytes, width, height } = await renderPageToImage(pdf, i, docId)
    const image = await pdfDoc.embedPng(imageBytes)
    const page = pdfDoc.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  }

  const pdfBytes = await pdfDoc.save()
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${docName}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
