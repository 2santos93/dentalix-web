import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke e2e config for the register -> login flow.
 *
 * IMPORTANT — this config only manages the FRONTEND dev server (`npm run dev`,
 * :3001). The backend (`:3000`) and its Docker DB (`:5442`) must already be
 * running before `npm run test:e2e`:
 *
 *   cd ../dentalix-api && npm run start:dev
 *
 * (DB is a Docker Compose service on :5442, expected to already be up.)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
