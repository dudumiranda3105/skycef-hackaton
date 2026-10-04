import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * `npm run dev:mock` sobe a interface com uma API simulada (dev-mock/), para desenvolver e demonstrar sem o
 * backend. Os arquivos do mock não entram no build de produção.
 */
function apiSimulada(): Plugin {
  const pasta = path.resolve(__dirname, 'dev-mock')
  return {
    name: 'api-simulada',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/ui/dev-mock', (req, res) => {
        const arquivo = path.join(pasta, path.basename((req.url ?? '').split('?')[0]))
        if (!fs.existsSync(arquivo)) {
          res.statusCode = 404
          res.end('não encontrado')
          return
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(fs.readFileSync(arquivo))
      })
    },
    transformIndexHtml(html) {
      if (process.env.VITE_MODE !== 'mock') return html
      return html.replace(
        '</head>',
        '<script src="/ui/dev-mock/mock.js"></script><script src="/ui/dev-mock/mock-auth.js"></script></head>',
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  process.env.VITE_MODE = mode
  return {
    // A interface é servida pelo Spring Boot em /ui/. O build vai direto para a pasta estática da API.
    base: '/ui/',
    plugins: [react(), tailwindcss(), apiSimulada()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:8000', '/health': 'http://localhost:8000' },
    },
    build: {
      outDir: '../api/src/main/resources/static/ui',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three'
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
            if (id.includes('node_modules/motion')) return 'motion'
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  }
})
