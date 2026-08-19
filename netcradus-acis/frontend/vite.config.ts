/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Vitest's default include glob (**/*.{test,spec}.*) otherwise also
    // picks up e2e/*.spec.ts and e2e-prod/*.spec.cjs - real Playwright
    // specs, not Vitest tests - and fails to collect them ("did not
    // expect test() to be called here") since they call Playwright's own
    // `test`/`describe`, not Vitest's. Real CI failure hit this exact
    // gap for e2e-prod/ (added later than e2e/, and not added here at
    // the same time) on this pipeline's first real run.
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/e2e-prod/**'],
  },
  build: {
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
