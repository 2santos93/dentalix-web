import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * e2e: register clinic + login, create a patient, open its detail, save a
 * new anamnesis (medical-history) version AND add a clinical evolution
 * through the real UI, then reload the page and verify BOTH are still
 * shown — proving the "Historia clínica" tab persists through the real
 * backend (no mocks).
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
 *
 * Uniqueness: subdomain/email/patient last name/anamnesis+evolution copy are
 * suffixed with `E2E_RUN_SUFFIX`, an env var set by the `test:e2e` npm
 * script (see package.json) so repeated runs never collide with previously
 * created data. A local `npx playwright test` invocation (without the npm
 * script) falls back to `crypto.randomUUID()`. `RegisterDto.subdomain`
 * requires `/^[a-z0-9-]+$/`, so the suffix is kept lowercase-alphanumeric
 * only.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Test Clinic Clinical History ${suffix}`;
const subdomain = `test-clinic-ch-${suffix}`;
const fullName = 'Test User';
const email = `test.user.clinicalhistory.${suffix}@example.com`;
const password = 'Password123!';

const patientFirstName = 'Carla';
const patientLastName = `HistoriaPaciente${suffix}`;
const patientDocNumber = `DOCCH${suffix}`;

// Distinctive values so a plain text search on the page after reload can
// only match content that survived a real backend round-trip.
const allergiesValue = `AlergiaPenicilina-${suffix}`;
const medicalAlertsValue = `AlertaCardiaca-${suffix}`;
const evolutionNotes = `EvolucionControlE2E-${suffix}`;

test('save anamnesis + add evolution via the UI -> both persist through the backend after reload', async ({
  page,
}) => {
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
        return Boolean(parsed.state?.accessToken);
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

  // --- Create the patient we'll open the clinical history of ---
  await page.goto('/patients/new');
  await expect(page).toHaveURL(/\/patients\/new$/);

  await page.getByLabel('Nombre', { exact: true }).fill(patientFirstName);
  await page.getByLabel('Apellido', { exact: true }).fill(patientLastName);
  await page.getByLabel('Número de documento').fill(patientDocNumber);
  await page.getByLabel('Sexo').selectOption('F');

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

  // --- Open the "Historia clínica" tab ---
  const clinicalHistoryTab = page.getByRole('tab', { name: 'Historia clínica' });
  await clinicalHistoryTab.click();
  await expect(clinicalHistoryTab).toHaveAttribute('aria-selected', 'true');

  // Scope form interactions to each section — both "Anamnesis" and
  // "Evoluciones" render a field labeled "Notas", so an unscoped
  // `getByLabel('Notas')` would be ambiguous (strict-mode violation).
  const anamnesisSection = page.locator('section', { hasText: 'Anamnesis' });
  const evolutionsSection = page.locator('section', { hasText: 'Evoluciones' });

  // Brand-new patient -> no anamnesis/evolutions recorded yet.
  await expect(
    anamnesisSection.getByText('Aún no hay anamnesis registrada para este paciente.'),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    evolutionsSection.getByText('No hay evoluciones registradas todavía.'),
  ).toBeVisible({ timeout: 10_000 });

  // --- Save a new anamnesis version ---
  await anamnesisSection.getByLabel('Alergias').fill(allergiesValue);
  await anamnesisSection.getByLabel('Alertas médicas').fill(medicalAlertsValue);

  const anamnesisSaveError = anamnesisSection.locator('p[role="alert"]');
  await anamnesisSection.getByRole('button', { name: 'Guardar nueva versión' }).click();

  // Scoped to `dd` — `formFromHistory` re-syncs the form's `<textarea>` with
  // the just-saved values too, so an unscoped text search matches BOTH the
  // rendered "Versión N" card AND the form field (strict-mode violation).
  await expect(anamnesisSection.locator('dd', { hasText: allergiesValue }))
    .toBeVisible({ timeout: 10_000 })
    .catch(async () => {
      const message = (await anamnesisSaveError.isVisible())
        ? await anamnesisSaveError.textContent()
        : 'unknown (no visible alert)';
      throw new Error(`Saving anamnesis failed. API error: ${message}`);
    });
  await expect(anamnesisSection.locator('dd', { hasText: medicalAlertsValue })).toBeVisible();
  await expect(anamnesisSection.getByText('Versión 1')).toBeVisible();

  // --- Add a clinical evolution ---
  await evolutionsSection.getByLabel('Notas').fill(evolutionNotes);

  const evolutionCreateError = evolutionsSection.locator('p[role="alert"]');
  await evolutionsSection.getByRole('button', { name: 'Agregar evolución' }).click();

  // Scoped to the desktop `table` — the mobile card list is CSS-hidden but
  // still present in the DOM at the default Desktop Chrome viewport and
  // renders the same notes text, which would otherwise make this ambiguous
  // (strict mode), same pattern as `patients.spec.ts`.
  await expect(evolutionsSection.locator('table').getByText(evolutionNotes))
    .toBeVisible({ timeout: 10_000 })
    .catch(async () => {
      const message = (await evolutionCreateError.isVisible())
        ? await evolutionCreateError.textContent()
        : 'unknown (no visible alert)';
      throw new Error(`Adding a clinical evolution failed. API error: ${message}`);
    });

  // --- Reload the page: both must come back from the real backend ---
  await page.reload();

  await expect(
    page.getByRole('heading', { name: `${patientFirstName} ${patientLastName}` }),
  ).toBeVisible({ timeout: 10_000 });

  // The active tab is local component state, not persisted across a reload
  // -> the page comes back on "Datos"; reopen "Historia clínica".
  const clinicalHistoryTabAfterReload = page.getByRole('tab', { name: 'Historia clínica' });
  await clinicalHistoryTabAfterReload.click();
  await expect(clinicalHistoryTabAfterReload).toHaveAttribute('aria-selected', 'true');

  const anamnesisSectionAfterReload = page.locator('section', { hasText: 'Anamnesis' });
  const evolutionsSectionAfterReload = page.locator('section', { hasText: 'Evoluciones' });

  await expect(
    anamnesisSectionAfterReload.locator('dd', { hasText: allergiesValue }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    anamnesisSectionAfterReload.locator('dd', { hasText: medicalAlertsValue }),
  ).toBeVisible();
  await expect(anamnesisSectionAfterReload.getByText('Versión 1')).toBeVisible();
  await expect(
    evolutionsSectionAfterReload.locator('table').getByText(evolutionNotes),
  ).toBeVisible({ timeout: 10_000 });
});
