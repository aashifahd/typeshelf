import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Strict CSP for production builds only (dev needs inline scripts for React refresh).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' tsfont: data: https://fonts.gstatic.com https://cdn.fontshare.com",
  "img-src 'self' data:",
  "connect-src 'self' tsfont:",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ')

const cspPlugin = (): Plugin => ({
  name: 'typeshelf-csp',
  apply: 'build',
  transformIndexHtml: (html: string) =>
    html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
})

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      externalizeDeps: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } }
    }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react(), cspPlugin()]
  }
})
