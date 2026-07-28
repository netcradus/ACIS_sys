import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Only polyfill 'global' as a standalone identifier — use globalThis
    // which is the standard cross-environment global object reference.
    // This avoids breaking library code that destructures from global.
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Ensure SPA fallback works — single index.html entry
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api/soar': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/api/red-team': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
