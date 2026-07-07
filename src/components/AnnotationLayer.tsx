import { useCallback, useEffect, useRef, useState } from 'react'
import getStroke from 'perfect-freehand'
import { uid, type Stroke, type TextBox } from '../db/db'
import { addStroke, removeStroke, traceEraseAt, addTextBox, updateTextBox, removeTextBox } from '../hooks/useAnnotations'
import type { DrawTool } from './DrawingToolbar'

interface Props {
  docId: string
  pageKey: string
  strokes: Stroke[]
  textBoxes: TextBox[]
  interactive: boolean
  tool: DrawTool
  color: string
  width: number
  fontSize: number
  bold: boolean
  canvasWidth: number
  canvasHeight: number
  /** Notifies the parent when a text box enters/leaves edit mode. On entry the
   *  box's own style is passed so the toolbar can mirror it — otherwise the
   *  toolbar shows stale global values and clicking the "already selected"
   *  color/size does nothing. */
  onEditingChange?: (
    editing: boolean,
    style?: { color: string; fontSize: number; bold: boolean },
  ) => void
}

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

function strokeOptions(stroke: { width: number; tool?: 'pen' | 'highlighter' }, w: number, h: number) {
  const scale = Math.min(w, h) / 500
  if (stroke.tool === 'highlighter') {
    return {
      size: stroke.width * scale,
      thinning: 0,
      smoothing: 0.4,
      streamline: 0.5,
      simulatePressure: false,
    }
  }
  return {
    size: stroke.width * scale,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  }
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  const scaledPoints = stroke.points.map(
    ([x, y, p]) => [x * w, y * h, p] as [number, number, number],
  )
  const outlinePoints = getStroke(scaledPoints, strokeOptions(stroke, w, h))
  const path = new Path2D(getSvgPathFromStroke(outlinePoints))
  ctx.save()
  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.35
    ctx.globalCompositeOperation = 'multiply'
  }
  ctx.fillStyle = stroke.color
  ctx.fill(path)
  ctx.restore()
}

function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h)
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, w, h)
  }
}

type DragState = {
  type: 'move' | 'resize'
  tbId: string
  startX: number
  startY: number
  origX: number
  origY: number
  origWidth?: number
  origHeight?: number
  moved: boolean
}

