import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/note/',
  server: { port: 5273, strictPort: true },
  optimizeDeps: { include: ['pdfjs-dist'] },
})
