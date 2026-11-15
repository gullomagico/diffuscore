import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

// https://viteplus.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
  lint: {
    ignorePatterns: ['dist/**', '.agents/**', '.claude/**'],
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
    ignorePatterns: ['dist/**', '.agents/**', '.claude/**'],
    singleQuote: true,
    semi: false,
    sortPackageJson: true,
  },
})
