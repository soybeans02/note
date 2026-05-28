import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PasswordGate from './components/PasswordGate'
import { initSync } from './lib/syncEngine'
import './styles.css'

// Try to mark storage persistent so the browser is less likely to evict our PDFs.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {})
}

// Kick off S3 sync (no-op if not configured).
void initSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PasswordGate>
      <App />
    </PasswordGate>
  </React.StrictMode>,
)
