import { defineConfig } from '@playwright/test'

// End-to-end tests drive the real Electron app (main process + window) built
// into out/ by `npm run build`. Each test launches the app with its own
// temporary data folder, so a developer's own Typeshelf data is never touched.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1, // tests change the Windows font registry; run them one at a time
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  outputDir: 'test-results'
})
