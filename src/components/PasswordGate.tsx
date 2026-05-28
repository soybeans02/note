import { useEffect, useState, type ReactNode } from 'react'
import { isGateEnabled, isUnlocked, tryUnlock } from '../lib/passwordGate'

interface Props {
  children: ReactNode
}

export default function PasswordGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(() => !isGateEnabled() || isUnlocked())
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (unlocked) return
    // Re-check on focus in case another tab unlocked
    const recheck = () => { if (isUnlocked()) setUnlocked(true) }
    window.addEventListener('focus', recheck)
    return () => window.removeEventListener('focus', recheck)
  }, [unlocked])

  if (unlocked) return <>{children}</>

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const ok = await tryUnlock(password)
      if (ok) {
        setUnlocked(true)
      } else {
        setError(true)
        setPassword('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: '#0a0a0a' }}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xs px-6 py-7 mx-4 rounded-2xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-md shadow-2xl"
      >
        <div className="flex flex-col items-center gap-1 mb-5">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-neutral-400 mb-1">
            <rect x="7" y="14" width="18" height="14" rx="2" />
            <path d="M11 14v-4a5 5 0 0 1 10 0v4" />
            <circle cx="16" cy="21" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          <div className="text-[15px] text-white font-medium">Note</div>
          <div className="text-[11px] text-neutral-500">パスワードを入力</div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (error) setError(false) }}
          autoFocus
          autoComplete="current-password"
          spellCheck={false}
          className={`w-full px-3 py-2 text-[14px] rounded-lg bg-neutral-800/70 border outline-none transition placeholder:text-neutral-600 text-neutral-100 focus:bg-neutral-800 ${
            error
              ? 'border-red-500/60 focus:border-red-400'
              : 'border-neutral-700 focus:border-neutral-500'
          }`}
          placeholder="••••••••"
        />
        {error && (
          <div className="mt-2 text-[11px] text-red-400">パスワードが違います</div>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full py-2 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-neutral-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? '確認中…' : '開く'}
        </button>
      </form>
    </div>
  )
}
