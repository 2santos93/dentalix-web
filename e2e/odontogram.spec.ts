import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * e2e: register clinic + login, seed one `DentalCatalogItem` via the API
 * (using the just-issued token), create a patient, open its detail, open
 * the "Odontograma" tab, select a tooth surface in the SVG chart, register
 * a procedure on it through the real `ToothRecordPanel` form, then verify:
 *   - the record appears in that tooth's timeline;
 *   - the tooth surface in the chart is now colored with the catalog
 *     item's color (and its accessible name flips from "sana" to "con
 *     registro");
 * ...and that BOTH survive a full page reload (real backend round-trip,
 * no mocks) — proving Task 7 (Fase 2B) end to end.
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
 *
 * Uniqueness: subdomain/email/patient last name/catalog code+label are
 * suffixed with `E2E_RUN_SUFFIX`, an env var set by the `test:e2e` npm
 * script (see package.json) so repeated runs never collide with
 * previously-created data. A local `npx playwright test` invocation
 * (without the npm script) falls back to `crypto.randomUUID()`.
 * `RegisterDto.subdomain` requires `/^[a-z0-9-]+$/`, so the suffix is kept
 * lowercase-alphanumeric only.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Test Clinic Odontogram ${suffix}`;
const subdomain = `test-clinic-odo-${suffix}`;
const fullName = 'Test User';
const email = `test.user.odontogram.${suffix}@example.com`;
const password = 'Password123!';

const patientFirstName = 'Diego';
const patientLastName = `Odontograma${suffix}`;
const patientDocNumber = `DOCODO${suffix}`;

// Catalog item seeded via API (per task brief: the tooth-record panel needs
// at least one item to register anything on a tooth). Distinctive label so
// timeline/text assertions can only match content from THIS run.
const catalogCode = `obturacion-${suffix}`;
const catalogLabel = `Obturación-${suffix}`;
const catalogColor = '#3366CC';
const catalogColorRgb = 'rgb(51, 102, 204)'; // browsers normalize inline hex fill -> rgb() in computed style

const toothFdi = '11';

test('register a procedure on a tooth -> colored + in timeline, persists after reload', async ({ page }) => {
  // --- Register ---
  await page.goto('/register');

  await page.getByLabel('Nombre de la clínica').fill(clinicName);
  await page.getByLabel('Subdominio').fill(subdomain);
  await page.getByLabel('Nombre completo').fill(fullName);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  const registerError = page.locator('p[role="alert"]');
  await expect(page)
    .toHaveURL(/\/login$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await registerError.isVisible())
        ? await registerError.textContent()
        : 'unknown (no redirect, no visible alert)';
      throw new Error(`Register did not redirect to /login. API error: ${message}`);
    });

  // --- Login ---
  // localhost:3001 has no tenant subdomain, so LoginForm renders the
  // subdomain input in addition to email/password.
  await page.getByLabel('Subdominio de la clínica').fill(subdomain);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const loginError = page.locator('p[role="alert"]');

  let accessToken = '';
  await expect
    .poll(
      async () => {
        if (await loginError.isVisible()) {
          const message = await loginError.textContent();
          throw new Error(`Login failed with API error: ${message}`);
        }
        const raw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { state?: { accessToken?: string | null } };
        accessToken = parsed.state?.accessToken ?? '';
        return Boolean(accessToken);
      },
      { timeout: 10_000, message: 'expected a persisted accessToken after login' },
    )
    .toBe(true);

  // LoginForm fires `router.push('/dashboard')` right after persisting the
  // tokens — that client-side navigation can still be in flight when we
  // issue our own `page.goto` below, which would abort it
  // (net::ERR_ABORTED). Let it settle first (that route may 404, that's
  // fine — we only need the in-flight navigation resolved).
  await page.waitForURL(/\/dashboard$/, { timeout: 5_000 }).catch(() => {});

  // --- Seed one DentalCatalogItem via the real API (needed by the
  // tooth-record panel to register anything on a tooth) ---
  const seedResponse = await page.request.post('http://localhost:3000/api/v1/catalog/items', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      code: catalogCode,
      kind: 'PROCEDURE',
      labelEs: catalogLabel,
      color: catalogColor,
    },
  });
  expect(seedResponse.ok(), `Seeding the catalog item failed: ${await seedResponse.text()}`).toBeTruthy();

  // --- Create the patient we'll register a procedure on ---
  await page.goto('/patients/new');
  await expect(page).toHaveURL(/\/patients\/new$/);

  await page.getByLabel('Nombre', { exact: true }).fill(patientFirstName);
  await page.getByLabel('Apellido', { exact: true }).fill(patientLastName);
  await page.getByLabel('Número de documento').fill(patientDocNumber);
  await page.getByLabel('Sexo').selectOption('M');

  const createError = page.locator('p[role="alert"]');
  await page.getByRole('button', { name: 'Crear paciente' }).click();

  await expect(page)
    .toHaveURL(/\/patients$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await createError.isVisible())
        ? await createError.textContent()
        : 'unknown (no redirect, no visible alert)';
      throw new Error(`Create patient did not redirect to /patients. API error: ${message}`);
    });

  // --- Open the patient's detail page ---
  // Scope to the desktop `table` — the mobile card list is CSS-hidden but
  // still present in the DOM at the default Desktop Chrome viewport, and
  // would otherwise make the link lookup ambiguous (strict mode).
  const patientLink = page.locator('table').getByRole('link', { name: `${patientFirstName} ${patientLastName}` });
  await expect(patientLink).toBeVisible({ timeout: 10_000 });
  await patientLink.click();

  await expect(page).toHaveURL(/\/patients\/[^/]+$/);
  await expect(
    page.getByRole('heading', { name: `${patientFirstName} ${patientLastName}` }),
  ).toBeVisible({ timeout: 10_000 });

  // --- Open the "Odontograma" tab ---
  const odontogramTab = page.getByRole('tab', { name: 'Odontograma' });
  await odontogramTab.click();
  await expect(odontogramTab).toHaveAttribute('aria-selected', 'true');

  // Chart's outer wrapper (role="group", aria-label="Odontograma") — distinct
  // role from the tab above, so no ambiguity despite the identical name.
  const chart = page.getByRole('group', { name: 'Odontograma', exact: true });
  await expect(chart).toBeVisible({ timeout: 10_000 });

  // --- Select tooth 11's Oclusal surface in the SVG chart ---
  // A regex (not the exact healthy-state label) so the same locator still
  // matches after the surface's accessible name flips to "... con registro"
  // post-save, and again after reload.
  const occlusalSurface = chart.getByRole('button', { name: new RegExp(`Diente ${toothFdi}, cara oclusal`) });
  await occlusalSurface.click();

  // Clicking the surface both selects the tooth AND pre-checks "Oclusal" in
  // the record panel (see odontogram-tab.tsx's `handleSelectSurface`).
  const recordForm = page.getByRole('form', { name: `Registrar en el diente ${toothFdi}` });
  await expect(recordForm).toBeVisible({ timeout: 10_000 });

  const timeline = page.getByRole('list', { name: `Historial del diente ${toothFdi}` });
  // Brand-new tooth -> empty timeline before we save anything.
  await expect(page.getByText('No hay registros para este diente todavía.')).toBeVisible({ timeout: 10_000 });

  // --- Fill and submit the tooth-record form ---
  await recordForm.getByLabel(catalogLabel).check();
  await expect(recordForm.getByLabel('Oclusal')).toBeChecked();

  const saveError = recordForm.locator('p[role="alert"]');
  await recordForm.getByRole('button', { name: 'Guardar' }).click();

  // --- The record now appears in the tooth's timeline ---
  await expect(timeline.getByText(catalogLabel))
    .toBeVisible({ timeout: 10_000 })
    .catch(async () => {
      const message = (await saveError.isVisible()) ? await saveError.textContent() : 'unknown (no visible alert)';
      throw new Error(`Registering the tooth record failed. API error: ${message}`);
    });
  await expect(timeline.getByText('oclusal')).toBeVisible();

  // --- The tooth surface in the chart is now colored with the catalog item's color ---
  await expect(occlusalSurface).toHaveCSS('fill', catalogColorRgb, { timeout: 10_000 });
  // ...and its accessible name reflects it now has a record.
  await expect(
    chart.getByRole('button', { name: new RegExp(`Diente ${toothFdi}, cara oclusal, con registro`) }),
  ).toBeVisible();

  // --- Reload: both the coloring and the timeline entry must survive ---
  await page.reload();

  await expect(
    page.getByRole('heading', { name: `${patientFirstName} ${patientLastName}` }),
  ).toBeVisible({ timeout: 10_000 });

  // The active tab is local component state, not persisted across a reload
  // -> the page comes back on "Datos"; reopen "Odontograma".
  const odontogramTabAfterReload = page.getByRole('tab', { name: 'Odontograma' });
  await odontogramTabAfterReload.click();
  await expect(odontogramTabAfterReload).toHaveAttribute('aria-selected', 'true');

  const chartAfterReload = page.getByRole('group', { name: 'Odontograma', exact: true });
  await expect(chartAfterReload).toBeVisible({ timeout: 10_000 });

  // Colored surface, and its accessible name, persisted through the backend.
  const occlusalSurfaceAfterReload = chartAfterReload.getByRole('button', {
    name: new RegExp(`Diente ${toothFdi}, cara oclusal, con registro`),
  });
  await expect(occlusalSurfaceAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(occlusalSurfaceAfterReload).toHaveCSS('fill', catalogColorRgb);

  // Re-select the tooth to reopen its timeline, which still shows the record.
  await occlusalSurfaceAfterReload.click();
  const timelineAfterReload = page.getByRole('list', { name: `Historial del diente ${toothFdi}` });
  await expect(timelineAfterReload.getByText(catalogLabel)).toBeVisible({ timeout: 10_000 });
  await expect(timelineAfterReload.getByText('oclusal')).toBeVisible();
});
