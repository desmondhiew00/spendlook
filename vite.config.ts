import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { lingui } from '@lingui/vite-plugin'

export default defineConfig({
  // plugin-react v6 has no babel option; Lingui macros run via @rolldown/plugin-babel
  plugins: [
    react(),
    babel({ plugins: ['@lingui/babel-plugin-lingui-macro'] }),
    lingui(),
    tailwindcss(),
    {
      // dev only: mirror Cloudflare's /terms → terms.html (and /privacy, /paypay-csv), else Vite's SPA fallback serves the app
      name: 'html-pretty-urls',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/terms' || req.url === '/privacy' || req.url === '/paypay-csv') req.url += '.html'
          next()
        })
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // ja.html = same app with Japanese head tags, served at /ja (Cloudflare maps /ja → ja.html)
  build: { rolldownOptions: { input: { main: 'index.html', ja: 'ja.html' } } },
})
