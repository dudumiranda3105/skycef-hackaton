import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => {
  const naVercel = process.env.VERCEL === '1'
  return {
    // Na Vercel o app fica na raiz; no Docker continua sendo servido pelo Spring em /ui/.
    base: naVercel ? '/' : '/ui/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:8000', '/health': 'http://localhost:8000' },
    },
    build: {
      outDir: naVercel ? 'dist' : '../api/src/main/resources/static/ui',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
            if (id.includes('node_modules/motion')) return 'motion'
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  }
})
