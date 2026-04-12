import { useCallback, useEffect, useRef } from 'react'
import getStroke from 'perfect-freehand'
import { uid, type Stroke } from '../db/db'
import { addStroke, removeStroke, traceEraseAt } from '../hooks/useAnnotations'
import type { DrawTool } from './DrawingToolbar'

interface Props {
  docId: string
  pageNum: number
  strokes: Stroke[]
  interactive: boolean
  tool: DrawTool
  color: string
  width: number
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

export default function AnnotationLayer({
  docId,
  pageNum,
  strokes,
  interactive,
  tool,
  color,
  width,
  canvasWidth,
  canvasHeight,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const pointsRef = useRef<[number, number, number][]>([])

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

      // Live preview
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = canvas.width
      const h = canvas.height
      renderStrokes(ctx, strokes, w, h)
      // Draw current stroke
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

  const dpr = window.devicePixelRatio || 1
  const isEraser = tool === 'object-eraser' || tool === 'trace-eraser'

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth * dpr}
      height={canvasHeight * dpr}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive
          ? isEraser
            ? 'crosshair'
            : 'crosshair'
          : 'default',
        touchAction: interactive ? 'none' : 'auto',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}
