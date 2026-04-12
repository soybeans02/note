import { useState, useRef, type ReactNode } from 'react'

interface Props {
  label: string
  children: ReactNode
}

export default function Tooltip({ label, children }: Props) {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  return (
    <div
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
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700/60 text-[10px] text-neutral-300 whitespace-nowrap pointer-events-none z-50 shadow-lg">
          {label}
        </div>
      )}
    </div>
  )
}
