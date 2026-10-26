import { defineConfig } from '@playwright/test'
import { join } from 'node:path'

export default defineConfig({
  testDir: '.',
  testMatch: 'auth-browser.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : process.env.TMPDIR!, 'finanzas-web-test-results'),
  use: { channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true, viewport: { width: 1280, height: 800 } }
})
