import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      exclude: [
        'dist/**',
        'src/engine/types.ts',
        'src/engine/constants.ts',
        'eslint.config.js',
        'vite.config.ts',
        'vitest.config.ts',
        'src/App.tsx',
        'src/main.tsx',
      ],
    },
  },
})
