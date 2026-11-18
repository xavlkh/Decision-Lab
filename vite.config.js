import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Local development can read VITE_* and GEMINI_* from .env. Every build mode
  // exposes only BUILD_* so GEMINI_API_KEY can never be inlined into the client.
  envPrefix: mode === 'development' ? ['VITE_', 'GEMINI_'] : 'BUILD_',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
}))
