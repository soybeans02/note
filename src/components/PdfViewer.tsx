import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DocumentMeta } from '../db/db'
import { getDocumentBlob } from '../hooks/useDocuments'
import { loadPdfFromBlob } from '../lib/pdf'
import { buildPageSequence, type PageEntry } from '../lib/pageSequence'
import { useNotePages, addNotePage, saveNotePage, deleteNotePage } from '../hooks/useNotePages'
import { useAnnotation } from '../hooks/useAnnotations'
import AnnotationLayer from './AnnotationLayer'
import DrawingToolbar from './DrawingToolbar'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface Props {
  doc: DocumentMeta
  onClose: () => void
}

export default function PdfViewer({ doc, onClose }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1.2)
  const [drawMode, setDrawMode] = useState(false)
  const [drawTool, setDrawTool] = useState<'pen' | 'eraser'>('pen')
  const [drawColor, setDrawColor] = useState('#000000')
  const [drawWidth, setDrawWidth] = useState(4)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const noteContentRef = useRef<Map<string, string>>(new Map())

  const pdfPages = pdf?.numPages ?? doc.pageCount
  const notePages = useNotePages(doc.id)

  const pageSequence = useMemo(
    () => buildPageSequence(pdfPages, notePages),
    [pdfPages, notePages],
  )

  const total = pageSequence.length
  const currentEntry: PageEntry | undefined = pageSequence[page - 1]
  const isPdfPage = currentEntry?.type === 'pdf'
  const isNotePage = currentEntry?.type === 'note'
  const currentPdfPageNum = isPdfPage ? currentEntry.pdfPageNum : 0

  // Annotation for current PDF page
  const annotation = useAnnotation(doc.id, currentPdfPageNum)
  const strokes = annotation?.strokes ?? []

  // Load PDF
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
    if (!pdf || !canvasRef.current || !isPdfPage) return
    if (currentPdfPageNum > pdf.numPages) return
    let cancelled = false
    ;(async () => {
      const p = await pdf.getPage(currentPdfPageNum)
      if (cancelled) return
      const dpr = window.devicePixelRatio || 1
      const viewport = p.getViewport({ scale: zoom * dpr })
      const canvas = canvasRef.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      const cssW = viewport.width / dpr
      const cssH = viewport.height / dpr
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      setCanvasDims({ w: cssW, h: cssH })
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
  }, [pdf, page, zoom, isPdfPage, currentPdfPageNum])

  // Focus textarea on note page
  useEffect(() => {
    if (isNotePage) textareaRef.current?.focus()
  }, [isNotePage])

  // Debounced note save
  const handleNotesChange = useCallback(
    (notePageId: string, value: string) => {
      noteContentRef.current.set(notePageId, value)
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveNotePage(notePageId, value)
      }, 500)
    },
    [],
  )

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current)
      for (const [id, content] of noteContentRef.current) {
        saveNotePage(id, content)
      }
    }
  }, [])

  // Insert note after current PDF page
  const handleInsertNote = useCallback(async () => {
    const afterPage = isPdfPage ? currentPdfPageNum : 0
    const npId = await addNotePage(doc.id, afterPage)
    // Find the new page in sequence after re-render
    // We need to wait for notePages to update via live query, then jump
    // Use a small timeout to let the live query propagate
    setTimeout(() => {
      // Find the inserted note in the updated sequence
      const updated = buildPageSequence(pdfPages, [
        ...notePages,
        {
          id: npId,
          documentId: doc.id,
          afterPage,
          content: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ])
      const idx = updated.findIndex(
        (e) => e.type === 'note' && e.notePageId === npId,
      )
      if (idx >= 0) setPage(idx + 1)
    }, 50)
  }, [isPdfPage, currentPdfPageNum, doc.id, pdfPages, notePages])

  // Delete current note page
  const handleDeleteNotePage = useCallback(() => {
    if (!isNotePage || !currentEntry) return
    const notePageId = currentEntry.notePageId
    if (!confirm('このノートページを削除しますか？')) return
    noteContentRef.current.delete(notePageId)
    deleteNotePage(notePageId)
    setPage((p) => Math.max(1, p - 1))
  }, [isNotePage, currentEntry])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept keys when typing in textarea
      if (isNotePage && e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') onClose()
        return
      }
      // Don't intercept when in draw mode
      if (drawMode) {
        if (e.key === 'Escape') setDrawMode(false)
        return
      }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ')
        setPage((p) => Math.min(total, p + 1))
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp')
        setPage((p) => Math.max(1, p - 1))
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.2))
      else if (e.key === '-') setZoom((z) => Math.max(0.4, z - 0.2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total, isNotePage, drawMode, onClose])

  const pageLabel = isNotePage ? 'ノート' : isPdfPage ? `${currentPdfPageNum}` : '—'

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col">
      {/* Top toolbar */}
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
          {pageLabel} / {total}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(total, p + 1))}
          className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300"
        >
          ▶
        </button>

        {/* Insert note page */}
        <button
          onClick={handleInsertNote}
          className="px-2.5 py-1 rounded text-xs hover:bg-slate-800 text-slate-400"
          title="ノートページを挿入"
        >
          +ノート
        </button>

        {/* Delete note page (only when on a note page) */}
        {isNotePage && (
          <button
            onClick={handleDeleteNotePage}
            className="px-2.5 py-1 rounded text-xs hover:bg-red-900/50 text-red-400"
            title="このノートページを削除"
          >
            削除
          </button>
        )}

        {/* Draw mode toggle (only on PDF pages) */}
        {isPdfPage && (
          <button
            onClick={() => setDrawMode((v) => !v)}
            className={`px-2.5 py-1 rounded text-xs ${
              drawMode
                ? 'bg-sky-600 text-white'
                : 'hover:bg-slate-800 text-slate-400'
            }`}
            title="ペンモード"
          >
            ペン
          </button>
        )}

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

      {/* Content area */}
      <div className="flex-1 overflow-auto scroll-thin flex items-start justify-center p-6 relative">
        {isNotePage ? (
          <NotePageView
            notePageId={currentEntry.notePageId}
            initialContent={currentEntry.content}
            docName={doc.name}
            textareaRef={textareaRef}
            onChange={handleNotesChange}
          />
        ) : isPdfPage ? (
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="shadow-2xl bg-white" />
            {canvasDims.w > 0 && (
              <AnnotationLayer
                docId={doc.id}
                pageNum={currentPdfPageNum}
                strokes={strokes}
                interactive={drawMode}
                tool={drawTool}
                color={drawColor}
                width={drawWidth}
                canvasWidth={canvasDims.w}
                canvasHeight={canvasDims.h}
              />
            )}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-4 text-slate-500">
            <span>ページがありません</span>
            <button
              onClick={handleInsertNote}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-500"
            >
              +ノートを追加
            </button>
          </div>
        ) : (
          <div className="text-slate-500">読み込み中…</div>
        )}
      </div>

      {/* Drawing toolbar */}
      {drawMode && isPdfPage && (
        <DrawingToolbar
          tool={drawTool}
          color={drawColor}
          width={drawWidth}
          onToolChange={setDrawTool}
          onColorChange={setDrawColor}
          onWidthChange={setDrawWidth}
          onDone={() => setDrawMode(false)}
        />
      )}
    </div>
  )
}

function NotePageView({
  notePageId,
  initialContent,
  docName,
  textareaRef,
  onChange,
}: {
  notePageId: string
  initialContent: string
  docName: string
  textareaRef: React.Ref<HTMLTextAreaElement>
  onChange: (id: string, content: string) => void
}) {
  const [text, setText] = useState(initialContent)
  const idRef = useRef(notePageId)

  // Reset text when switching to a different note page
  useEffect(() => {
    if (idRef.current !== notePageId) {
      idRef.current = notePageId
      setText(initialContent)
    }
  }, [notePageId, initialContent])

  return (
    <div
      className="w-full max-w-3xl bg-white rounded-lg shadow-2xl flex flex-col"
      style={{ minHeight: '80vh' }}
    >
      <div className="px-6 py-3 border-b border-slate-200 text-slate-500 text-xs flex items-center justify-between">
        <span>{docName} — ノート</span>
        <span className="text-slate-400">自動保存</span>
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(notePageId, e.target.value)
        }}
        placeholder="ここにメモを入力…"
        className="flex-1 w-full resize-none px-6 py-4 text-slate-800 text-base leading-relaxed focus:outline-none bg-transparent placeholder:text-slate-300"
        style={{ minHeight: '70vh' }}
      />
    </div>
  )
}
