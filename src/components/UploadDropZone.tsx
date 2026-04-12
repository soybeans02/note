import { useRef, useState } from 'react'
import { addPdfFiles, addImageFiles, createBlankNote } from '../hooks/useDocuments'
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
    const all = Array.from(files)
    const pdfs = all.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    const images = all.filter((f) => f.type.startsWith('image/'))
    if (!pdfs.length && !images.length) return
    setBusy(true)
    try {
      if (pdfs.length) await addPdfFiles(pdfs, folderId)
      if (images.length) await addImageFiles(images, folderId)
    } finally {
      setBusy(false)
    }
  }

  const handleNewNote = async () => {
    setMenuOpen(false)
    const id = await createBlankNote(folderId)
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
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* FAB + menu */}
      <div className="absolute bottom-5 right-5">
        {menuOpen && (
          <>
            <div
              className="fixed inset-0"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-14 right-0 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-1.5 w-40 z-10">
              <button
                onClick={handleNewNote}
                className="w-full text-left px-4 py-2 text-[13px] text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2.5 transition"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M2 2h6M2 5h10M2 8h8M2 11h6" />
                </svg>
                ノートを追加
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  inputRef.current?.click()
                }}
                className="w-full text-left px-4 py-2 text-[13px] text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2.5 transition"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M4 2h4l4 4v6a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                  <path d="M8 2v4h4" />
                </svg>
                ファイルを開く
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`rounded-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white shadow-lg w-12 h-12 flex items-center justify-center transition-all duration-200 ${
            menuOpen ? 'rotate-45 bg-neutral-600' : ''
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M9 4v10M4 9h10" />
          </svg>
        </button>
      </div>

      {(dragOver || busy) && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-neutral-300 text-sm font-medium">
            {busy ? '読み込み中…' : 'ここにドロップ'}
          </div>
        </div>
      )}
    </div>
  )
}
