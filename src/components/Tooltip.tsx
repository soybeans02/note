import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  label: string
  position?: 'top' | 'bottom'
  children: ReactNode
}

export default function Tooltip({ label, position = 'top', children }: Props) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!show || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    setCoords({
      x: r.left + r.width / 2,
      y: position === 'bottom' ? r.bottom + 6 : r.top - 6,
    })
  }, [show, position])

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        timerRef.current = setTimeout(() => setShow(true), 400)
      }}
      onMouseLeave={() => {
        clearTimeout(timerRef.current)
        setShow(false)
      }}
    >
      {children}
      {show && coords && createPortal(
        <div
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform: position === 'bottom' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
          className="px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700/60 text-[10px] text-neutral-300 whitespace-nowrap pointer-events-none z-[100] shadow-lg"
        >
          {label}
        </div>,
        document.body,
      )}
    </div>
  )
}
