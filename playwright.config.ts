import { defineConfig, devices } from '@playwright/test';
import { E2E_BROWSER_LOCALE } from './e2e/support/regional';
import { WEB_PORT } from './e2e/support/urls';
import { SEDE_TODAY_TZ } from './e2e/support/clock';

// DX-449: la zona «de hoy» se elige una vez, en el proceso principal; los
// workers la heredan por el entorno y todos los specs usan la misma.
process.env.E2E_SEDE_TODAY_TZ ??= SEDE_TODAY_TZ;

/**
 * Suite e2e de la web contra la API y la base reales.
 *
 * La API (y su base) NO las arranca este config: deben estar levantadas antes
 * (`cd ../dentalix-api && npm run start:dev`, Postgres en :5442), o se usa
 * `scripts/e2e-ci.sh`, que hace la misma secuencia que la CI (DX-070).
 *
 * La web, según `E2E_WEB_SERVER`:
 * - sin definir (local): `next dev` en WEB_PORT, reutilizando uno ya abierto;
 * - `start`: `next start` (requiere un `next build` previo);
 * - `none`: ya está arrancada (lo que hace `scripts/e2e-ci.sh`).
 */
const isCI = !!process.env.CI;
const jsonReport: ['json', { outputFile: string }] = ['json', { outputFile: 'playwright-results.json' }];
const webServerMode = process.env.E2E_WEB_SERVER ?? 'dev';
const webServerCommand: Record<string, string> = {
  dev: `npx next dev -p ${WEB_PORT}`,
  start: `npx next start -p ${WEB_PORT}`,
};
if (webServerMode !== 'none' && !webServerCommand[webServerMode]) {
  throw new Error(`E2E_WEB_SERVER="${webServerMode}" no es válido: usa dev, start o none.`);
}

export default defineConfig({
  testDir: './e2e',
  // DX-337: rojo si la suite deja sedes o personal de más en la clínica demo.
  globalTeardown: './e2e/support/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  // Un reintento solo en CI, para no esconder en local un test inestable; el
  // reporter de CI lo marca como "flaky" igualmente.
  retries: isCI ? 1 : 0,
  workers: 1,
  // DX-252: en CI (y con E2E_REPORT_JSON, que pone scripts/e2e-ci.sh) también
  // el informe JSON, que lee scripts/check-e2e-skips.mjs para poner la E2E en
  // rojo si se salta un test fuera de e2e/allowed-skips.json.
  reporter: isCI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], jsonReport]
    : process.env.E2E_REPORT_JSON
      ? [['list'], jsonReport]
      : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // La zona de la sede, no la del runner (en GitHub, UTC): así las fechas y
    // horas que pinta la UI no dependen de la máquina.
    timezoneId: 'America/Bogota',
    // Idioma sin región: la suite no recibe ninguna sugerencia de país (DX-312
    // P1). Ni `en-US` (del runner) ni otro con región, que sugeriría su país.
    locale: E2E_BROWSER_LOCALE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium ya instalado en el sistema (p. ej. cuando no se puede descargar
        // el de Playwright): PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chrome.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer:
    webServerMode === 'none'
      ? undefined
      : {
          // Puerto configurable (ver e2e/support/urls.ts); por defecto el de `npm run dev`.
          command: webServerCommand[webServerMode],
          url: `http://localhost:${WEB_PORT}`,
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
});
