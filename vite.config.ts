import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { lingui } from '@lingui/vite-plugin'

export default defineConfig({
  // plugin-react v6 has no babel option; Lingui macros run via @rolldown/plugin-babel
  plugins: [react(), babel({ plugins: ['@lingui/babel-plugin-lingui-macro'] }), lingui(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
})
