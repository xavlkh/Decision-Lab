import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Dev reads VITE_* from .env. Production builds expose only BUILD_* so a
  // developer key can never be inlined into the client bundle.
  envPrefix: mode === 'production' ? 'BUILD_' : 'VITE_',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
}))
