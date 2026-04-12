import { useEffect, useRef, useState } from 'react'
import { type DocumentMeta } from '../db/db'
import { getDocumentBlob } from '../hooks/useDocuments'
import { loadPdfFromBlob } from '../lib/pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface Props {
  doc: DocumentMeta
  onClose: () => void
}

export default function PdfViewer({ doc, onClose }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1.2)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)

  useEffect(() => {
    let alive = true
    let loaded: PDFDocumentProxy | null = null
    ;(async () => {
      const blob = await getDocumentBlob(doc.id)
      if (!blob || !alive) return
      loaded = await loadPdfFromBlob(blob)
      if (!alive) {
        loaded.destroy()
        return
      }
      setPdf(loaded)
      setPage(1)
    })()
    return () => {
      alive = false
      loaded?.destroy()
    }
  }, [doc.id])

  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      const p = await pdf.getPage(page)
      if (cancelled) return
      const dpr = window.devicePixelRatio || 1
      const viewport = p.getViewport({ scale: zoom * dpr })
      const canvas = canvasRef.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`
      const ctx = canvas.getContext('2d')!
      renderTaskRef.current?.cancel()
      const task = p.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch {
        /* render cancelled */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf, page, zoom])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ')
        setPage((p) => (pdf ? Math.min(pdf.numPages, p + 1) : p))
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp')
        setPage((p) => Math.max(1, p - 1))
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.2))
      else if (e.key === '-') setZoom((z) => Math.max(0.4, z - 0.2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdf, onClose])

  const total = pdf?.numPages ?? doc.pageCount

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 text-sm">
        <button
          onClick={onClose}
          className="px-2 py-1 text-slate-300 hover:text-white"
          title="閉じる (Esc)"
        >
          ✕
        </button>
        <div className="flex-1 truncate text-slate-200">{doc.name}</div>

        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300"
        >
          ◀
        </button>
        <span className="text-slate-400 tabular-nums">
          {page} / {total}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(total, p + 1))}
          className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300"
        >
          ▶
        </button>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300"
        >
          −
        </button>
        <span className="text-slate-400 tabular-nums w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
          className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300"
        >
          ＋
        </button>
      </div>

      <div className="flex-1 overflow-auto scroll-thin flex items-start justify-center p-6">
        <canvas ref={canvasRef} className="shadow-2xl bg-white" />
      </div>
    </div>
  )
}
