import { defineConfig } from '@playwright/test'

// Uses the installed Chrome by default; without it: `npx playwright install chromium` and PW_CHANNEL=chromium.
const CHANNEL = process.env.PW_CHANNEL ?? 'chrome'
const PORT = 5199
// The build served from a folder, as a static host does (e2e/hosting.spec.js).
const PREVIEW_PORT = 4173
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/spacemap/`
// Both servers show the test world (test-world/), not the site's own content.
const WORLD = { SPACEMAP_PUBLIC_DIR: 'node_modules/.test-public' }
const TEST_DIST = 'node_modules/.test-dist'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Pixi and the CRT animations are heavy: one page at a time keeps timings stable.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: CHANNEL === 'chromium' ? undefined : CHANNEL,
    viewport: { width: 1400, height: 900 }
  },
  webServer: [
    {
      command: `node scripts/testPublic.mjs && npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: WORLD
    },
    {
      command: `node scripts/testPublic.mjs && npx vite build --outDir ${TEST_DIST} --emptyOutDir && npx vite preview --outDir ${TEST_DIST} --port ${PREVIEW_PORT} --strictPort --base /spacemap/`,
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // As the GitHub Pages workflow gives it, so the link previews have their pictures.
      env: { ...WORLD, SITE_URL: PREVIEW_URL }
    }
  ]
})
