import { defineConfig, devices } from '@playwright/test';
import { WEB_PORT } from './e2e/support/urls';

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
    baseURL: `http://localhost:${WEB_PORT}`,
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
    // Puerto configurable (ver e2e/support/urls.ts); por defecto el de `npm run dev`.
    command: `npx next dev -p ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
