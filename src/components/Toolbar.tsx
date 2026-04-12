import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { downloadBlob, exportAll, importAll } from '../lib/backup'

interface Props {
  search: string
  onSearch: (v: string) => void
  folderLabel: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
}

export default function Toolbar({ search, onSearch, folderLabel }: Props) {
  const stats = useLiveQuery(
    async () => {
      const docs = await db.documents.toArray()
      const total = docs.reduce((sum, d) => sum + (d.size ?? 0), 0)
      return { count: docs.length, total }
    },
    [],
    { count: 0, total: 0 },
  )

  return (
    <div className="h-11 px-5 border-b border-neutral-800/50 bg-neutral-900/40 flex items-center gap-3 text-sm whitespace-nowrap">
      <div className="font-medium text-white truncate max-w-[220px] shrink-0">
        {folderLabel}
      </div>
      <div className="flex-1 min-w-0 max-w-sm relative">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">
          <circle cx="6" cy="6" r="4" />
          <path d="M9 9l3 3" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="検索"
          className="w-full bg-neutral-900 border border-neutral-800 focus:border-neutral-600 focus:outline-none rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 transition"
        />
      </div>
      <div className="flex-1" />
      {stats.count > 0 && (
        <div className="text-[11px] text-neutral-600 shrink-0">
          {stats.count}件 · {formatBytes(stats.total)}
        </div>
      )}
      <button
        onClick={async () => {
          const blob = await exportAll()
          const stamp = new Date().toISOString().slice(0, 10)
          downloadBlob(blob, `note-backup-${stamp}.zip`)
        }}
        className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition shrink-0"
      >
        書き出し
      </button>
      <label className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition cursor-pointer shrink-0">
        読み込み
        <input
          type="file"
          accept=".zip"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const r = await importAll(file)
              alert(`インポート完了: フォルダ${r.folders}件, ドキュメント${r.documents}件`)
            } catch (err) {
              alert(`インポート失敗: ${(err as Error).message}`)
            }
          }}
        />
      </label>
    </div>
  )
}
