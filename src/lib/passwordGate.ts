// Password gate utility — frontend-only SHA-256 check.
// The hash is baked in at build time via VITE_NOTE_PASSWORD_HASH; if unset,
// the gate is disabled (developer-friendly default).
//
// Security model: this is "URL leaked but app still won't open" tier. The
// hash is in the bundle, so the password itself is brute-forceable offline.
// Use a passphrase long enough to make that impractical (>=12 chars).

const STORAGE_KEY = 'note:gate-unlocked-at'
const VALID_FOR_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function expectedHash(): string | null {
  const raw = import.meta.env.VITE_NOTE_PASSWORD_HASH
  if (!raw || typeof raw !== 'string') return null
  return raw.trim().toLowerCase()
}

export function isGateEnabled(): boolean {
  return expectedHash() !== null
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function isUnlocked(): boolean {
  if (!isGateEnabled()) return true
  try {
    const at = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < VALID_FOR_MS
  } catch {
    return false
  }
}

export function markUnlocked() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

export function clearUnlocked() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export async function tryUnlock(password: string): Promise<boolean> {
  const expected = expectedHash()
  if (!expected) return true
  const got = await sha256Hex(password)
  if (got === expected) {
    markUnlocked()
    return true
  }
  return false
}
