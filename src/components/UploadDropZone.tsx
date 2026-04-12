import { useRef, useState } from 'react'
import { addPdfFiles, createBlankNote } from '../hooks/useDocuments'
import { type DocumentMeta } from '../db/db'

interface Props {
  folderId: string | null
  children: React.ReactNode
  onOpenDoc: (doc: DocumentMeta) => void
}

export default function UploadDropZone({ folderId, children, onOpenDoc }: Props) {
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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

  const handleNewNote = async () => {
    setMenuOpen(false)
    const id = await createBlankNote(folderId)
    // Open the new note immediately
    const { db } = await import('../db/db')
    const doc = await db.documents.get(id)
    if (doc) onOpenDoc(doc)
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

      {/* FAB + menu */}
      <div className="absolute bottom-6 right-6">
        {menuOpen && (
          <>
            <div
              className="fixed inset-0"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-16 right-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 w-44 z-10">
              <button
                onClick={handleNewNote}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
              >
                📝 ノートを追加
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  inputRef.current?.click()
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
              >
                📄 PDFを開く
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`rounded-full bg-sky-500 hover:bg-sky-400 text-white shadow-lg w-14 h-14 text-3xl leading-none transition-transform ${
            menuOpen ? 'rotate-45' : ''
          }`}
        >
          +
        </button>
      </div>

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
