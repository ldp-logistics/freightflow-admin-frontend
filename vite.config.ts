import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Expose ENVIRONMENT from .env (password login only when ENVIRONMENT=dev)
  envPrefix: ['VITE_', 'ENVIRONMENT'],
  server: {
    port: 5174,
  },
})
