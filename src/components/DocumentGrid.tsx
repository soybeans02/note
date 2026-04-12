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
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
        ファイルをドロップ、または右下の + から追加
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto scroll-thin p-3 md:p-5">
      <div className="grid gap-3 md:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
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
        className={`mt-2 h-14 rounded-lg border-2 border-dashed transition ${
          tailHover ? 'border-neutral-600 bg-neutral-900/50' : 'border-transparent'
        }`}
      >
        {tailHover && (
          <div className="h-full flex items-center justify-center text-xs text-neutral-500">
            末尾に移動
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
        <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-neutral-500 rounded pointer-events-none" />
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
        className="group cursor-pointer flex flex-col rounded-xl overflow-hidden bg-neutral-900/80 border border-neutral-800/50 hover:border-neutral-600 hover:-translate-y-0.5 transition-all duration-150"
      >
        <div className="aspect-[3/4] bg-neutral-800/50 flex items-center justify-center">
          {doc.thumbDataUrl ? (
            <img
              src={doc.thumbDataUrl}
              alt={doc.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-neutral-700">
              <path d="M10 4h8l6 6v18a2 2 0 01-2 2H10a2 2 0 01-2-2V6a2 2 0 012-2z" />
              <path d="M18 4v6h6" />
            </svg>
          )}
        </div>
        <div className="px-3 py-2.5">
          <div className="text-[13px] text-white truncate leading-tight" title={doc.name}>
            {doc.name}
          </div>
          <div className="text-[11px] text-neutral-600 mt-1 flex items-center gap-1.5">
            <span>{doc.pageCount}p</span>
            <span className="text-neutral-700">·</span>
            <span>{(doc.size / 1024 / 1024).toFixed(1)}MB</span>
            {doc.notes && (
              <>
                <span className="text-neutral-700">·</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-neutral-500">
                  <path d="M2 2h6M2 4h6M2 6h4" />
                </svg>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
