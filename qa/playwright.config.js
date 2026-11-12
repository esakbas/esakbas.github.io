import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } }
  ],
  webServer: {
    command: 'node scripts/browser-fixture.js',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { NODE_ENV: 'test', SITE_URL: 'http://127.0.0.1:4173' }
  }
});
