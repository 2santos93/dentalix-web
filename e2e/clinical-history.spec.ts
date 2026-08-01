import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';

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
 * Auth: the backend resolves the tenant from the REQUEST HOST, so the whole
 * flow runs on `http://${subdomain}.localhost:3001` (see `./support/auth`),
 * not the shared `baseURL` (`http://localhost:3001`, which has no tenant).
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
const allergenValue = `AlergiaPenicilina-${suffix}`;
const anamnesisNotesValue = `NotaAnamnesisE2E-${suffix}`;
const evolutionNotes = `EvolucionControlE2E-${suffix}`;

test('save anamnesis + add evolution via the UI -> both persist through the backend after reload', async ({
  page,
}) => {
  const origin = await registerAndLogin(page, { subdomain, clinicName, fullName, email, password });

  // --- Create the patient we'll open the clinical history of ---
  await page.goto(`${origin}/patients/new`);
  await expect(page).toHaveURL(/\/patients\/new$/);

  await page.getByLabel('Nombre', { exact: true }).fill(patientFirstName);
  await page.getByLabel('Apellido', { exact: true }).fill(patientLastName);
  await page.getByLabel('Número de documento').fill(patientDocNumber);
  await page.getByLabel('Sexo').selectOption('F');

  const createError = page.locator('p[role="alert"]');
  // El alta de paciente es un WIZARD de 5 pasos y el submit ("Guardar") vive en
  // el último; con nombre+apellido llenos se puede saltar directo al final (ver
  // `goToStep` en patient-create-wizard.tsx). Antes esto pulsaba un botón "Crear
  // paciente" que ya no existe, y el spec se colgaba 30s en el click.
  await page.getByRole('button', { name: /Consentimiento/ }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  // El wizard redirige al DETALLE del paciente recién creado
  // (patient-create-wizard.tsx: `router.push(`/patients/${created.id}`)`), no a
  // la lista como hacía el formulario anterior.
  await expect(page)
    .toHaveURL(/\/patients\/[^/]+$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await createError.isVisible())
        ? await createError.textContent()
        : 'unknown (no redirect, no visible alert)';
      throw new Error(`Create patient did not land on the patient detail page. API error: ${message}`);
    });

  // Los pasos siguientes buscan al paciente en la LISTA, así que se vuelve a
  // ella (antes se llegaba ahí por la redirección).
  await page.goto(`${origin}/patients`);

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
  // Las alergias son una LISTA estructurada (`AllergyListEditor`): hay que
  // agregar una fila y llenar su "Alérgeno", no un textarea.
  await anamnesisSection.getByRole('button', { name: 'Agregar alergia' }).click();
  await anamnesisSection.getByLabel('Alérgeno').fill(allergenValue);
  await anamnesisSection.getByLabel('Notas').fill(anamnesisNotesValue);

  const anamnesisSaveError = anamnesisSection.locator('p[role="alert"]');
  // "Registrar anamnesis" / "Guardar nueva versión" es el TÍTULO (<h3>) del
  // formulario según haya o no versión previa; el botón de envío es "Guardar".
  await anamnesisSection.getByRole('button', { name: 'Guardar', exact: true }).click();

  // Scoped to `dd` — `formFromHistory` re-syncs the form's `<textarea>` with
  // the just-saved values too, so an unscoped text search matches BOTH the
  // rendered "Versión N" card AND the form field (strict-mode violation).
  await expect(anamnesisSection.locator('dd', { hasText: anamnesisNotesValue }))
    .toBeVisible({ timeout: 10_000 })
    .catch(async () => {
      const message = (await anamnesisSaveError.isVisible())
        ? await anamnesisSaveError.textContent()
        : 'unknown (no visible alert)';
      throw new Error(`Saving anamnesis failed. API error: ${message}`);
    });
  await expect(anamnesisSection.getByLabel('Alérgeno')).toHaveValue(allergenValue);
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
    anamnesisSectionAfterReload.locator('dd', { hasText: anamnesisNotesValue }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(anamnesisSectionAfterReload.getByLabel('Alérgeno')).toHaveValue(allergenValue);
  await expect(anamnesisSectionAfterReload.getByText('Versión 1')).toBeVisible();
  await expect(
    evolutionsSectionAfterReload.locator('table').getByText(evolutionNotes),
  ).toBeVisible({ timeout: 10_000 });
});
