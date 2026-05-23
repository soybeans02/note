import { useEffect, useMemo, useRef, useState } from 'react'
import { type DocumentMeta, type Folder } from '../db/db'
import {
  deleteDocument,
  moveDocument,
  moveDocuments,
  renameDocument,
  reorderDocument,
} from '../hooks/useDocuments'
import { pickFolder } from '../lib/folderPath'

interface Props {
  documents: DocumentMeta[]
  folders: Folder[]
  onOpen: (doc: DocumentMeta) => void
}

const CARD_MIN = 100
const CARD_MAX = 280
const CARD_DEFAULT = 160
const CARD_SIZE_KEY = 'note:card-size'

const DOC_ID_MIME = 'application/x-doc-id'
const DOC_IDS_MIME = 'application/x-doc-ids'

function useCardSize(): [number, (n: number) => void] {
  const [size, setSize] = useState<number>(() => {
    if (typeof window === 'undefined') return CARD_DEFAULT
    const stored = window.localStorage.getItem(CARD_SIZE_KEY)
    const n = stored ? parseInt(stored, 10) : NaN
    if (!Number.isFinite(n)) return CARD_DEFAULT
    return Math.max(CARD_MIN, Math.min(CARD_MAX, n))
  })
  useEffect(() => {
    window.localStorage.setItem(CARD_SIZE_KEY, String(size))
  }, [size])
  return [size, setSize]
}

