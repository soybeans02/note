import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/note/',
  server: { port: 5273, strictPort: true },
  optimizeDeps: { include: ['pdfjs-dist'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'Note — PDF Library',
        short_name: 'Note',
        description: 'PDFを開いて手書き・テキストでメモできるローカルノート',
        lang: 'ja',
        start_url: '/note/',
        scope: '/note/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        orientation: 'any',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache every emitted asset. PDF.js worker is bundled via `?url`
        // import, so it lands in the build output and matches this glob.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,mjs,wasm}'],
        // Some pdfjs worker chunks are larger than the default 2 MiB cap.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/note/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: '/note/index.html',
      },
    }),
  ],
})
