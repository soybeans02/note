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

  // Apply toolbar style changes to actively edited or selected text box
  const activeTextBoxId = editingId ?? selectedId
  const activeIsEditing = editingId !== null
  const prevStyleRef = useRef({ color, fontSize, bold })
  useEffect(() => {
    if (!activeTextBoxId) return
    if (!activeIsEditing && tool !== 'text') return
    const prev = prevStyleRef.current
    const updates: Partial<TextBox> = {}
    if (color !== prev.color) updates.color = color
    if (fontSize !== prev.fontSize) updates.fontSize = fontSize
    if (bold !== prev.bold) updates.bold = bold
    prevStyleRef.current = { color, fontSize, bold }
    if (Object.keys(updates).length > 0) {
      updateTextBox(docId, pageKey, activeTextBoxId, updates)
    }
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
    const DRAG_THRESHOLD = 3
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
    const onUp = () => { dragRef.current = null }
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

  // Click outside to deselect/commit (window-level)
  useEffect(() => {
    if (!selectedId && !editingId) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-textbox]')) return
      if (target.closest('[data-text-overlay]')) return
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
                onBlur={() => commitTextEdit(tb.id, editingText)}
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
              startMove(e)
              setSelectedId(tb.id)
            }}
            onClick={(e) => {
              if (!textBoxClickable) return
              e.stopPropagation()
              const dragMoved = dragRef.current?.moved
              if (dragMoved) return
              if (tool === 'object-eraser') {
                removeTextBox(docId, pageKey, tb.id)
                return
              }
              if (tool === 'text') {
                setEditingId(tb.id)
                setEditingText(tb.text)
                setSelectedId(null)
              }
            }}
            onDoubleClick={(e) => {
              if (!textBoxClickable) return
              if (tool === 'object-eraser') return
              e.stopPropagation()
              setEditingId(tb.id)
              setEditingText(tb.text)
              setSelectedId(null)
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
