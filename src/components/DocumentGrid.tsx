import { useState } from 'react'
import { type DocumentMeta, type Folder } from '../db/db'
import {
  deleteDocument,
  moveDocument,
  renameDocument,
  reorderDocument,
} from '../hooks/useDocuments'
import { pickFolder } from '../lib/folderPath'

interface Props {
  documents: DocumentMeta[]
  folders: Folder[]
  onOpen: (doc: DocumentMeta) => void
}

export default function DocumentGrid({ documents, folders, onOpen }: Props) {
  const [tailHover, setTailHover] = useState(false)

  if (!documents.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        PDFをドラッグ&ドロップ、または右下の + から追加
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto scroll-thin p-6">
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
        {documents.map((doc) => (
          <Card key={doc.id} doc={doc} folders={folders} onOpen={() => onOpen(doc)} />
        ))}
      </div>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-doc-id')) {
            e.preventDefault()
            setTailHover(true)
          }
        }}
        onDragLeave={() => setTailHover(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData('application/x-doc-id')
          if (id) {
            e.preventDefault()
            e.stopPropagation()
            setTailHover(false)
            reorderDocument(id, null)
          }
        }}
        className={`mt-2 h-16 rounded-lg border-2 border-dashed transition ${
          tailHover ? 'border-sky-500 bg-sky-500/10' : 'border-transparent'
        }`}
      >
        {tailHover && (
          <div className="h-full flex items-center justify-center text-xs text-sky-300">
            ここにドロップで末尾へ
          </div>
        )}
      </div>
    </div>
  )
}

function Card({
  doc,
  folders,
  onOpen,
}: {
  doc: DocumentMeta
  folders: Folder[]
  onOpen: () => void
}) {
  const [insertHere, setInsertHere] = useState(false)

  return (
    <div className="relative">
      {insertHere && (
        <div className="absolute -left-2.5 top-0 bottom-0 w-1 bg-sky-400 rounded pointer-events-none" />
      )}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-doc-id', doc.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-doc-id')) {
            e.preventDefault()
            setInsertHere(true)
          }
        }}
        onDragLeave={() => setInsertHere(false)}
        onDrop={(e) => {
          const draggedId = e.dataTransfer.getData('application/x-doc-id')
          if (draggedId) {
            e.preventDefault()
            e.stopPropagation()
            setInsertHere(false)
            if (draggedId !== doc.id) reorderDocument(draggedId, doc.id)
          }
        }}
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault()
          const action = prompt(
            `「${doc.name}」\n1: リネーム\n2: 別フォルダへ移動\n3: 削除\n番号を入力`,
          )
          if (action === '1') {
            const name = prompt('新しい名前', doc.name)
            if (name) renameDocument(doc.id, name)
          } else if (action === '2') {
            const dest = pickFolder('移動先を選択', folders)
            if (dest) moveDocument(doc.id, dest.id)
          } else if (action === '3') {
            if (confirm(`「${doc.name}」を削除しますか？`)) deleteDocument(doc.id)
          }
        }}
        className="group cursor-pointer flex flex-col rounded-lg overflow-hidden bg-slate-900 border border-slate-800 hover:border-sky-500 hover:-translate-y-0.5 transition"
      >
        <div className="aspect-[3/4] bg-slate-800 flex items-center justify-center">
          {doc.thumbDataUrl ? (
            <img
              src={doc.thumbDataUrl}
              alt={doc.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-slate-600 text-3xl">📄</span>
          )}
        </div>
        <div className="px-2.5 py-2">
          <div className="text-sm text-slate-100 truncate" title={doc.name}>
            {doc.name}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {doc.pageCount}p · {(doc.size / 1024 / 1024).toFixed(1)}MB
          </div>
        </div>
      </div>
    </div>
  )
}
