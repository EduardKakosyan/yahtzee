import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './audits',
  timeout: 600_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.APP_URL || 'http://localhost:3000', ...devices['Desktop Chrome'] },
});
