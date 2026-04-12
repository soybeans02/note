import { useMemo, useState } from 'react'
import { type Folder } from '../db/db'
import {
  createFolder,
  deleteFolder,
  moveFolder,
  renameFolder,
  reorderFolder,
  useAllFolders,
} from '../hooks/useFolders'
import { moveDocument } from '../hooks/useDocuments'
import { pickFolder } from '../lib/folderPath'

interface Props {
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
}

interface TreeNode extends Folder {
  children: TreeNode[]
}

function buildTree(folders: Folder[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }))
  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

export default function Sidebar({ selectedFolderId, onSelect }: Props) {
  const folders = useAllFolders()
  const tree = useMemo(() => buildTree(folders), [folders])

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
        {tree.map((node) => (
          <FolderRow
            key={node.id}
            node={node}
            depth={0}
            allFolders={folders}
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
        e.preventDefault()
        setHover(true)
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault()
        setHover(false)
        const docId = e.dataTransfer.getData('application/x-doc-id')
        if (docId) moveDocument(docId, null)
        const folderId = e.dataTransfer.getData('application/x-folder-id')
        if (folderId) moveFolder(folderId, null)
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

type DropZone = 'before' | 'into' | 'after'

function FolderRow({
  node,
  depth,
  allFolders,
  selectedFolderId,
  onSelect,
}: {
  node: TreeNode
  depth: number
  allFolders: Folder[]
  selectedFolderId: string | null
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(true)
  const [zone, setZone] = useState<DropZone | null>(null)
  const selected = selectedFolderId === node.id

  const computeZone = (e: React.DragEvent<HTMLDivElement>): DropZone => {
    const isFolderDrag = e.dataTransfer.types.includes('application/x-folder-id')
    if (!isFolderDrag) return 'into'
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    if (y < rect.height * 0.25) return 'before'
    if (y > rect.height * 0.75) return 'after'
    return 'into'
  }

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-folder-id', node.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
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
          if (dropZone === 'into') {
            moveFolder(folderId, node.id)
          } else {
            reorderFolder(folderId, node.id, dropZone)
          }
        }}
        onClick={() => onSelect(node.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          const action = prompt(
            `「${node.name}」\n1: サブフォルダ作成\n2: リネーム\n3: 別フォルダへ移動\n4: 削除\n番号を入力`,
          )
          if (action === '1') {
            const name = prompt('サブフォルダ名')
            if (name) createFolder(name, node.id)
            setOpen(true)
          } else if (action === '2') {
            const name = prompt('新しい名前', node.name)
            if (name) renameFolder(node.id, name)
          } else if (action === '3') {
            const dest = pickFolder('移動先を選択', allFolders, node.id)
            if (dest) moveFolder(node.id, dest.id)
          } else if (action === '4') {
            if (confirm(`「${node.name}」と中身をすべて削除しますか？`)) {
              deleteFolder(node.id)
              if (selected) onSelect(null)
            }
          }
        }}
        style={{ paddingLeft: 12 + depth * 16 }}
        className={`relative pr-3 py-1.5 rounded-lg text-[13px] cursor-pointer flex items-center gap-1.5 select-none mb-0.5 transition ${
          selected
            ? 'bg-white/10 text-white font-medium'
            : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200'
        } ${zone === 'into' ? 'ring-1 ring-neutral-600' : ''}`}
      >
        {zone === 'before' && (
          <span className="absolute left-2 right-2 top-0 h-0.5 bg-neutral-500 rounded pointer-events-none" />
        )}
        {zone === 'after' && (
          <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-neutral-500 rounded pointer-events-none" />
        )}
        {node.children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className="w-4 text-neutral-600 hover:text-neutral-300 transition"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
              <path d="M3 1.5l4 3.5-4 3.5z" />
            </svg>
          </button>
        ) : (
          <span className="w-4" />
        )}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" className="shrink-0 opacity-50">
          <path d="M2 4.5V11a1 1 0 001 1h8a1 1 0 001-1V6a1 1 0 00-1-1H7L5.5 3H3a1 1 0 00-1 1v.5z" />
        </svg>
        <span className="truncate">{node.name}</span>
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.id}
            node={child}
            depth={depth + 1}
            allFolders={allFolders}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}
