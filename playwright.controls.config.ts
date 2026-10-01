import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './ui-tests',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.APP_URL || 'http://127.0.0.1:43127', viewport: { width: 375, height: 667 }, actionTimeout: 10_000 },
  webServer: process.env.APP_URL ? undefined : {
    command: 'node serve.mjs public 43127',
    url: 'http://127.0.0.1:43127',
  },
  projects: [
    { name: 'chromium-phone', use: { browserName: 'chromium' } },
    { name: 'webkit-phone', use: { browserName: 'webkit' } },
  ],
});
