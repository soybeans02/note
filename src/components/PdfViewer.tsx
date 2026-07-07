import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DocumentMeta, type Stroke, type TextBox } from '../db/db'
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
  const [drawTool, setDrawTool] = useState<DrawTool>('hand')
  const [drawColor, setDrawColor] = useState('#000000')
  const [drawWidth, setDrawWidth] = useState(3)
  const [highlighterColor, setHighlighterColor] = useState('#fde047')
  const [highlighterWidth, setHighlighterWidth] = useState(18)
  const [textFontSize, setTextFontSize] = useState(16)
  const [textBold, setTextBold] = useState(false)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })
  const [exporting, setExporting] = useState(false)
  const [editingText, setEditingText] = useState(false)

  const activeColor = drawTool === 'highlighter' ? highlighterColor : drawColor
  const activeWidth = drawTool === 'highlighter' ? highlighterWidth : drawWidth

  // When a text box enters edit mode, mirror its style into the toolbar so
  // the controls show (and edit) the box's real color/size/bold.
  const handleEditingChange = useCallback(
    (editing: boolean, style?: { color: string; fontSize: number; bold: boolean }) => {
      setEditingText(editing)
      if (editing && style) {
        setDrawColor(style.color)
        setTextFontSize(style.fontSize)
        setTextBold(style.bold)
      }
    },
    [],
  )

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const pdfInsertInputRef = useRef<HTMLInputElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const noteContentRef = useRef<Map<string, string>>(new Map())
  const contentRef = useRef<HTMLDivElement>(null)

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
  const annotationPageKey = isPdfPage
    ? String(currentPdfPageNum)
    : isImagePage
      ? `img-${currentEntry.imagePageId}`
      : ''

  // Annotation for current page
  const annotation = useAnnotation(doc.id, annotationPageKey)
  const strokes = annotation?.strokes ?? []
  const textBoxes = annotation?.textBoxes ?? []
  const { undo, redo, canUndo, canRedo } = useUndoRedo(doc.id, annotationPageKey, annotation)

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
      // Fit the first page to the container width so the document opens at a
      // readable size on any screen (user can still zoom manually after).
      try {
        const p1 = await loaded.getPage(1)
        const vp = p1.getViewport({ scale: 1 })
        const containerW = contentRef.current?.clientWidth ?? window.innerWidth
        const fit = (containerW - 48) / vp.width
        if (alive && Number.isFinite(fit)) {
          setZoom(Math.max(0.4, Math.min(2.5, Math.round(fit * 20) / 20)))
        }
      } catch {
        /* keep default zoom */
      }
    })()
    return () => {
      alive = false
      loaded?.destroy()
    }
  }, [doc.id])

  // Refit the current page to the container width (zoom-% button).
  const fitToWidth = useCallback(async () => {
    if (!pdf || !isPdfPage) return
    try {
      const p = await pdf.getPage(currentPdfPageNum)
      const vp = p.getViewport({ scale: 1 })
      const containerW = contentRef.current?.clientWidth ?? window.innerWidth
      const fit = (containerW - 48) / vp.width
      if (Number.isFinite(fit)) {
        setZoom(Math.max(0.4, Math.min(2.5, Math.round(fit * 20) / 20)))
      }
    } catch {
      /* ignore */
    }
  }, [pdf, isPdfPage, currentPdfPageNum])

  // ─── Pinch / ctrl-wheel zoom, anchored at the pointer ────────────────────
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const applyZoomAt = (clientX: number, clientY: number, next: number) => {
      const prev = zoomRef.current
      const clamped = Math.max(0.4, Math.min(4, next))
      if (Math.abs(clamped - prev) < 0.001) return
      const rect = el.getBoundingClientRect()
      const cx = clientX - rect.left
      const cy = clientY - rect.top
      const ratio = clamped / prev
      // Keep the content point under the pointer stationary.
      const newScrollLeft = (el.scrollLeft + cx) * ratio - cx
      const newScrollTop = (el.scrollTop + cy) * ratio - cy
      zoomRef.current = clamped
      setZoom(clamped)
      requestAnimationFrame(() => {
        el.scrollLeft = newScrollLeft
        el.scrollTop = newScrollTop
      })
    }

    // Trackpad pinch on Chrome/Edge/Firefox arrives as ctrl+wheel;
    // cmd+wheel is a common manual-zoom convention.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.01)
      applyZoomAt(e.clientX, e.clientY, zoomRef.current * factor)
    }

    // Safari (macOS/iPadOS trackpad) fires proprietary gesture events.
    let gestureBaseZoom = 1
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      gestureBaseZoom = zoomRef.current
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const ge = e as Event & { scale?: number; clientX?: number; clientY?: number }
      if (!ge.scale) return
      const rect = el.getBoundingClientRect()
      applyZoomAt(
        ge.clientX ?? rect.left + rect.width / 2,
        ge.clientY ?? rect.top + rect.height / 2,
        gestureBaseZoom * ge.scale,
      )
    }

    // iPad two-finger pinch (touch events).
    let touchBaseDist = 0
    let touchBaseZoom = 1
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        touchBaseDist = dist(e.touches)
        touchBaseZoom = zoomRef.current
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || touchBaseDist === 0) return
      e.preventDefault()
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      applyZoomAt(midX, midY, touchBaseZoom * (dist(e.touches) / touchBaseDist))
    }
    const onTouchEnd = () => {
      touchBaseDist = 0
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGestureStart)
    el.addEventListener('gesturechange', onGestureChange)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

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

  // Leaving a page closes any text-editing state for the toolbar.
  useEffect(() => {
    setEditingText(false)
  }, [page])

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

  // Insert PDF pages as images after current page
  const handleInsertPdf = useCallback(async (file: File) => {
    const blob = new Blob([await file.arrayBuffer()], { type: file.type })
    const insertedPdf = await loadPdfFromBlob(blob)
    let firstIpId = ''
    const newImagePages: typeof imagePages = []
    for (let i = 1; i <= insertedPdf.numPages; i++) {
      const pg = await insertedPdf.getPage(i)
      const scale = 2
      const vp = pg.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')!
      await pg.render({ canvasContext: ctx, viewport: vp }).promise
      const imgBlob = await new Promise<Blob>((res) =>
        canvas.toBlob((b) => res(b!), 'image/png'),
      )
      const ipId = await addImagePage(doc.id, currentAfterPage, imgBlob)
      if (!firstIpId) firstIpId = ipId
      newImagePages.push({
        id: ipId,
        documentId: doc.id,
        afterPage: currentAfterPage,
        blob: imgBlob,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
    insertedPdf.destroy()
    if (firstIpId) {
      setTimeout(() => {
        const updated = buildPageSequence(
          pdfPages,
          notePages,
          [...imagePages, ...newImagePages],
        )
        const idx = updated.findIndex(
          (e) => e.type === 'image' && e.imagePageId === firstIpId,
        )
        if (idx >= 0) setPage(idx + 1)
      }, 50)
    }
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
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape' && isNotePage) onClose()
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
      // Single-key tool shortcuts (only when not drawing-interactive on text)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (isPdfPage || isImagePage)) {
        if (e.key === 'p') { setDrawTool('pen'); return }
        if (e.key === 'h') { setDrawTool('highlighter'); return }
        if (e.key === 'e') { setDrawTool('trace-eraser'); return }
        if (e.key === 't') { setDrawTool('text'); return }
        if (e.key === 'v' || e.key === 'Escape') {
          if (drawTool !== 'hand') { setDrawTool('hand'); return }
        }
      }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown')
        setPage((p) => Math.min(total, p + 1))
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp')
        setPage((p) => Math.max(1, p - 1))
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.2))
      else if (e.key === '-') setZoom((z) => Math.max(0.4, z - 0.2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total, isNotePage, isPdfPage, isImagePage, drawTool, onClose, undo, redo])

  const pageLabel = `${page}`

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* Top toolbar */}
      <div
        className="sticky top-0 z-30 flex-shrink-0 flex flex-wrap items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 border-b border-neutral-800/50 text-[13px]"
        style={{ background: '#141414' }}
      >
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
        <span className="text-neutral-400 tabular-nums text-xs flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={total}
            value={pageLabel}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (Number.isFinite(v)) setPage(Math.max(1, Math.min(total, v)))
            }}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-10 h-6 text-center text-xs bg-neutral-900 text-neutral-200 rounded border border-neutral-800 outline-none focus:border-neutral-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            title="ページ番号を入力してジャンプ"
          />
          <span>/ {total}</span>
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

        {/* Insert PDF pages */}
        <Tooltip label="PDF挿入" position="bottom">
          <button
            onClick={() => pdfInsertInputRef.current?.click()}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M4 2h4l4 4v7a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
              <path d="M8 2v4h4" />
              <circle cx="11" cy="11" r="3" fill="#141414" stroke="currentColor" strokeWidth="1.2" />
              <path d="M11 9.5v3M9.5 11h3" strokeWidth="1.2" />
            </svg>
          </button>
        </Tooltip>
        <input
          ref={pdfInsertInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleInsertPdf(file)
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

        {/* Undo / Redo */}
        {(isPdfPage || isImagePage) && (
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
        <Tooltip label="幅に合わせる" position="bottom">
          <button
            onClick={() => void fitToWidth()}
            className="text-neutral-600 hover:text-neutral-300 tabular-nums w-10 text-center text-[11px] rounded-md hover:bg-neutral-800 py-1 transition"
          >
            {Math.round(zoom * 100)}%
          </button>
        </Tooltip>
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
      <div
        ref={contentRef}
        className="flex-1 overflow-auto scroll-thin flex items-start justify-center p-3 md:p-6 relative"
        style={{
          overscrollBehavior: 'none',
          paddingBottom: isPdfPage || isImagePage ? 120 : undefined,
        }}
      >
        {isNotePage ? (
          <NotePageView
            notePageId={currentEntry.notePageId}
            initialContent={currentEntry.content}
            docName={doc.name}
            textareaRef={textareaRef}
            onChange={handleNotesChange}
          />
        ) : isImagePage ? (
          <ImagePageView
            blob={currentEntry.blob}
            imagePageId={currentEntry.imagePageId}
            docId={doc.id}
            pageKey={annotationPageKey}
            strokes={strokes}
            textBoxes={textBoxes}
            interactive={true}
            drawTool={drawTool}
            drawColor={activeColor}
            drawWidth={activeWidth}
            textFontSize={textFontSize}
            textBold={textBold}
            onEditingChange={handleEditingChange}
          />
        ) : isPdfPage ? (
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="shadow-2xl bg-white" />
            {canvasDims.w > 0 && (
              <AnnotationLayer
                docId={doc.id}
                pageKey={annotationPageKey}
                strokes={strokes}
                textBoxes={textBoxes}
                interactive={true}
                tool={drawTool}
                color={activeColor}
                width={activeWidth}
                fontSize={textFontSize}
                bold={textBold}
                canvasWidth={canvasDims.w}
                canvasHeight={canvasDims.h}
                onEditingChange={handleEditingChange}
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

      {/* Drawing toolbar — always shown on PDF/image pages */}
      {(isPdfPage || isImagePage) && (
        <DrawingToolbar
          tool={drawTool}
          color={drawColor}
          width={drawWidth}
          highlighterColor={highlighterColor}
          highlighterWidth={highlighterWidth}
          fontSize={textFontSize}
          bold={textBold}
          editingText={editingText}
          onToolChange={setDrawTool}
          onColorChange={setDrawColor}
          onWidthChange={setDrawWidth}
          onHighlighterColorChange={setHighlighterColor}
          onHighlighterWidthChange={setHighlighterWidth}
          onFontSizeChange={setTextFontSize}
          onBoldChange={setTextBold}
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

function ImagePageView({
  blob,
  imagePageId,
  docId,
  pageKey,
  strokes,
  textBoxes,
  interactive,
  drawTool,
  drawColor,
  drawWidth,
  textFontSize,
  textBold,
  onEditingChange,
}: {
  blob: Blob
  imagePageId: string
  docId: string
  pageKey: string
  strokes: Stroke[]
  textBoxes: TextBox[]
  interactive: boolean
  drawTool: DrawTool
  drawColor: string
  drawWidth: number
  textFontSize: number
  textBold: boolean
  onEditingChange?: (
    editing: boolean,
    style?: { color: string; fontSize: number; bold: boolean },
  ) => void
}) {
  const [url, setUrl] = useState('')
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let cancelled = false
    let objUrl = ''
    ;(async () => {
      let real = blob
      // Placeholder blob from a synced row — lazily pull from S3.
      if (!real || real.size === 0) {
        const { downloadImagePageBlob } = await import('../lib/syncEngine')
        const fetched = await downloadImagePageBlob(imagePageId)
        if (fetched) real = fetched
      }
      if (cancelled || !real || real.size === 0) return
      objUrl = URL.createObjectURL(real)
      setUrl(objUrl)
    })()
    return () => {
      cancelled = true
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [blob, imagePageId])

  const handleLoad = useCallback(() => {
    if (imgRef.current) {
      setDims({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight })
    }
  }, [])

  if (!url) return null

  return (
    <div className="relative inline-block">
      <img
        ref={imgRef}
        src={url}
        alt="挿入画像"
        className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg"
        onLoad={handleLoad}
      />
      {dims.w > 0 && (
        <AnnotationLayer
          docId={docId}
          pageKey={pageKey}
          strokes={strokes}
          textBoxes={textBoxes}
          interactive={interactive}
          tool={drawTool}
          color={drawColor}
          width={drawWidth}
          fontSize={textFontSize}
          bold={textBold}
          canvasWidth={dims.w}
          canvasHeight={dims.h}
          onEditingChange={onEditingChange}
        />
      )}
    </div>
  )
}
