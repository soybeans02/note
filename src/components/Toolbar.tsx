import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { downloadBlob, exportAll, importAll } from '../lib/backup'

function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

interface Props {
  search: string
  onSearch: (v: string) => void
  folderLabel: string
  isMobile?: boolean
  onMenuToggle?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
}

export default function Toolbar({ search, onSearch, folderLabel, isMobile, onMenuToggle }: Props) {
  const online = useOnline()
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
    <div className="h-11 px-3 md:px-5 border-b border-neutral-800/50 bg-neutral-900/40 flex items-center gap-2 md:gap-3 text-sm whitespace-nowrap">
      {isMobile && (
        <button
          onClick={onMenuToggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        </button>
      )}
      <div className="font-medium text-white truncate max-w-[160px] md:max-w-[220px] shrink-0">
        {folderLabel}
      </div>
      <div className="flex-1 min-w-0 max-w-sm relative hidden sm:block">
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
      {!online && (
        <div
          title="オフライン中 — 操作はすべてローカルで完結します"
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 shrink-0"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M1 4l10 4M2.5 6.5l7 2.8" />
            <circle cx="6" cy="10" r="0.6" fill="currentColor" stroke="none" />
            <path d="M1.5 1.5l9 9" />
          </svg>
          <span>オフライン</span>
        </div>
      )}
      {!isMobile && stats.count > 0 && (
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
        className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition shrink-0 hidden sm:block"
      >
        書き出し
      </button>
      <label className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition cursor-pointer shrink-0 hidden sm:block">
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
