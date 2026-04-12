import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Try to mark storage persistent so the browser is less likely to evict our PDFs.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
