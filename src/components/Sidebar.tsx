import { useMemo, useState } from 'react'
import { type Folder } from '../db/db'
import {
  createFolder,
  deleteFolder,
  renameFolder,
  reorderFolder,
  useAllFolders,
} from '../hooks/useFolders'
import { moveDocument } from '../hooks/useDocuments'

interface Props {
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
}

export default function Sidebar({ selectedFolderId, onSelect }: Props) {
  const folders = useAllFolders()
  // Flat, order-sorted list (parentId is ignored — no nesting in the UI).
  const flatFolders = useMemo(
    () => [...folders].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [folders],
  )

  return (
    <aside className="w-64 md:w-56 h-full shrink-0 border-r border-neutral-800/50 bg-[#141414] flex flex-col">
      <div className="px-4 py-3.5 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide uppercase text-neutral-500">
          ライブラリ
        </span>
        <button
          onClick={() => {
            const name = prompt('フォルダ名')
            if (name) createFolder(name, null)
          }}
          className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition"
          title="新規フォルダ"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M7 3v8M3 7h8" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto scroll-thin px-2 pb-2">
        <RootRow
          selected={selectedFolderId === null}
          onSelect={() => onSelect(null)}
        />
        {flatFolders.map((node) => (
          <FolderRow
            key={node.id}
            node={node}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="px-4 py-2.5 text-[10px] text-neutral-600 border-t border-neutral-800/60">
        ローカル保存
      </div>
    </aside>
  )
}

function RootRow({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onSelect}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-doc-id')) return
        e.preventDefault()
        setHover(true)
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        const docId = e.dataTransfer.getData('application/x-doc-id')
        if (!docId) return
        e.preventDefault()
        setHover(false)
        moveDocument(docId, null)
      }}
      className={`px-3 py-1.5 rounded-lg text-[13px] cursor-pointer flex items-center gap-2.5 mb-0.5 transition ${
        selected
          ? 'bg-white/10 text-white font-medium'
          : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200'
      } ${hover ? 'ring-1 ring-neutral-600' : ''}`}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0 opacity-60">
        <rect x="2" y="3" width="11" height="9" rx="1.5" />
        <path d="M2 5.5h11" />
      </svg>
      <span>すべて</span>
    </div>
  )
}

type DropZone = 'before' | 'doc-into' | 'after'

function FolderRow({
  node,
  selectedFolderId,
  onSelect,
}: {
  node: Folder
  selectedFolderId: string | null
  onSelect: (id: string | null) => void
}) {
  const [zone, setZone] = useState<DropZone | null>(null)
  const selected = selectedFolderId === node.id

  const computeZone = (e: React.DragEvent<HTMLDivElement>): DropZone => {
    // Docs always drop INTO the folder (no reorder for docs in sidebar).
    if (e.dataTransfer.types.includes('application/x-doc-id')) return 'doc-into'
    // Folders only reorder — never nest.
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    return y < rect.height / 2 ? 'before' : 'after'
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-folder-id', node.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (
          !e.dataTransfer.types.includes('application/x-folder-id') &&
          !e.dataTransfer.types.includes('application/x-doc-id')
        )
          return
        e.preventDefault()
        setZone(computeZone(e))
      }}
      onDragLeave={() => setZone(null)}
      onDrop={(e) => {
        e.preventDefault()
        const dropZone = computeZone(e)
        setZone(null)
        const docId = e.dataTransfer.getData('application/x-doc-id')
        if (docId) {
          moveDocument(docId, node.id)
          return
        }
        const folderId = e.dataTransfer.getData('application/x-folder-id')
        if (!folderId || folderId === node.id) return
        if (dropZone === 'before' || dropZone === 'after') {
          reorderFolder(folderId, node.id, dropZone)
        }
      }}
      onClick={() => onSelect(node.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        const action = prompt(
          `「${node.name}」\n1: リネーム\n2: 削除\n番号を入力`,
        )
        if (action === '1') {
          const name = prompt('新しい名前', node.name)
          if (name) renameFolder(node.id, name)
        } else if (action === '2') {
          if (confirm(`「${node.name}」と中身をすべて削除しますか？`)) {
            deleteFolder(node.id)
            if (selected) onSelect(null)
          }
        }
      }}
      style={{ paddingLeft: 12 }}
      className={`relative pr-3 py-1.5 rounded-lg text-[13px] cursor-pointer flex items-center gap-1.5 select-none mb-0.5 transition ${
        selected
          ? 'bg-white/10 text-white font-medium'
          : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200'
      } ${zone === 'doc-into' ? 'ring-1 ring-neutral-600' : ''}`}
    >
      {zone === 'before' && (
        <span className="absolute left-2 right-2 top-0 h-0.5 bg-neutral-500 rounded pointer-events-none" />
      )}
      {zone === 'after' && (
        <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-neutral-500 rounded pointer-events-none" />
      )}
      <span className="w-4" />
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" className="shrink-0 opacity-50">
        <path d="M2 4.5V11a1 1 0 001 1h8a1 1 0 001-1V6a1 1 0 00-1-1H7L5.5 3H3a1 1 0 00-1 1v.5z" />
      </svg>
      <span className="truncate">{node.name}</span>
    </div>
  )
}
