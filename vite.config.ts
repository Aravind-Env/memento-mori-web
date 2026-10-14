import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// `process` is provided by Node when Vite loads this config; declared here so the
// file type-checks even though the app itself only ships DOM/`vite/client` types.
declare const process: { env: Record<string, string | undefined> }

// Under GitHub Pages a project site is served from `/<repo>/`, so the workflow
// sets BASE_URL. Local dev/build defaults to the root.
const base = process.env.BASE_URL ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
