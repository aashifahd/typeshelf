// Browser-only preview of the UI with a mock API: `npm run dev:web`.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
  plugins: [react()],
  server: { port: 5199, strictPort: true, fs: { allow: [resolve('.')] } }
})
