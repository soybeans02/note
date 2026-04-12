import { useMemo, useState } from 'react'
import { type Folder } from '../db/db'
import {
  createFolder,
  deleteFolder,
  moveFolder,
  renameFolder,
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
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

export default function Sidebar({ selectedFolderId, onSelect }: Props) {
  const folders = useAllFolders()
  const tree = useMemo(() => buildTree(folders), [folders])

  return (
    <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-900/60 flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">ライブラリ</span>
        <button
          onClick={() => {
            const name = prompt('フォルダ名')
            if (name) createFolder(name, null)
          }}
          className="text-xs text-slate-400 hover:text-slate-100"
          title="ルートに新規フォルダ"
        >
          + 新規
        </button>
      </div>

      <div className="flex-1 overflow-auto scroll-thin py-2">
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

      <div className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-800">
        IndexedDB に保存。サブスク代節約モード on.
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
      className={`px-4 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
        selected ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
      } ${hover ? 'ring-1 ring-sky-500' : ''}`}
    >
      <span>📚</span>
      <span>すべて</span>
    </div>
  )
}

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
  const [hover, setHover] = useState(false)
  const selected = selectedFolderId === node.id

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
          setHover(true)
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault()
          setHover(false)
          const docId = e.dataTransfer.getData('application/x-doc-id')
          if (docId) moveDocument(docId, node.id)
          const folderId = e.dataTransfer.getData('application/x-folder-id')
          if (folderId && folderId !== node.id) moveFolder(folderId, node.id)
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
        style={{ paddingLeft: 12 + depth * 14 }}
        className={`pr-3 py-1.5 text-sm cursor-pointer flex items-center gap-1.5 select-none ${
          selected ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
        } ${hover ? 'ring-1 ring-sky-500' : ''}`}
      >
        {node.children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className="w-4 text-slate-500 hover:text-slate-200"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span>{open ? '📂' : '📁'}</span>
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
