import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: process.env.CI ? 90_000 : 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'python3 -m http.server 4173 --directory e2e/fixtures',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
