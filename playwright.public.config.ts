import { defineConfig } from '@playwright/test';
import { E2E_BROWSER_LOCALE } from './e2e/support/regional';

// Fixture-only public UI suite: no login, user API, database or global teardown.
const port = Number(process.env.DX297_WEB_PORT ?? 3297);
export default defineConfig({
  testDir: './e2e',
  testMatch: 'public-anamnesis-accessibility.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: E2E_BROWSER_LOCALE,
    timezoneId: 'UTC',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
});
