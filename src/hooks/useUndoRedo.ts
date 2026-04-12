import { useCallback, useEffect, useRef, useState } from 'react'
import type { Annotation, Stroke, TextBox } from '../db/db'
import { restoreAnnotation } from './useAnnotations'

interface Snapshot {
  strokes: Stroke[]
  textBoxes: TextBox[]
}

function serialize(ann: Annotation | undefined): string {
  if (!ann) return ''
  return JSON.stringify({ strokes: ann.strokes, textBoxes: ann.textBoxes ?? [] })
}

export function useUndoRedo(docId: string, pageNum: number, annotation: Annotation | undefined) {
  const undoStackRef = useRef<Snapshot[]>([])
  const redoStackRef = useRef<Snapshot[]>([])
  const isRestoringRef = useRef(false)
  const prevSerializedRef = useRef('')
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)

  // Reset on page change
  useEffect(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    prevSerializedRef.current = ''
    isRestoringRef.current = false
    setUndoLen(0)
    setRedoLen(0)
  }, [docId, pageNum])

  // Track changes
  useEffect(() => {
    const current = serialize(annotation)
    if (current === prevSerializedRef.current) return

    if (isRestoringRef.current) {
      isRestoringRef.current = false
      prevSerializedRef.current = current
      return
    }

    // Push previous state to undo stack (skip initial empty state)
    if (prevSerializedRef.current !== '') {
      undoStackRef.current.push(JSON.parse(prevSerializedRef.current))
      redoStackRef.current = []
      setUndoLen(undoStackRef.current.length)
      setRedoLen(0)
    }
    prevSerializedRef.current = current
  }, [annotation])

  const undo = useCallback(async () => {
    if (!undoStackRef.current.length) return
    const prev = undoStackRef.current.pop()!
    // Save current to redo
    if (prevSerializedRef.current) {
      redoStackRef.current.push(JSON.parse(prevSerializedRef.current))
    }
    isRestoringRef.current = true
    setUndoLen(undoStackRef.current.length)
    setRedoLen(redoStackRef.current.length)
    await restoreAnnotation(docId, pageNum, prev.strokes, prev.textBoxes)
  }, [docId, pageNum])

  const redo = useCallback(async () => {
    if (!redoStackRef.current.length) return
    const next = redoStackRef.current.pop()!
    if (prevSerializedRef.current) {
      undoStackRef.current.push(JSON.parse(prevSerializedRef.current))
    }
    isRestoringRef.current = true
    setUndoLen(undoStackRef.current.length)
    setRedoLen(redoStackRef.current.length)
    await restoreAnnotation(docId, pageNum, next.strokes, next.textBoxes)
  }, [docId, pageNum])

  return { undo, redo, canUndo: undoLen > 0, canRedo: redoLen > 0 }
}
