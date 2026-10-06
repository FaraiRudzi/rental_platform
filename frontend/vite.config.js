import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the React app proxies /api and /media to Django, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/media': 'http://localhost:8000',
    },
  },
})
