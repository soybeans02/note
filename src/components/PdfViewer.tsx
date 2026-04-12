import { useCallback, useEffect, useRef, useState } from 'react'
import { type DocumentMeta } from '../db/db'
import { getDocumentBlob, saveNotes } from '../hooks/useDocuments'
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
  const [notes, setNotes] = useState(doc.notes ?? '')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const pdfPages = pdf?.numPages ?? doc.pageCount
  const totalWithNotes = pdfPages + 1
  const isNotesPage = page === totalWithNotes

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

  // Render PDF page
  useEffect(() => {
    if (!pdf || !canvasRef.current || isNotesPage) return
    if (page > pdf.numPages) return
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
  }, [pdf, page, zoom, isNotesPage])

  // Focus textarea when on notes page
  useEffect(() => {
    if (isNotesPage) textareaRef.current?.focus()
  }, [isNotesPage])

  // Debounced save
  const handleNotesChange = useCallback(
    (value: string) => {
      setNotes(value)
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveNotes(doc.id, value)
      }, 500)
    },
    [doc.id],
  )

  // Save on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current)
      saveNotes(doc.id, notes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept keys when typing in textarea
      if (isNotesPage && e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') onClose()
        return
      }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ')
        setPage((p) => Math.min(totalWithNotes, p + 1))
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp')
        setPage((p) => Math.max(1, p - 1))
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.2))
      else if (e.key === '-') setZoom((z) => Math.max(0.4, z - 0.2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalWithNotes, isNotesPage, onClose])

  const pageLabel = isNotesPage ? 'ノート' : `${page}`

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 text-sm whitespace-nowrap">
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
          {pageLabel} / {totalWithNotes}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalWithNotes, p + 1))}
          className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300"
        >
          ▶
        </button>

        <button
          onClick={() => setPage(totalWithNotes)}
          className={`px-2.5 py-1 rounded text-xs ${
            isNotesPage
              ? 'bg-sky-600 text-white'
              : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="ノートページ"
        >
          メモ
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
        {isNotesPage ? (
          <div className="w-full max-w-3xl bg-white rounded-lg shadow-2xl flex flex-col"
            style={{ minHeight: '80vh' }}
          >
            <div className="px-6 py-3 border-b border-slate-200 text-slate-500 text-xs flex items-center justify-between">
              <span>{doc.name} — ノート</span>
              <span className="text-slate-400">自動保存</span>
            </div>
            <textarea
              ref={textareaRef}
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="ここにメモを入力…"
              className="flex-1 w-full resize-none px-6 py-4 text-slate-800 text-base leading-relaxed focus:outline-none bg-transparent placeholder:text-slate-300"
              style={{ minHeight: '70vh' }}
            />
          </div>
        ) : (
          <canvas ref={canvasRef} className="shadow-2xl bg-white" />
        )}
      </div>
    </div>
  )
}