export default function AnnotationLayer({
  docId,
  pageKey,
  strokes,
  textBoxes,
  interactive,
  tool,
  color,
  width,
  fontSize,
  bold,
  canvasWidth,
  canvasHeight,
  onEditingChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const pointsRef = useRef<[number, number, number][]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Drag-to-create box (text tool)
  const drawStartRef = useRef<{ x: number; y: number } | null>(null)
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // Set true on the mouseup that ends a move/resize drag, so the click that
  // follows doesn't open the editor.
  const suppressClickRef = useRef(false)

  // Tell the parent whether a text box is being edited. On entry, hand the
  // box's own style up so the toolbar mirrors it (color/size/bold shown match
  // the box being edited, not whatever the pen was last set to).
  useEffect(() => {
    if (editingId === null) {
      onEditingChange?.(false)
      return
    }
    const box = textBoxes.find((t) => t.id === editingId)
    onEditingChange?.(
      true,
      box
        ? { color: box.color, fontSize: box.fontSize, bold: box.bold ?? false }
        : undefined,
    )
    // textBoxes intentionally omitted: only fire when the edit target changes,
    // not on every keystroke-driven row update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, onEditingChange])

  // Commit any pending edit and clear selection when tool/page changes
  const editingIdRef = useRef<string | null>(null)
  const editingTextRef = useRef('')
  useEffect(() => { editingIdRef.current = editingId }, [editingId])
  useEffect(() => { editingTextRef.current = editingText }, [editingText])
  useEffect(() => {
    const id = editingIdRef.current
    if (id) {
      const text = editingTextRef.current
      if (text.trim() === '') removeTextBox(docId, pageKey, id)
      else updateTextBox(docId, pageKey, id, { text })
    }
    setEditingId(null)
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, tool])

  // Apply toolbar style changes to the actively edited (or selected) text box.
  // Baseline resets when the edit target changes, so the run caused by
  // switching boxes never writes stale toolbar values into the new box; after
  // the parent mirrors the box style into the toolbar, only real user changes
  // produce a diff. Values already matching the box are skipped to avoid
  // no-op writes (each write bumps updatedAt and triggers a sync push).
  const activeTextBoxId = editingId ?? selectedId
  const activeIsEditing = editingId !== null
  const prevStyleRef = useRef({ color, fontSize, bold })
  const styleTargetRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeTextBoxId) {
      styleTargetRef.current = null
      return
    }
    if (!activeIsEditing && tool !== 'text') return
    if (styleTargetRef.current !== activeTextBoxId) {
      // New target: reset the baseline, don't write anything yet.
      styleTargetRef.current = activeTextBoxId
      prevStyleRef.current = { color, fontSize, bold }
      return
    }
    const prev = prevStyleRef.current
    prevStyleRef.current = { color, fontSize, bold }
    const box = textBoxes.find((t) => t.id === activeTextBoxId)
    if (!box) return
    const updates: Partial<TextBox> = {}
    if (color !== prev.color && color !== box.color) updates.color = color
    if (fontSize !== prev.fontSize && fontSize !== box.fontSize) updates.fontSize = fontSize
    if (bold !== prev.bold && bold !== (box.bold ?? false)) updates.bold = bold
    if (Object.keys(updates).length > 0) {
      updateTextBox(docId, pageKey, activeTextBoxId, updates)
    }
    // textBoxes omitted: row updates (e.g. typing) shouldn't re-run the diff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, fontSize, bold, activeTextBoxId, activeIsEditing, tool, docId, pageKey])

  // Render existing strokes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderStrokes(ctx, strokes, canvas.width, canvas.height)
  }, [strokes, canvasWidth, canvasHeight])

  const normalizePoint = useCallback(
    (e: React.PointerEvent): [number, number, number] => {
      const rect = canvasRef.current!.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      const pressure = e.pressure || 0.5
      return [x, y, pressure]
    },
    [],
  )

  const findStrokeAt = useCallback(
    (nx: number, ny: number): Stroke | undefined => {
      const threshold = 0.03
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i]
        for (const [px, py] of s.points) {
          const dx = px - nx
          const dy = py - ny
          if (dx * dx + dy * dy < threshold * threshold) {
            return s
          }
        }
      }
      return undefined
    },
    [strokes],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return
      if (tool === 'text' || tool === 'hand') return
      // Touch never draws — leaves 1-finger/2-finger gestures for scrolling
      if (e.pointerType === 'touch') return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      const pt = normalizePoint(e)

      if (tool === 'object-eraser') {
        const hit = findStrokeAt(pt[0], pt[1])
        if (hit) removeStroke(docId, pageKey, hit.id)
        return
      }

      if (tool === 'trace-eraser') {
        traceEraseAt(docId, pageKey, pt[0], pt[1])
        return
      }

      drawingRef.current = true
      pointsRef.current = [pt]
    },
    [interactive, tool, docId, pageKey, normalizePoint, findStrokeAt],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return
      if (e.pointerType === 'touch') return

      if (tool === 'object-eraser') {
        if (e.buttons > 0) {
          const pt = normalizePoint(e)
          const hit = findStrokeAt(pt[0], pt[1])
          if (hit) removeStroke(docId, pageKey, hit.id)
        }
        return
      }

      if (tool === 'trace-eraser') {
        if (e.buttons > 0) {
          const pt = normalizePoint(e)
          traceEraseAt(docId, pageKey, pt[0], pt[1])
        }
        return
      }

      if (!drawingRef.current) return
      e.preventDefault()
      const pt = normalizePoint(e)
      pointsRef.current.push(pt)

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = canvas.width
      const h = canvas.height
      renderStrokes(ctx, strokes, w, h)
      const liveStroke: Stroke = {
        id: '',
        points: pointsRef.current,
        color,
        width,
        tool: tool === 'highlighter' ? 'highlighter' : 'pen',
      }
      drawStroke(ctx, liveStroke, w, h)
    },
    [interactive, tool, docId, pageKey, normalizePoint, findStrokeAt, strokes, color, width],
  )

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (pointsRef.current.length < 2) return
    const stroke: Stroke = {
      id: uid(),
      points: pointsRef.current,
      color,
      width,
      tool: tool === 'highlighter' ? 'highlighter' : 'pen',
    }
    pointsRef.current = []
    addStroke(docId, pageKey, stroke)
  }, [docId, pageKey, color, width, tool])

  // Commit text edit. Persist the box WIDTH so the static display wraps text
  // exactly like the editor did (otherwise an auto box collapses to one long
  // line on deselect). Fixed-height boxes also persist their height.
  const commitTextEdit = useCallback(
    (tbId: string, text: string) => {
      if (text.trim() === '') {
        removeTextBox(docId, pageKey, tbId)
      } else {
        const patch: Partial<TextBox> = { text }
        const ta = textareaRef.current
        const box = textBoxes.find((t) => t.id === tbId)
        if (ta && canvasWidth > 0) {
          patch.width = ta.offsetWidth / canvasWidth
          if (box?.height && canvasHeight > 0) {
            patch.height = ta.offsetHeight / canvasHeight
          }
        }
        updateTextBox(docId, pageKey, tbId, patch)
      }
      setEditingId(null)
      setEditingText('')
    },
    [docId, pageKey, textBoxes, canvasWidth, canvasHeight],
  )

  // Text tool: drag to draw a sized box, or tap to drop an auto-grow box.
  useEffect(() => {
    if (!interactive || tool !== 'text') return
    const norm = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return null
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      }
    }
    const onMove = (e: MouseEvent) => {
      const start = drawStartRef.current
      if (!start) return
      const p = norm(e)
      if (!p) return
      setDrawRect({
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x),
        h: Math.abs(p.y - start.y),
      })
    }
    const onUp = (e: MouseEvent) => {
      const start = drawStartRef.current
      if (!start) return
      drawStartRef.current = null
      setDrawRect(null)
      const p = norm(e)
      if (!p) return
      const x = Math.min(start.x, p.x)
      const y = Math.min(start.y, p.y)
      const w = Math.abs(p.x - start.x)
      const h = Math.abs(p.y - start.y)
      const id = uid()
      const tb: TextBox =
        w > 0.02 && h > 0.02
          ? { id, x, y, width: w, height: h, text: '', color, fontSize, bold }
          : { id, x: start.x, y: start.y, text: '', color, fontSize, bold }
      addTextBox(docId, pageKey, tb)
      setSelectedId(null)
      setEditingId(id)
      setEditingText('')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [interactive, tool, color, fontSize, bold, docId, pageKey])

  // Click on background to commit edit / deselect
  const handleBgClick = useCallback(() => {
    if (editingId) commitTextEdit(editingId, editingText)
    if (selectedId) setSelectedId(null)
  }, [editingId, editingText, commitTextEdit, selectedId])

  // Drag move/resize handlers (attached to window)
  useEffect(() => {
    // Generous threshold: trackpad taps and touch often wobble a few px, and
    // crossing it both nudges the box AND suppresses the tap-to-edit click.
    const DRAG_THRESHOLD = 6
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const totalDx = e.clientX - drag.startX
      const totalDy = e.clientY - drag.startY
      if (!drag.moved && Math.abs(totalDx) < DRAG_THRESHOLD && Math.abs(totalDy) < DRAG_THRESHOLD) return
      drag.moved = true
      e.preventDefault()
      if (drag.type === 'move') {
        const newX = Math.max(0, Math.min(1, drag.origX + totalDx / canvasWidth))
        const newY = Math.max(0, Math.min(1, drag.origY + totalDy / canvasHeight))
        updateTextBox(docId, pageKey, drag.tbId, { x: newX, y: newY })
      } else if (drag.type === 'resize') {
        const baseW = drag.origWidth ?? 0.2
        const baseH = drag.origHeight ?? 0.1
        const newW = Math.max(0.05, Math.min(1, baseW + totalDx / canvasWidth))
        const newH = Math.max(0.04, Math.min(1, baseH + totalDy / canvasHeight))
        updateTextBox(docId, pageKey, drag.tbId, { width: newW, height: newH })
      }
    }
    const onUp = () => {
      if (dragRef.current?.moved) {
        suppressClickRef.current = true
        // The browser fires the click right after mouseup; clear afterwards so
        // a drag that ends OUTSIDE the box (whose click lands elsewhere) can't
        // leave the flag armed and swallow the user's next tap.
        setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [docId, pageKey, canvasWidth, canvasHeight])

  // Keyboard: Delete/Backspace removes selected box (when not editing)
  useEffect(() => {
    if (!selectedId || editingId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeTextBox(docId, pageKey, selectedId)
        setSelectedId(null)
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      } else if (e.key === 'Enter' || e.key === 'F2') {
        const tb = textBoxes.find((t) => t.id === selectedId)
        if (tb) {
          e.preventDefault()
          setEditingId(tb.id)
          setEditingText(tb.text)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, editingId, docId, pageKey, textBoxes])

  // Auto-grow editing textarea — only for boxes WITHOUT an explicit height.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const box = textBoxes.find((t) => t.id === editingId)
    if (box?.height) return // fixed-height box — keep its size, let it scroll
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [editingText, editingId, textBoxes])

  // Click outside to deselect/commit (window-level). The drawing toolbar is
  // NOT "outside": clicking a color/size control must keep the editor open,
  // otherwise the style change has nothing to apply to.
  useEffect(() => {
    if (!selectedId && !editingId) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-textbox]')) return
      if (target.closest('[data-text-overlay]')) return
      if (target.closest('[data-drawing-toolbar]')) return
      if (editingId) commitTextEdit(editingId, editingText)
      else if (selectedId) setSelectedId(null)
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [selectedId, editingId, editingText, commitTextEdit])

  const dpr = window.devicePixelRatio || 1
  const isTextTool = tool === 'text'
  const scale = Math.min(canvasWidth, canvasHeight) / 500

  const textBoxClickable = interactive && (tool === 'hand' || tool === 'text' || tool === 'object-eraser')
  const isHandTool = tool === 'hand'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
      }}
    >
      {/* Stroke canvas */}
      <canvas
        ref={canvasRef}
        width={canvasWidth * dpr}
        height={canvasHeight * dpr}
        onClick={handleBgClick}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasWidth,
          height: canvasHeight,
          pointerEvents: interactive && !isTextTool && !isHandTool ? 'auto' : 'none',
          cursor: interactive && !isTextTool && !isHandTool ? 'crosshair' : 'default',
          // Touch always scrolls — pen/mouse always draw. Pointer events still fire for pen.
          touchAction: 'auto',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Text boxes */}
      {textBoxes.map((tb) => {
        const isEditing = editingId === tb.id
        const isSelected = selectedId === tb.id
        const left = tb.x * canvasWidth
        const top = tb.y * canvasHeight
        const fs = tb.fontSize * scale
        const tbWidth = tb.width ? tb.width * canvasWidth : undefined
        const tbHeight = tb.height ? tb.height * canvasHeight : undefined
        const padding = Math.max(2, fs * 0.15)

        if (isEditing) {
          return (
            <div
              key={tb.id}
              data-textbox={tb.id}
              style={{
                position: 'absolute',
                left,
                top,
                zIndex: 10,
                pointerEvents: 'auto',
              }}
            >
              <textarea
                ref={textareaRef}
                autoFocus
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={(e) => {
                  // Focus moving into the drawing toolbar (font-size input,
                  // color dots on browsers that focus buttons) must not end
                  // the edit — the user is restyling this very box.
                  const to = e.relatedTarget as HTMLElement | null
                  if (to && to.closest('[data-drawing-toolbar]')) return
                  commitTextEdit(tb.id, editingText)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
                    e.preventDefault()
                    commitTextEdit(tb.id, editingText)
                  }
                  e.stopPropagation()
                }}
                style={{
                  display: 'block',
                  width: tbWidth ?? Math.max(120, fs * 6),
                  height: tbHeight,
                  fontSize: fs,
                  fontWeight: tb.bold ? 700 : 400,
                  color: tb.color,
                  minHeight: fs * 1.4 + padding * 2,
                  background: 'rgba(255,255,255,0.92)',
                  border: '1.5px dashed #3b82f6',
                  borderRadius: 4,
                  padding: `${padding}px ${padding * 1.5}px`,
                  outline: 'none',
                  resize: 'both',
                  overflow: tbHeight ? 'auto' : 'hidden',
                  lineHeight: 1.4,
                  fontFamily: 'sans-serif',
                  boxSizing: 'border-box',
                }}
              />
              {/* Delete-while-editing — no need to switch to the eraser */}
              <button
                onMouseDown={(e) => {
                  // Keep the textarea focused so blur-commit doesn't race us.
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  removeTextBox(docId, pageKey, tb.id)
                  setEditingId(null)
                  setEditingText('')
                }}
                title="このテキストを削除"
                style={{
                  position: 'absolute',
                  top: -12,
                  right: -12,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: 'white',
                  border: '2px solid white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2.5 3.5h7M5 3.5V2.5h2v1M3.5 3.5l.5 6a1 1 0 001 1h2a1 1 0 001-1l.5-6" />
                </svg>
              </button>
            </div>
          )
        }

        const startMove = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          dragRef.current = {
            type: 'move',
            tbId: tb.id,
            startX: e.clientX,
            startY: e.clientY,
            origX: tb.x,
            origY: tb.y,
            moved: false,
          }
        }
        const startResize = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          const boxEl = (e.currentTarget as HTMLElement).parentElement
          const origWidth =
            tb.width ?? (boxEl && canvasWidth ? boxEl.offsetWidth / canvasWidth : 0.2)
          const origHeight =
            tb.height ?? (boxEl && canvasHeight ? boxEl.offsetHeight / canvasHeight : 0.1)
          dragRef.current = {
            type: 'resize',
            tbId: tb.id,
            startX: e.clientX,
            startY: e.clientY,
            origX: tb.x,
            origY: tb.y,
            origWidth,
            origHeight,
            moved: false,
          }
        }

        return (
          <div
            key={tb.id}
            data-textbox={tb.id}
            onMouseDown={(e) => {
              if (!textBoxClickable) return
              if (tool === 'object-eraser') return
              // Begin a potential move drag. A real drag moves the box; a tap
              // (no movement) falls through to onClick and opens the editor.
              startMove(e)
            }}
            onClick={(e) => {
              if (!textBoxClickable) return
              e.stopPropagation()
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              if (tool === 'object-eraser') {
                removeTextBox(docId, pageKey, tb.id)
                return
              }
              // Single tap on the text → re-edit (hand or text tool).
              setSelectedId(null)
              setEditingId(tb.id)
              setEditingText(tb.text)
            }}
            style={{
              position: 'absolute',
              left,
              top,
              width: tbWidth,
              // Legacy/auto boxes have no stored width — cap them at the same
              // width the editor used so they wrap instead of collapsing to a
              // single line. (matches `tbWidth ?? Math.max(120, fs*6)` editor.)
              maxWidth: tbWidth ? undefined : Math.max(120, fs * 6),
              height: tbHeight,
              fontSize: fs,
              fontWeight: tb.bold ? 700 : 400,
              color: tb.color,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflow: tbHeight ? 'hidden' : undefined,
              lineHeight: 1.4,
              fontFamily: 'sans-serif',
              cursor: textBoxClickable
                ? tool === 'object-eraser'
                  ? 'crosshair'
                  : 'move'
                : 'default',
              pointerEvents: textBoxClickable ? 'auto' : 'none',
              userSelect: 'none',
              borderRadius: 4,
              padding: `${padding}px ${padding * 1.5}px`,
              border: isSelected ? '1.5px dashed #3b82f6' : '1.5px solid transparent',
              boxSizing: 'border-box',
              background: isSelected ? 'rgba(59,130,246,0.04)' : undefined,
            }}
          >
            {tb.text}
            {isSelected && (
              <div
                onMouseDown={startResize}
                style={{
                  position: 'absolute',
                  right: -7,
                  bottom: -7,
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: '#3b82f6',
                  cursor: 'nwse-resize',
                  border: '2px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            )}
          </div>
        )
      })}

      {/* Live rectangle while drawing a new text box */}
      {drawRect && (drawRect.w > 0.005 || drawRect.h > 0.005) && (
        <div
          style={{
            position: 'absolute',
            left: drawRect.x * canvasWidth,
            top: drawRect.y * canvasHeight,
            width: drawRect.w * canvasWidth,
            height: drawRect.h * canvasHeight,
            border: '1.5px dashed #3b82f6',
            background: 'rgba(59,130,246,0.08)',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* Drag/tap surface for text tool — behind text boxes but above canvas */}
      {interactive && isTextTool && (
        <div
          data-text-overlay
          onMouseDown={(e) => {
            if (editingId) {
              commitTextEdit(editingId, editingText)
              return
            }
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            drawStartRef.current = {
              x: (e.clientX - rect.left) / rect.width,
              y: (e.clientY - rect.top) / rect.height,
            }
            setDrawRect({ x: drawStartRef.current.x, y: drawStartRef.current.y, w: 0, h: 0 })
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            cursor: 'crosshair',
            pointerEvents: 'auto',
            zIndex: 0,
          }}
        />
      )}
    </div>
  )
}
