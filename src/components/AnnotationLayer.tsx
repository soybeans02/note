import { useCallback, useEffect, useRef, useState } from 'react'
import getStroke from 'perfect-freehand'
import { uid, type Stroke, type TextBox } from '../db/db'
import { addStroke, removeStroke, traceEraseAt, addTextBox, updateTextBox, removeTextBox } from '../hooks/useAnnotations'
import type { DrawTool } from './DrawingToolbar'

interface Props {
  docId: string
  pageNum: number
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

function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h)
  for (const stroke of strokes) {
    const scaledPoints = stroke.points.map(
      ([x, y, p]) => [x * w, y * h, p] as [number, number, number],
    )
    const outlinePoints = getStroke(scaledPoints, {
      size: stroke.width * (Math.min(w, h) / 500),
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: false,
    })
    const path = new Path2D(getSvgPathFromStroke(outlinePoints))
    ctx.fillStyle = stroke.color
    ctx.fill(path)
  }
}

type DragState = {
  type: 'move'
  tbId: string
  startX: number
  startY: number
  origX: number
  origY: number
}

export default function AnnotationLayer({
  docId,
  pageNum,
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
  const dragRef = useRef<DragState | null>(null)

  // Clear editing when tool/page changes
  useEffect(() => {
    setEditingId(null)
  }, [pageNum, tool])

  // Apply toolbar style changes to editing text box
  const activeTextBoxId = editingId
  const prevStyleRef = useRef({ color, fontSize, bold })
  useEffect(() => {
    if (!activeTextBoxId || tool !== 'text') return
    const prev = prevStyleRef.current
    const updates: Partial<TextBox> = {}
    if (color !== prev.color) updates.color = color
    if (fontSize !== prev.fontSize) updates.fontSize = fontSize
    if (bold !== prev.bold) updates.bold = bold
    prevStyleRef.current = { color, fontSize, bold }
    if (Object.keys(updates).length > 0) {
      updateTextBox(docId, pageNum, activeTextBoxId, updates)
    }
  }, [color, fontSize, bold, activeTextBoxId, tool, docId, pageNum])

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
      if (tool === 'text') return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      const pt = normalizePoint(e)

      if (tool === 'object-eraser') {
        const hit = findStrokeAt(pt[0], pt[1])
        if (hit) removeStroke(docId, pageNum, hit.id)
        return
      }

      if (tool === 'trace-eraser') {
        traceEraseAt(docId, pageNum, pt[0], pt[1])
        return
      }

      drawingRef.current = true
      pointsRef.current = [pt]
    },
    [interactive, tool, docId, pageNum, normalizePoint, findStrokeAt],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return

      if (tool === 'object-eraser') {
        if (e.buttons > 0) {
          const pt = normalizePoint(e)
          const hit = findStrokeAt(pt[0], pt[1])
          if (hit) removeStroke(docId, pageNum, hit.id)
        }
        return
      }

      if (tool === 'trace-eraser') {
        if (e.buttons > 0) {
          const pt = normalizePoint(e)
          traceEraseAt(docId, pageNum, pt[0], pt[1])
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
      const scaledPoints = pointsRef.current.map(
        ([x, y, p]) => [x * w, y * h, p] as [number, number, number],
      )
      const outlinePoints = getStroke(scaledPoints, {
        size: width * (Math.min(w, h) / 500),
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: false,
      })
      const path = new Path2D(getSvgPathFromStroke(outlinePoints))
      ctx.fillStyle = color
      ctx.fill(path)
    },
    [interactive, tool, docId, pageNum, normalizePoint, findStrokeAt, strokes, color, width],
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
    }
    pointsRef.current = []
    addStroke(docId, pageNum, stroke)
  }, [docId, pageNum, color, width])

  // Commit text edit
  const commitTextEdit = useCallback(
    (tbId: string, text: string) => {
      if (text.trim() === '') {
        removeTextBox(docId, pageNum, tbId)
      } else {
        updateTextBox(docId, pageNum, tbId, { text })
      }
      setEditingId(null)
      setEditingText('')
    },
    [docId, pageNum],
  )

  // Text tool: click to create new text box (or dismiss edit)
  const handleTextClick = useCallback(
    (e: React.MouseEvent) => {
      if (!interactive || tool !== 'text') return

      // If editing, commit first and don't create a new box
      if (editingId) {
        commitTextEdit(editingId, editingText)
        return
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const nx = (e.clientX - rect.left) / rect.width
      const ny = (e.clientY - rect.top) / rect.height
      const id = uid()
      const tb: TextBox = { id, x: nx, y: ny, text: '', color, fontSize, bold }
      addTextBox(docId, pageNum, tb)
      setEditingId(id)
      setEditingText('')
    },
    [interactive, tool, color, fontSize, bold, docId, pageNum, editingId, editingText, commitTextEdit],
  )

  // Click on background to commit edit
  const handleBgClick = useCallback(() => {
    if (editingId) {
      commitTextEdit(editingId, editingText)
    }
  }, [editingId, editingText, commitTextEdit])

  // Drag move/resize handlers (attached to window)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      e.preventDefault()
      const dx = (e.clientX - drag.startX) / canvasWidth
      const dy = (e.clientY - drag.startY) / canvasHeight

      const newX = Math.max(0, Math.min(1, drag.origX + dx))
      const newY = Math.max(0, Math.min(1, drag.origY + dy))
      updateTextBox(docId, pageNum, drag.tbId, { x: newX, y: newY })
    }

    const onMouseUp = () => {
      dragRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [docId, pageNum, canvasWidth, canvasHeight])

  const dpr = window.devicePixelRatio || 1
  const isTextTool = tool === 'text'
  const scale = Math.min(canvasWidth, canvasHeight) / 500

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: interactive ? 'auto' : 'none',
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
          pointerEvents: interactive && !isTextTool ? 'auto' : 'none',
          cursor: interactive && !isTextTool ? 'crosshair' : 'default',
          touchAction: interactive && !isTextTool ? 'none' : 'auto',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Text boxes */}
      {textBoxes.map((tb) => {
        const isEditing = editingId === tb.id
        const left = tb.x * canvasWidth
        const top = tb.y * canvasHeight
        const fs = tb.fontSize * scale
        const tbWidth = tb.width ? tb.width * canvasWidth : undefined

        if (isEditing) {
          return (
            <div
              key={tb.id}
              style={{
                position: 'absolute',
                left,
                top,
                zIndex: 10,
                minWidth: 80,
              }}
            >
              {/* Drag handle */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  dragRef.current = {
                    type: 'move',
                    tbId: tb.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: tb.x,
                    origY: tb.y,
                  }
                }}
                style={{
                  height: 14,
                  background: '#3b82f6',
                  borderRadius: '4px 4px 0 0',
                  cursor: 'move',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="20" height="4" viewBox="0 0 20 4" fill="rgba(255,255,255,0.6)">
                  <circle cx="6" cy="2" r="1" />
                  <circle cx="10" cy="2" r="1" />
                  <circle cx="14" cy="2" r="1" />
                </svg>
              </div>
              <textarea
                autoFocus
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={() => commitTextEdit(tb.id, editingText)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') commitTextEdit(tb.id, editingText)
                  e.stopPropagation()
                }}
                style={{
                  display: 'block',
                  width: tbWidth ?? '100%',
                  fontSize: fs,
                  fontWeight: tb.bold ? 700 : 400,
                  color: tb.color,
                  minWidth: 80,
                  minHeight: fs + 8,
                  background: 'rgba(255,255,255,0.95)',
                  border: '1.5px solid #3b82f6',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  padding: '2px 4px',
                  outline: 'none',
                  resize: 'both',
                  lineHeight: 1.4,
                  fontFamily: 'sans-serif',
                }}
              />
            </div>
          )
        }

        return (
          <div
            key={tb.id}
            onClick={(e) => {
              if (!interactive) return
              e.stopPropagation()

              if (tool === 'object-eraser') {
                removeTextBox(docId, pageNum, tb.id)
                return
              }

              // Single click → edit directly
              setEditingId(tb.id)
              setEditingText(tb.text)
            }}
            style={{
              position: 'absolute',
              left,
              top,
              width: tbWidth,
              fontSize: fs,
              fontWeight: tb.bold ? 700 : 400,
              color: tb.color,
              whiteSpace: 'pre-wrap',
              wordBreak: tbWidth ? 'break-word' : undefined,
              lineHeight: 1.4,
              fontFamily: 'sans-serif',
              cursor: interactive
                ? tool === 'object-eraser'
                  ? 'crosshair'
                  : 'pointer'
                : 'default',
              pointerEvents: interactive ? 'auto' : 'none',
              userSelect: 'none',
              borderRadius: 3,
              padding: '1px 3px',
            }}
          >
            {tb.text}
          </div>
        )
      })}

      {/* Click overlay for text tool — behind text boxes but above canvas */}
      {interactive && isTextTool && (
        <div
          onClick={handleTextClick}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            cursor: 'text',
            zIndex: 0,
          }}
        />
      )}
    </div>
  )
}
