import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// End-to-end tests: the built app, launched and driven through the
// platform's accessibility API (see support/launchApp.ts). Run with
// `npm run e2e`, on Linux inside scripts/e2e-linux-session.sh.
export default defineConfig({
  resolve: {
    alias: {
      '@e2e': fileURLToPath(new URL('.', import.meta.url)),
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['**/*.e2e.ts'],
    // One app at a time: tests share the display and the sound server.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
})
