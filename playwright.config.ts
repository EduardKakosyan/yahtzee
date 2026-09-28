import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './checks',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
