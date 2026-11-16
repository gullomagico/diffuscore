import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

// https://viteplus.dev/config/
// Cross-origin isolation (ADR-0002): required for SharedArrayBuffer.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    include: ['src/**/*.test.ts'],
  },
  lint: {
    ignorePatterns: [
      'dist/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.agents/**',
      '.claude/**',
    ],
    plugins: ['react', 'typescript', 'oxc'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'react/rules-of-hooks': 'error',
      'react/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  fmt: {
    ignorePatterns: [
      'dist/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.agents/**',
      '.claude/**',
    ],
    singleQuote: true,
    semi: false,
    sortPackageJson: true,
  },
})
