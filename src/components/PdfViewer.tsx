import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DocumentMeta } from '../db/db'
import { getDocumentBlob } from '../hooks/useDocuments'
import { loadPdfFromBlob } from '../lib/pdf'
import { buildPageSequence, type PageEntry } from '../lib/pageSequence'
import { useNotePages, addNotePage, saveNotePage, deleteNotePage } from '../hooks/useNotePages'
import { useImagePages, addImagePage, deleteImagePage } from '../hooks/useImagePages'
import { useAnnotation } from '../hooks/useAnnotations'
import { useUndoRedo } from '../hooks/useUndoRedo'
import AnnotationLayer from './AnnotationLayer'
import DrawingToolbar, { type DrawTool } from './DrawingToolbar'
import Tooltip from './Tooltip'
import { exportPdfWithAnnotations } from '../lib/exportPdf'
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
  const [textFontSize, setTextFontSize] = useState(16)
  const [textBold, setTextBold] = useState(false)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })
  const [exporting, setExporting] = useState(false)

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
  const textBoxes = annotation?.textBoxes ?? []
  const { undo, redo, canUndo, canRedo } = useUndoRedo(doc.id, currentPdfPageNum, annotation)

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
        if (e.target instanceof HTMLTextAreaElement) return
        if (e.key === 'Escape') setDrawMode(false)
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
          e.preventDefault()
          redo()
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
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
  }, [total, isNotePage, drawMode, onClose, undo, redo])

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
      <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 border-b border-neutral-800/50 text-[13px] whitespace-nowrap overflow-x-auto scroll-thin" style={{ background: '#141414' }}>
        <button
          onClick={onClose}
          className="px-2.5 py-1 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-neutral-800 transition text-[13px] font-medium"
        >
          完了
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
        <Tooltip label="ノート挿入" position="bottom">
          <button
            onClick={handleInsertNote}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <rect x="3" y="2" width="9" height="11" rx="1.5" />
              <path d="M5.5 5.5h4M5.5 8h2.5" />
              <circle cx="11" cy="11" r="3" fill="#141414" stroke="currentColor" strokeWidth="1.2" />
              <path d="M11 9.5v3M9.5 11h3" strokeWidth="1.2" />
            </svg>
          </button>
        </Tooltip>

        {/* Insert image page */}
        <Tooltip label="画像挿入" position="bottom">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="11" height="9" rx="1.5" />
              <circle cx="5.5" cy="6" r="1.2" />
              <path d="M2 10l3-2.5 2 1.5 2.5-2L13 10" />
              <circle cx="11" cy="11" r="3" fill="#141414" stroke="currentColor" strokeWidth="1.2" />
              <path d="M11 9.5v3M9.5 11h3" strokeWidth="1.2" />
            </svg>
          </button>
        </Tooltip>
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
          <Tooltip label="ページ削除" position="bottom">
            <button
              onClick={handleDeletePage}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800/60 text-red-500/70 hover:text-red-400 transition"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <path d="M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" />
                <path d="M2.5 4h9" />
                <path d="M5.5 2.5h3" />
                <path d="M5.5 6v4M8.5 6v4" />
              </svg>
            </button>
          </Tooltip>
        )}

        {/* Undo / Redo (only on PDF pages) */}
        {isPdfPage && (
          <>
            <Tooltip label="元に戻す (⌘Z)" position="bottom">
              <button
                onClick={undo}
                disabled={!canUndo}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                  canUndo
                    ? 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
                    : 'text-neutral-600 cursor-default'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5.5l-2.5 2 2.5 2" />
                  <path d="M1.5 7.5h8a3.5 3.5 0 010 7H7" />
                </svg>
              </button>
            </Tooltip>
            <Tooltip label="やり直す (⌘⇧Z)" position="bottom">
              <button
                onClick={redo}
                disabled={!canRedo}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                  canRedo
                    ? 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
                    : 'text-neutral-600 cursor-default'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5.5l2.5 2-2.5 2" />
                  <path d="M13.5 7.5h-8a3.5 3.5 0 000 7H8" />
                </svg>
              </button>
            </Tooltip>
          </>
        )}

        {/* Draw mode toggle (only on PDF pages) */}
        {isPdfPage && (
          <Tooltip label="ペンモード" position="bottom">
            <button
              onClick={() => setDrawMode((v) => !v)}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                drawMode
                  ? 'bg-white text-black'
                  : 'hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 2.5l3 3-7.5 7.5H1v-3l7.5-7.5z" />
                <path d="M7 4l3 3" />
              </svg>
            </button>
          </Tooltip>
        )}

        <div className="w-px h-4 bg-neutral-800 mx-0.5" />

        <Tooltip label="縮小" position="bottom">
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="5.5" cy="5.5" r="3.5" />
              <path d="M8 8l2.5 2.5" />
              <path d="M3.5 5.5h4" />
            </svg>
          </button>
        </Tooltip>
        <span className="text-neutral-600 tabular-nums w-10 text-center text-[11px]">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip label="拡大" position="bottom">
          <button
            onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="5.5" cy="5.5" r="3.5" />
              <path d="M8 8l2.5 2.5" />
              <path d="M3.5 5.5h4M5.5 3.5v4" />
            </svg>
          </button>
        </Tooltip>

        {/* Export PDF */}
        {pdf && (
          <>
            <div className="w-px h-4 bg-neutral-800 mx-0.5" />
            <Tooltip label="PDF書き出し" position="bottom">
              <button
                onClick={async () => {
                  if (exporting) return
                  setExporting(true)
                  try {
                    await exportPdfWithAnnotations(pdf, doc.id, doc.name)
                  } finally {
                    setExporting(false)
                  }
                }}
                disabled={exporting}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                  exporting
                    ? 'text-neutral-700 cursor-default'
                    : 'hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 2v7.5" />
                  <path d="M4 7l3 3 3-3" />
                  <path d="M2 11.5h10" />
                </svg>
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto scroll-thin flex items-start justify-center p-3 md:p-6 relative">
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
                textBoxes={textBoxes}
                interactive={drawMode}
                tool={drawTool}
                color={drawColor}
                width={drawWidth}
                fontSize={textFontSize}
                bold={textBold}
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
          fontSize={textFontSize}
          bold={textBold}
          onToolChange={setDrawTool}
          onColorChange={setDrawColor}
          onWidthChange={setDrawWidth}
          onFontSizeChange={setTextFontSize}
          onBoldChange={setTextBold}
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
