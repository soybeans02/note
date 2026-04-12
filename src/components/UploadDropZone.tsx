import { useRef, useState } from 'react'
import { addPdfFiles } from '../hooks/useDocuments'

interface Props {
  folderId: string | null
  children: React.ReactNode
}

export default function UploadDropZone({ folderId, children }: Props) {
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!arr.length) return
    setBusy(true)
    try {
      await addPdfFiles(arr, folderId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }
      }}
      className="relative flex-1 flex flex-col"
    >
      {children}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        className="absolute bottom-6 right-6 rounded-full bg-sky-500 hover:bg-sky-400 text-white shadow-lg w-14 h-14 text-3xl leading-none"
        title="PDFを追加"
      >
        +
      </button>

      {(dragOver || busy) && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-slate-100 text-lg">
            {busy ? '取り込み中…' : 'ここにドロップしてPDFを追加'}
          </div>
        </div>
      )}
    </div>
  )
}
