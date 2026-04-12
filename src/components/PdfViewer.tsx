import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DocumentMeta } from '../db/db'
import { getDocumentBlob } from '../hooks/useDocuments'
import { loadPdfFromBlob } from '../lib/pdf'
import { buildPageSequence, type PageEntry } from '../lib/pageSequence'
import { useNotePages, addNotePage, saveNotePage, deleteNotePage } from '../hooks/useNotePages'
import { useImagePages, addImagePage, deleteImagePage } from '../hooks/useImagePages'
import { useAnnotation } from '../hooks/useAnnotations'
import AnnotationLayer from './AnnotationLayer'
import DrawingToolbar, { type DrawTool } from './DrawingToolbar'
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
  const [drawTool, setDrawTool] = useState<DrawTool>('pen')
  const [drawColor, setDrawColor] = useState('#000000')
  const [drawWidth, setDrawWidth] = useState(4)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const noteContentRef = useRef<Map<string, string>>(new Map())

  const pdfPages = pdf?.numPages ?? doc.pageCount
  const notePages = useNotePages(doc.id)
  const imagePages = useImagePages(doc.id)

  const pageSequence = useMemo(
    () => buildPageSequence(pdfPages, notePages, imagePages),
    [pdfPages, notePages, imagePages],
  )

  const total = pageSequence.length
  const currentEntry: PageEntry | undefined = pageSequence[page - 1]
  const isPdfPage = currentEntry?.type === 'pdf'
  const isNotePage = currentEntry?.type === 'note'
  const isImagePage = currentEntry?.type === 'image'
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

  // Get current afterPage for inserting
  const currentAfterPage = isPdfPage
    ? currentPdfPageNum
    : isNotePage || isImagePage
      ? (() => {
          // Find the last PDF page before current position
          for (let i = page - 2; i >= 0; i--) {
            const e = pageSequence[i]
            if (e.type === 'pdf') return e.pdfPageNum
          }
          return 0
        })()
      : 0

  // Insert note after current page
  const handleInsertNote = useCallback(async () => {
    const npId = await addNotePage(doc.id, currentAfterPage)
    setTimeout(() => {
      const updated = buildPageSequence(
        pdfPages,
        [
          ...notePages,
          {
            id: npId,
            documentId: doc.id,
            afterPage: currentAfterPage,
            content: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        imagePages,
      )
      const idx = updated.findIndex(
        (e) => e.type === 'note' && e.notePageId === npId,
      )
      if (idx >= 0) setPage(idx + 1)
    }, 50)
  }, [currentAfterPage, doc.id, pdfPages, notePages, imagePages])

  // Insert image after current page
  const handleInsertImage = useCallback(async (file: File) => {
    const blob = new Blob([await file.arrayBuffer()], { type: file.type })
    const ipId = await addImagePage(doc.id, currentAfterPage, blob)
    setTimeout(() => {
      const updated = buildPageSequence(
        pdfPages,
        notePages,
        [
          ...imagePages,
          {
            id: ipId,
            documentId: doc.id,
            afterPage: currentAfterPage,
            blob,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      )
      const idx = updated.findIndex(
        (e) => e.type === 'image' && e.imagePageId === ipId,
      )
      if (idx >= 0) setPage(idx + 1)
    }, 50)
  }, [currentAfterPage, doc.id, pdfPages, notePages, imagePages])

  // Delete current note/image page
  const handleDeletePage = useCallback(() => {
    if (isNotePage && currentEntry) {
      if (!confirm('このノートページを削除しますか？')) return
      noteContentRef.current.delete(currentEntry.notePageId)
      deleteNotePage(currentEntry.notePageId)
      setPage((p) => Math.max(1, p - 1))
    } else if (isImagePage && currentEntry) {
      if (!confirm('この画像ページを削除しますか？')) return
      deleteImagePage(currentEntry.imagePageId)
      setPage((p) => Math.max(1, p - 1))
    }
  }, [isNotePage, isImagePage, currentEntry])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNotePage && e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') onClose()
        return
      }
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

  const pageLabel = isNotePage
    ? 'ノート'
    : isImagePage
      ? '画像'
      : isPdfPage
        ? `${currentPdfPageNum}`
        : '—'

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0a0a0a' }}>
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800/50 text-[13px] whitespace-nowrap" style={{ background: '#141414' }}>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition"
          title="閉じる (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
        <div className="flex-1 truncate text-white text-sm px-1">{doc.name}</div>

        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2L4 6l4 4" />
          </svg>
        </button>
        <span className="text-neutral-400 tabular-nums text-xs min-w-[60px] text-center">
          {pageLabel} / {total}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(total, p + 1))}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2l4 4-4 4" />
          </svg>
        </button>

        <div className="w-px h-4 bg-neutral-800 mx-0.5" />

        {/* Insert note page */}
        <button
          onClick={handleInsertNote}
          className="h-7 px-2 rounded-md text-[11px] hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
          title="ノートページを挿入"
        >
          +ノート
        </button>

        {/* Insert image page */}
        <button
          onClick={() => imageInputRef.current?.click()}
          className="h-7 px-2 rounded-md text-[11px] hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
          title="画像ページを挿入"
        >
          +画像
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleInsertImage(file)
            e.target.value = ''
          }}
        />

        {/* Delete note/image page */}
        {(isNotePage || isImagePage) && (
          <button
            onClick={handleDeletePage}
            className="h-7 px-2 rounded-md text-[11px] hover:bg-red-950/60 text-red-500/70 hover:text-red-400 transition"
            title="このページを削除"
          >
            削除
          </button>
        )}

        {/* Draw mode toggle (only on PDF pages) */}
        {isPdfPage && (
          <button
            onClick={() => setDrawMode((v) => !v)}
            className={`h-7 px-2.5 rounded-md text-[11px] transition ${
              drawMode
                ? 'bg-white text-black'
                : 'hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200'
            }`}
            title="ペンモード"
          >
            ペン
          </button>
        )}

        <div className="w-px h-4 bg-neutral-800 mx-0.5" />

        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition text-sm"
        >
          −
        </button>
        <span className="text-neutral-600 tabular-nums w-10 text-center text-[11px]">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition text-sm"
        >
          +
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
        ) : isImagePage ? (
          <ImagePageView blob={currentEntry.blob} />
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
          <div className="flex flex-col items-center gap-4 text-neutral-600">
            <span className="text-sm">ページがありません</span>
            <button
              onClick={handleInsertNote}
              className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700 transition"
            >
              +ノートを追加
            </button>
          </div>
        ) : (
          <div className="text-neutral-600 text-sm">読み込み中…</div>
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

  useEffect(() => {
    if (idRef.current !== notePageId) {
      idRef.current = notePageId
      setText(initialContent)
    }
  }, [notePageId, initialContent])

  return (
    <div
      className="w-full max-w-3xl bg-neutral-900 border border-neutral-800/50 rounded-xl shadow-2xl flex flex-col"
      style={{ minHeight: '80vh' }}
    >
      <div className="px-5 py-2.5 border-b border-neutral-800/60 text-[11px] flex items-center justify-between">
        <span className="text-neutral-600">{docName} — ノート</span>
        <span className="text-neutral-700">自動保存</span>
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(notePageId, e.target.value)
        }}
        placeholder="ここにメモを入力…"
        className="flex-1 w-full resize-none px-5 py-4 text-neutral-200 text-[15px] leading-relaxed focus:outline-none bg-transparent placeholder:text-neutral-700"
        style={{ minHeight: '70vh' }}
      />
    </div>
  )
}

function ImagePageView({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const objUrl = URL.createObjectURL(blob)
    setUrl(objUrl)
    return () => URL.revokeObjectURL(objUrl)
  }, [blob])

  if (!url) return null

  return (
    <img
      src={url}
      alt="挿入画像"
      className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg"
    />
  )
}