export default function DocumentGrid({ documents, folders, onOpen }: Props) {
  const [tailHover, setTailHover] = useState(false)
  const [cardSize, setCardSize] = useCardSize()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const lastSelectedRef = useRef<string | null>(null)

  // Drop stale selections when the document list changes (e.g. after a move)
  useEffect(() => {
    const ids = new Set(documents.map((d) => d.id))
    setSelected((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (ids.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [documents])

  // ESC clears selection
  useEffect(() => {
    if (selected.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])

  const sortedDocs = useMemo(() => documents, [documents])

  const handleCardClick = (doc: DocumentMeta, e: React.MouseEvent) => {
    const meta = e.metaKey || e.ctrlKey
    const shift = e.shiftKey
    if (meta) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(doc.id)) next.delete(doc.id)
        else next.add(doc.id)
        return next
      })
      lastSelectedRef.current = doc.id
      return
    }
    if (shift && lastSelectedRef.current) {
      const startIdx = sortedDocs.findIndex((d) => d.id === lastSelectedRef.current)
      const endIdx = sortedDocs.findIndex((d) => d.id === doc.id)
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
        setSelected((prev) => {
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) next.add(sortedDocs[i].id)
          return next
        })
        return
      }
    }
    if (selected.size > 0) {
      // In select mode, a bare click toggles instead of opening
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(doc.id)) next.delete(doc.id)
        else next.add(doc.id)
        return next
      })
      lastSelectedRef.current = doc.id
      return
    }
    onOpen(doc)
  }

  if (!documents.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
        ファイルをドロップ、または右下の + から追加
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto scroll-thin p-3 md:p-5">
      {selected.size > 0 ? (
        <SelectionBar
          count={selected.size}
          folders={folders}
          onMove={async (folderId) => {
            const ids = sortedDocs.filter((d) => selected.has(d.id)).map((d) => d.id)
            await moveDocuments(ids, folderId)
            setSelected(new Set())
          }}
          onDelete={async () => {
            if (!confirm(`選択した${selected.size}件を削除しますか？`)) return
            for (const id of selected) await deleteDocument(id)
            setSelected(new Set())
          }}
          onClear={() => setSelected(new Set())}
        />
      ) : (
        <div className="flex justify-end items-center gap-2 mb-2 text-neutral-600">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
            <rect x="3" y="3" width="6" height="6" rx="1" />
          </svg>
          <input
            type="range"
            min={CARD_MIN}
            max={CARD_MAX}
            step={10}
            value={cardSize}
            onChange={(e) => setCardSize(parseInt(e.target.value, 10))}
            className="w-24 md:w-32 h-1 accent-neutral-400 cursor-pointer"
            title="カードサイズ"
          />
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
          </svg>
        </div>
      )}
      <div
        className="grid gap-3 md:gap-4"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}
      >
        {sortedDocs.map((doc) => (
          <Card
            key={doc.id}
            doc={doc}
            folders={folders}
            selected={selected.has(doc.id)}
            selectionActive={selected.size > 0}
            allSelectedIds={selected}
            onClickCard={(e) => handleCardClick(doc, e)}
          />
        ))}
      </div>
      <div
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes(DOC_ID_MIME) ||
            e.dataTransfer.types.includes(DOC_IDS_MIME)
          ) {
            e.preventDefault()
            setTailHover(true)
          }
        }}
        onDragLeave={() => setTailHover(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(DOC_ID_MIME)
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

function SelectionBar({
  count,
  folders,
  onMove,
  onDelete,
  onClear,
}: {
  count: number
  folders: Folder[]
  onMove: (folderId: string | null) => void | Promise<void>
  onDelete: () => void | Promise<void>
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [folders],
  )

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 backdrop-blur-md">
      <span className="text-[12px] text-blue-200 font-medium">選択中: {count}件</span>
      <div className="flex-1" />
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[12px] px-3 py-1.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 transition flex items-center gap-1.5"
        >
          フォルダに移動
          <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
            <path d="M1 2.5l3.5 4L8 2.5z" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 min-w-[180px] max-h-[60vh] overflow-auto scroll-thin bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl py-1 z-20">
            <button
              onClick={() => { setOpen(false); onMove(null) }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-neutral-300 hover:bg-neutral-800 transition flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" className="opacity-60">
                <rect x="2" y="3" width="11" height="9" rx="1.5" />
                <path d="M2 5.5h11" />
              </svg>
              すべて（ルート）
            </button>
            {sortedFolders.length > 0 && <div className="my-1 border-t border-neutral-800" />}
            {sortedFolders.map((f) => (
              <button
                key={f.id}
                onClick={() => { setOpen(false); onMove(f.id) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-neutral-300 hover:bg-neutral-800 transition flex items-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-60">
                  <path d="M2 4.5V11a1 1 0 001 1h8a1 1 0 001-1V6a1 1 0 00-1-1H7L5.5 3H3a1 1 0 00-1 1v.5z" />
                </svg>
                <span className="truncate">{f.name}</span>
              </button>
            ))}
            {sortedFolders.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-neutral-600">フォルダがありません</div>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onDelete}
        className="text-[12px] px-2.5 py-1.5 rounded-md text-red-300 hover:bg-red-500/15 transition"
      >
        削除
      </button>
      <button
        onClick={onClear}
        className="text-[12px] px-2.5 py-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 transition"
      >
        選択解除
      </button>
    </div>
  )
}

function Card({
  doc,
  folders,
  selected,
  selectionActive,
  allSelectedIds,
  onClickCard,
}: {
  doc: DocumentMeta
  folders: Folder[]
  selected: boolean
  selectionActive: boolean
  allSelectedIds: Set<string>
  onClickCard: (e: React.MouseEvent) => void
}) {
  const [zone, setZone] = useState<'before' | 'after' | null>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div className="relative">
      {zone === 'before' && (
        <div className="absolute -left-2 top-1 bottom-1 w-1 bg-blue-500 rounded-full pointer-events-none shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
      )}
      {zone === 'after' && (
        <div className="absolute -right-2 top-1 bottom-1 w-1 bg-blue-500 rounded-full pointer-events-none shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
      )}
      <div
        draggable
        onDragStart={(e) => {
          // If this card is part of a multi-selection, drag the whole set
          if (selected && allSelectedIds.size > 1) {
            const ids = Array.from(allSelectedIds)
            e.dataTransfer.setData(DOC_IDS_MIME, JSON.stringify(ids))
          }
          // Always include the single id for back-compat with reorder/folder drops
          e.dataTransfer.setData(DOC_ID_MIME, doc.id)
          e.dataTransfer.effectAllowed = 'move'
          setDragging(true)
        }}
        onDragEnd={() => setDragging(false)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DOC_ID_MIME)) return
          // Multi-drag should not trigger card reorder
          if (e.dataTransfer.types.includes(DOC_IDS_MIME)) return
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          setZone(x < rect.width / 2 ? 'before' : 'after')
        }}
        onDragLeave={() => setZone(null)}
        onDrop={(e) => {
          const draggedId = e.dataTransfer.getData(DOC_ID_MIME)
          const droppedZone = zone
          setZone(null)
          if (!draggedId) return
          if (e.dataTransfer.types.includes(DOC_IDS_MIME)) return
          e.preventDefault()
          e.stopPropagation()
          if (draggedId === doc.id) return
          reorderDocument(draggedId, doc.id, droppedZone === 'after' ? 'after' : 'before')
        }}
        onClick={onClickCard}
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
        className={`relative group cursor-pointer flex flex-col rounded-xl overflow-hidden bg-neutral-900/80 border transition-all duration-150 ${
          selected
            ? 'border-blue-500 ring-2 ring-blue-500/40'
            : 'border-neutral-800/50 hover:border-neutral-600 hover:-translate-y-0.5'
        } ${dragging ? 'opacity-40' : ''}`}
      >
        {/* Selection checkbox — visible on hover or when selection is active */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClickCard({ ...e, metaKey: true } as unknown as React.MouseEvent)
          }}
          className={`absolute top-1.5 left-1.5 z-[1] w-5 h-5 rounded-full flex items-center justify-center transition ${
            selected
              ? 'bg-blue-500 text-white opacity-100'
              : selectionActive
                ? 'bg-neutral-900/70 border border-neutral-500 text-transparent opacity-100'
                : 'bg-neutral-900/70 border border-neutral-500 text-transparent opacity-0 group-hover:opacity-100'
          }`}
          title={selected ? '選択解除' : '選択'}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
          </svg>
        </button>

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
