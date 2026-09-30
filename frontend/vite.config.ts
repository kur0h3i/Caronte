import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo, Vite sirve el frontend y reenvía /api al backend (uvicorn en :8000).
// Así navegador y API comparten origen y la cookie de sesión funciona igual que en producción.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    outDir: 'dist',
  },
})
