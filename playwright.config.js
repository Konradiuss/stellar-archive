import { defineConfig } from '@playwright/test'

// Uses the installed Chrome by default; without it: `npx playwright install chromium` and PW_CHANNEL=chromium.
const CHANNEL = process.env.PW_CHANNEL ?? 'chrome'
const PORT = 5199
// The build served from a folder, as a static host does (e2e/hosting.spec.js).
const PREVIEW_PORT = 4173
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/spacemap/`

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
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --strictPort --base /spacemap/`,
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // As the GitHub Pages workflow gives it, so the link previews have their pictures.
      env: { SITE_URL: PREVIEW_URL }
    }
  ]
})
