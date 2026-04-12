import { useState, useRef, type ReactNode } from 'react'

interface Props {
  label: string
  position?: 'top' | 'bottom'
  children: ReactNode
}

export default function Tooltip({ label, position = 'top', children }: Props) {
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
      <div className={`absolute left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700/60 text-[10px] text-neutral-300 whitespace-nowrap pointer-events-none z-50 shadow-lg transition-opacity duration-150 ${
        position === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
      } ${show ? 'opacity-100' : 'opacity-0'}`}>
        {label}
      </div>
    </div>
  )
}
