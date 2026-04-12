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
    <div className="h-12 px-5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-3 text-sm whitespace-nowrap">
      <div className="font-semibold text-slate-200 truncate max-w-[220px] shrink-0">{folderLabel}</div>
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="名前で検索…"
        className="flex-1 min-w-0 max-w-md bg-slate-800/70 border border-slate-700 focus:border-sky-500 focus:outline-none rounded px-3 py-1.5 text-slate-100 placeholder:text-slate-500"
      />
      <div className="flex-1" />
      {stats.count > 0 && (
        <div className="text-[11px] text-slate-500 shrink-0">
          {stats.count}件 · {formatBytes(stats.total)}
        </div>
      )}
      <button
        onClick={async () => {
          const blob = await exportAll()
          const stamp = new Date().toISOString().slice(0, 10)
          downloadBlob(blob, `note-backup-${stamp}.zip`)
        }}
        className="text-xs px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-300 shrink-0"
      >
        エクスポート
      </button>
      <label className="text-xs px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-300 cursor-pointer shrink-0">
        インポート
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
