import { test, expect, type Locator } from './support/test';
import { randomUUID } from 'node:crypto';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { openPatientTab } from './support/patient-tabs';

/**
 * e2e: register clinic + login, seed one `DentalCatalogItem` (PROCEDURE, with
 * a `defaultPrice`) via the API using the just-issued token, create a
 * patient, open its detail, open the "Plan de tratamiento" tab, create a
 * DRAFT plan (`TreatmentPlansTab.handleCreatePlan`), add an item picking the
 * seeded procedure (price prefills from its `defaultPrice`, editable) and
 * verify:
 *   - the item row appears with tooth/procedure/price and the plan's total
 *     reflects it;
 *   - changing the item's status (PROPOSED -> DONE, "Realizado") via its
 *     per-row `<select>` is reflected;
 *   - adding a SECOND item makes the total the sum of both, and removing one
 *     ("Quitar") drops it back down;
 * ...and that ALL of the above (remaining item + its DONE status + the
 * dropped total) survive a full page reload (real backend round-trip, no
 * mocks) — proving Task 3 (Fase treatment-plans-frontend) end to end.
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
 * (both overridable with E2E_API_URL / E2E_WEB_PORT, see `./support/urls`).
 *
 * Auth: the backend resolves the tenant from the REQUEST HOST, so the whole
 * flow runs on `http://${subdomain}.localhost:3001` (see `./support/auth`),
 * not the shared `baseURL` (`http://localhost:3001`, which has no tenant).
 * The catalog-item seed call below is a raw `page.request.post` (not routed
 * through the app's `apiFetch` client), so it must set `X-Tenant-Host` itself
 * — the same header the browser would send for this origin (same pattern as
 * `odontogram.spec.ts`).
 *
 * Uniqueness: subdomain/email/patient last name/catalog code+label are
 * suffixed with `E2E_RUN_SUFFIX`, an env var set by the `test:e2e` npm
 * script (see package.json) so repeated runs never collide with previously
 * created data. A local `npx playwright test` invocation (without the npm
 * script) falls back to `crypto.randomUUID()`. `RegisterDto.subdomain`
 * requires `/^[a-z0-9-]+$/`, so the suffix is kept lowercase-alphanumeric
 * only.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Test Clinic Treatment Plans ${suffix}`;
const subdomain = `test-clinic-tp-${suffix}`;
const fullName = 'Test User';
const email = `test.user.treatmentplans.${suffix}@example.com`;
const password = 'Password123!';

const patientFirstName = 'Lucia';
const patientLastName = `PlanTratamiento${suffix}`;
const patientDocNumber = `DOCTP${suffix}`;

// Catalog item seeded via API (per task brief: the add-item form needs at
// least one catalog procedure to select). Distinctive label so table/total
// assertions can only match content from THIS run.
const catalogCode = `resina-${suffix}`;
const catalogLabel = `Resina-${suffix}`;
const catalogColor = '#3366CC';
const defaultPrice = 45_000;

const tooth1 = '11';
const tooth2 = '21';

// El plan nace en la moneda de la sede (G1, DX-313: nunca un USD por defecto),
// la que el registro le dio (`E2E_REGION`), y la UI formatea los importes del
// plan con el formato de esa sede y el código ISO (DX-386, DX-489) usando el
// MISMO helper que se importa aquí, así las aserciones no dependen de cómo el
// ICU de turno pinte los separadores.
const planCurrency = E2E_REGION.currency;
const money = (amount: number): string => moneyWithCode(amount, planCurrency, regionalFormat(E2E_REGION));

test('treatment plan: create -> add item -> total -> status DONE -> remove -> total drops -> persists on reload', async ({
  page,
}) => {
  const origin = await registerAndLogin(page, { subdomain, clinicName, fullName, email, password });

  const accessToken = await accessTokenOf(page);
  expect(accessToken).toBeTruthy();

  // --- Seed one DentalCatalogItem via the real API (needed by the add-item
  // form's procedure select, and to prefill the price) ---
  const seedResponse = await page.request.post(`${API_URL}/catalog/items`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-Host': new URL(origin).host,
    },
    data: {
      code: catalogCode,
      kind: 'PROCEDURE',
      labelEs: catalogLabel,
      color: catalogColor,
      defaultPrice,
    },
  });
  expect(seedResponse.ok(), `Seeding the catalog item failed: ${await seedResponse.text()}`).toBeTruthy();

  // --- Create the patient we'll build a treatment plan for ---
  await page.goto(`${origin}/patients/new`);
  await expect(page).toHaveURL(/\/patients\/new$/);

  await page.getByLabel('Nombre', { exact: true }).fill(patientFirstName);
  await page.getByLabel('Tipo de documento').selectOption('NATIONAL_ID');
  await page.getByLabel('Apellido', { exact: true }).fill(patientLastName);
  await page.getByLabel('Número de documento').fill(patientDocNumber);
  await page.getByLabel('Sexo').selectOption('F');

  const createPatientError = page.locator('p[role="alert"]');
  // El alta de paciente es un WIZARD de 5 pasos; «Crear paciente» está en todos (solo el 1.º es obligatorio) y vive en
  // el último; con nombre, apellido y tipo de documento se puede saltar directo al final (ver
  // `goToStep` en patient-create-wizard.tsx). Antes esto pulsaba un botón "Crear
  // paciente" que ya no existe, y el spec se colgaba 30s en el click.
  await page.getByRole('button', { name: /Autorización de datos/ }).click();
  await page.getByRole('button', { name: 'Crear paciente' }).click();

  // El wizard redirige al DETALLE del paciente recién creado
  // (patient-create-wizard.tsx: `router.push(`/patients/${created.id}`)`), no a
  // la lista como hacía el formulario anterior.
  await expect(page)
    .toHaveURL(/\/patients\/[^/]+$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await createPatientError.isVisible())
        ? await createPatientError.textContent()
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

  // --- Open the "Plan de tratamiento" tab ---
  await openPatientTab(page, 'Plan de tratamiento');

  const tabPanel = page.locator('#tabpanel-treatment-plans');
  await expect(tabPanel).toBeVisible({ timeout: 10_000 });

  // Brand-new patient -> no plans yet.
  await expect(tabPanel.getByText('Este paciente todavía no tiene un plan de tratamiento.')).toBeVisible({
    timeout: 10_000,
  });

  // --- Create a new (DRAFT) plan ---
  await tabPanel.getByRole('button', { name: 'Nuevo plan' }).click();

  const planDetailHeading = tabPanel.getByRole('heading', { name: 'Detalle del plan' });
  await expect(planDetailHeading).toBeVisible({ timeout: 10_000 });
  // DRAFT plan -> "Borrador" badge next to the heading. `.first()` because
  // once `planDetail` loads, the plan-status `<select>`'s own "Borrador"
  // `<option>` also matches this text (same DOM, appears after the badge) —
  // the badge is the first "Borrador" text node either way.
  await expect(tabPanel.getByText('Borrador', { exact: true }).first()).toBeVisible();
  // Brand-new plan -> no items yet.
  await expect(tabPanel.getByText('Este plan todavía no tiene ítems.')).toBeVisible({ timeout: 10_000 });

  // Resumen de dinero del plan (`PlanMoneySummary`): un `<dl>` con pares
  // `<dt>`/`<dd>` (roles `term`/`definition`). Se busca el par cuyo término es
  // exactamente «Total» — no «Total a financiar» del plan de pagos — y se lee
  // su definición, sin depender del orden de las cifras ni de clases CSS.
  const totalValueIn = (scope: Locator) =>
    scope
      .locator('dl > div')
      .filter({ has: page.getByRole('term').getByText('Total', { exact: true }) })
      .getByRole('definition');
  const totalValue = () => totalValueIn(tabPanel);
  await expect(totalValue()).toHaveText(money(0));

  // --- Add the first item (tooth 11), picking the seeded procedure ---
  const addItemForm = tabPanel.getByRole('form', { name: 'Agregar ítem' });
  await expect(addItemForm).toBeVisible({ timeout: 10_000 });

  // El diente se elige en `ToothPicker` (mapa del odontograma + campo de texto
  // «Código FDI» como segunda vía) y el procedimiento en `CatalogPicker` (un
  // filtro sobre una lista de radios dentro del `fieldset` «Procedimiento»).
  // Se usa el campo de texto y el filtro: son la vía accesible por teclado y no
  // dependen de la geometría del mapa ni de cuántos ítems traiga el catálogo.
  const toothInput = addItemForm.getByRole('textbox', { name: 'Código FDI' });
  const procedureGroup = addItemForm.getByRole('group', { name: 'Procedimiento' });
  const pickProcedure = async () => {
    await procedureGroup.getByRole('searchbox', { name: 'Buscar en el catálogo' }).fill(catalogLabel);
    await procedureGroup.getByRole('radio', { name: catalogLabel }).check();
  };

  await toothInput.fill(tooth1);
  await expect(addItemForm.getByText(`Diente ${tooth1} seleccionado.`)).toBeVisible();
  await pickProcedure();

  // Price prefills from the catalog item's `defaultPrice` (still editable).
  // DX-241: campo de dinero de texto (<MoneyInput>), ya no type=number.
  const priceInput = addItemForm.getByRole('textbox', { name: 'Precio' });
  await expect(priceInput).toHaveValue(String(defaultPrice));

  const addItemError = addItemForm.locator('p[role="alert"]');
  await addItemForm.getByRole('button', { name: 'Agregar ítem' }).click();

  const itemRow = (tooth: string) =>
    tabPanel.locator('table tbody tr').filter({ has: page.getByRole('cell', { name: tooth, exact: true }) });

  await expect(itemRow(tooth1))
    .toBeVisible({ timeout: 10_000 })
    .catch(async () => {
      const message = (await addItemError.isVisible()) ? await addItemError.textContent() : 'unknown (no visible alert)';
      throw new Error(`Adding the treatment plan item failed. API error: ${message}`);
    });
  await expect(itemRow(tooth1)).toContainText(catalogLabel);
  await expect(itemRow(tooth1)).toContainText(money(defaultPrice));
  // Default item status is PROPOSED ("Propuesto").
  await expect(itemRow(tooth1)).toContainText('Propuesto');

  // --- The plan's total now reflects the single item's price ---
  await expect(totalValue()).toHaveText(money(defaultPrice));

  // --- Change item 1's status: PROPOSED -> DONE ("Realizado") ---
  const itemStatusSelect = (tooth: string) => itemRow(tooth).getByLabel(`Estado del ítem del diente ${tooth}`);
  await itemStatusSelect(tooth1).selectOption({ label: 'Realizado' });
  // DX-050: «Realizado» pide quién lo hizo; la titular (ADMIN, atiende) viene elegida.
  const markDone = page.getByRole('dialog', { name: 'Marcar como realizado' });
  await expect(markDone.getByLabel('Profesional que lo realizó')).not.toHaveValue('');
  await markDone.getByRole('button', { name: 'Marcar realizado' }).click();
  await expect(markDone).toBeHidden();
  await expect(itemRow(tooth1)).toContainText(`Realizado por ${fullName}`, { timeout: 10_000 });
  await expect(itemStatusSelect(tooth1)).toHaveValue('DONE');

  // --- Add a second item (tooth 21), same seeded procedure ---
  await toothInput.fill(tooth2);
  await expect(addItemForm.getByText(`Diente ${tooth2} seleccionado.`)).toBeVisible();
  await pickProcedure();
  await expect(priceInput).toHaveValue(String(defaultPrice));
  await addItemForm.getByRole('button', { name: 'Agregar ítem' }).click();

  await expect(itemRow(tooth2)).toBeVisible({ timeout: 10_000 });
  await expect(itemRow(tooth2)).toContainText(money(defaultPrice));

  // --- Total is now the sum of both items ---
  await expect(totalValue()).toHaveText(money(defaultPrice * 2));

  // --- Remove item 2 ("Quitar") -> it disappears and the total drops back ---
  // Quitar es irreversible desde la app, así que pide confirmación en un
  // `ConfirmDialog` antes de borrar.
  await itemRow(tooth2).getByRole('button', { name: 'Quitar' }).click();
  const removeDialog = page.getByRole('dialog', { name: '¿Quitar este ítem del plan?' });
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole('button', { name: 'Quitar ítem' }).click();
  await expect(removeDialog).toBeHidden();
  await expect(itemRow(tooth2)).toHaveCount(0, { timeout: 10_000 });
  await expect(totalValue()).toHaveText(money(defaultPrice));

  // Item 1 (with its DONE status) is still there.
  await expect(itemRow(tooth1)).toBeVisible();
  await expect(itemRow(tooth1)).toContainText('Realizado');

  // --- Reload: the plan, item 1's DONE status, item 2's removal and the
  // dropped total all survive (real backend round-trip, no mocks) ---
  await page.reload();

  await expect(
    page.getByRole('heading', { name: `${patientFirstName} ${patientLastName}` }),
  ).toBeVisible({ timeout: 10_000 });

  // The active tab lives in `?tab=`, so the reload should keep it; the helper
  // confirms it (re-clicking the selected tab is a no-op).
  await openPatientTab(page, 'Plan de tratamiento');

  const tabPanelAfterReload = page.locator('#tabpanel-treatment-plans');
  // Only one plan exists for this patient -> `TreatmentPlansTab` auto-selects
  // it (`selectedPlanId` defaults to `plans[0].id`) and loads its detail
  // without any extra click.
  await expect(tabPanelAfterReload.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({
    timeout: 10_000,
  });

  const itemRowAfterReload = (tooth: string) =>
    tabPanelAfterReload
      .locator('table tbody tr')
      .filter({ has: page.getByRole('cell', { name: tooth, exact: true }) });

  await expect(itemRowAfterReload(tooth1)).toBeVisible({ timeout: 10_000 });
  await expect(itemRowAfterReload(tooth1)).toContainText(catalogLabel);
  await expect(itemRowAfterReload(tooth1)).toContainText(money(defaultPrice));
  await expect(itemRowAfterReload(tooth1)).toContainText('Realizado');

  await expect(itemRowAfterReload(tooth2)).toHaveCount(0);

  await expect(totalValueIn(tabPanelAfterReload)).toHaveText(money(defaultPrice));
});
