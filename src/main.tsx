import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initSync } from './lib/syncEngine'
import './styles.css'

// Try to mark storage persistent so the browser is less likely to evict our PDFs.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {})
}

// Kick off S3 sync (no-op if not configured).
void initSync()

// Clean up the unlock token left behind by the removed password gate.
try {
  localStorage.removeItem('note:gate-unlocked-at')
} catch {
  /* ignore */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
