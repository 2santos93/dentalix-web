import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { expectTouchTarget } from './support/touch-targets';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-330: el plazo de conservación de la historia clínica es de la clínica
 * y lo cambia el ADMIN en Ajustes › Historia clínica.
 *
 * - Una clínica nueva arranca en el mínimo de la plataforma (leído de la API,
 *   no escrito a mano).
 * - Al subir, el diálogo avisa de las 24 horas y la ficha de un paciente con una
 *   evolución dice el plazo nuevo y la fecha que calcula la API.
 * - Al bajar dentro de la ventana, el diálogo dice que se corrige una subida,
 *   pide confirmar y la ficha vuelve al plazo anterior SIN «por el plazo anterior».
 * - La auditoría muestra las dos filas con la etiqueta en español.
 * - Recepción no ve la entrada y, por URL, ve el estado bloqueado.
 * - A 390 px el diálogo cabe, sin scroll lateral y con objetivos táctiles, en
 *   sus dos pasos. axe en la sección y en los dos pasos, en claro y oscuro.
 *
 * Una clínica nueva por corrida. En serie: cada test parte del plazo que dejó
 * el anterior. El caso con suelo (pasadas las 24 h) lo cubre la API.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `conserva-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.conserva.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.conserva.${suffix}@example.com` };

const AUDIT_FIELD = 'Plazo de conservación de la historia clínica';

/** «15 → 20 años»: entre la flecha (aria-hidden) y el después va una «a» que solo lee el lector de pantalla. */
const auditChange = (from: number, to: number) => new RegExp(`${AUDIT_FIELD}:\\s*${from}\\s*→\\s*a?\\s*${to}\\s*años`);

let session: ApiSession;
let patientId: string;
/** Plazo con el que nace la clínica: el mínimo de la plataforma. */
let base: number;
let raised: number;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Conserva ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Rosa',
    lastName: `Conserva${suffix.slice(0, 6)}`,
    docType: 'NATIONAL_ID',
    docNumber: `CV${suffix}`.slice(0, 20),
    sex: 'F',
  }));
  await apiPost(request, session, `/patients/${patientId}/clinical-entries`, { notes: 'Control semestral' });
  const res = await request.get(`${API_URL}/patients/retention/settings`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  const settings = (await res.json()) as { effectiveYears: number; maximumYears: number };
  base = settings.effectiveYears;
  raised = base + 5;
  expect(raised).toBeLessThanOrEqual(settings.maximumYears);
});

const retention = (page: Page) => page.getByRole('region', { name: 'Retención de la historia clínica' });

function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/** `GET /patients/:id`: lo que la API calcula para la ficha. */
async function patientRetention(page: Page) {
  const res = await page.request.get(`${API_URL}/patients/${patientId}`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as {
    clinicRetentionYears: number;
    retentionUntil: string;
    retentionFromPreviousTerm: boolean;
  };
}

async function openSettings(page: Page): Promise<Locator> {
  await page.goto(`${origin}/settings/historia-clinica`);
  await expect(page.getByRole('heading', { level: 1, name: 'Historia clínica' })).toBeVisible({
    timeout: 15_000,
  });
  const value = page.getByTestId('retention-years');
  await expect(value).toBeVisible({ timeout: 15_000 });
  return value;
}

/**
 * El «Cambiar» de este ajuste: la página tiene otro, el de la vigencia de la
 * anamnesis. Cuelga del mismo control que el valor (el `data-testid`).
 */
const changeButton = (page: Page) =>
  page.getByTestId('retention-years').locator('xpath=../..').getByRole('button', { name: 'Cambiar', exact: true });

/** Abre el diálogo y escribe `years`; devuelve el diálogo en su primer paso. */
async function openDialogWith(page: Page, years: number): Promise<Locator> {
  await changeButton(page).click();
  // Sin nombre: el título cambia en el segundo paso y el mismo diálogo debe seguir ubicado.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Cambiar el plazo de conservación' })).toBeVisible();
  await dialog.getByLabel('Años').fill(String(years));
  return dialog;
}

async function expectNoViolations(page: Page, scope: Locator, name: string) {
  const violations = await axeInBothThemes(page, scope);
  expect.soft(violations.light, `${name} claro`).toEqual([]);
  expect.soft(violations.dark, `${name} oscuro`).toEqual([]);
}

/** Guarda `years` (una subida) y espera el aviso de la pantalla. */
async function raiseTo(page: Page, dialog: Locator, years: number) {
  await dialog.getByRole('button', { name: `Subir a ${years} años` }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: `Plazo guardado: ${years} años.` })).toBeVisible();
  await expect(page.getByTestId('retention-years')).toHaveText(`${years} años`);
}

/** Pulsa «Guardar» en una bajada: la API pide confirmar y el diálogo pasa al segundo paso. */
async function askToReduce(dialog: Locator, years: number, from: number) {
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: `Reducir el plazo de ${from} a ${years} años` })).toBeVisible({
    timeout: 10_000,
  });
}

test('ADMIN: una clínica nueva está en el mínimo de la plataforma, con la sección accesible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);

  await expect(await openSettings(page)).toHaveText(`${base} años`);
  await expect(page.getByText(/Mientras dure, el paciente no se puede archivar/).first()).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('legal');
  await expectNoViolations(page, page.getByRole('main'), 'sección de ajustes');

  await page.goto(`${origin}/patients/${patientId}`);
  const { retentionUntil, clinicRetentionYears } = await patientRetention(page);
  expect(clinicRetentionYears).toBe(base);
  await expect(retention(page).getByText(`Historia en retención hasta ${ddmmyyyy(retentionUntil)}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(retention(page)).toContainText(`Se conserva ${base} años desde la última atención`);
});

test('ADMIN sube el plazo: ve el aviso de las 24 horas y la ficha dice el plazo nuevo y su fecha', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await openSettings(page);

  const dialog = await openDialogWith(page, raised);
  await expect(dialog).toContainText('24 horas');
  await expect(dialog).toContainText(`puedes volver a ${base} años sin ningún efecto`);
  await expect(dialog).toContainText('no se puede deshacer');
  await expectDialogInsideViewport(page, dialog);
  await expectNoViolations(page, dialog, 'diálogo, subida');
  await raiseTo(page, dialog, raised);
  await expect(page.getByText(`puedes volver a ${base} años sin ningún efecto`)).toBeVisible();

  await page.goto(`${origin}/patients/${patientId}`);
  const detail = await patientRetention(page);
  expect(detail.clinicRetentionYears).toBe(raised);
  expect(detail.retentionFromPreviousTerm).toBe(false);
  await expect(retention(page).getByText(`Historia en retención hasta ${ddmmyyyy(detail.retentionUntil)}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(retention(page)).toContainText(`Se conserva ${raised} años desde la última atención`);
  await expect(retention(page)).not.toContainText('legal');
});

test('ADMIN baja dentro de la ventana: ve el texto de corrección, confirma y la ficha vuelve sin «plazo anterior»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await openSettings(page);

  const dialog = await openDialogWith(page, base);
  await expect(dialog).toContainText('Estás corrigiendo una subida reciente');
  await expectNoViolations(page, dialog, 'diálogo, corrección');
  await askToReduce(dialog, base, raised);
  await expectDialogInsideViewport(page, dialog);
  await expectNoViolations(page, dialog, 'diálogo, confirmación');
  await dialog.getByRole('button', { name: 'Reducir el plazo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: `Plazo guardado: ${base} años.` })).toBeVisible();
  await expect(page.getByTestId('retention-years')).toHaveText(`${base} años`);
  // Sin suelos: ninguna historia «mantiene su fecha» y la ventana ya no se anuncia.
  await expect(page.getByRole('status').filter({ hasText: 'mantienen su fecha anterior' })).toHaveCount(0);
  await expect(page.getByText(/puedes volver a \d+ años sin ningún efecto/)).toHaveCount(0);

  await page.goto(`${origin}/patients/${patientId}`);
  const detail = await patientRetention(page);
  expect(detail.clinicRetentionYears).toBe(base);
  expect(detail.retentionFromPreviousTerm).toBe(false);
  await expect(retention(page).getByText(`Historia en retención hasta ${ddmmyyyy(detail.retentionUntil)}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(retention(page)).toContainText(`Se conserva ${base} años desde la última atención`);
  await expect(retention(page)).not.toContainText('por el plazo anterior');
});

test('la auditoría muestra las dos filas, con la etiqueta en español', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/auditoria`);
  const table = page.getByRole('table', { name: 'Registro de auditoría' });
  await expect(table).toBeVisible({ timeout: 15_000 });

  const up = table.getByRole('row').filter({ hasText: auditChange(base, raised) });
  await expect(up).toHaveCount(1);
  await expect(up).toContainText('Ajustes de la clínica');
  await expect(up).toContainText(admin.fullName);

  const down = table.getByRole('row').filter({ hasText: auditChange(raised, base) });
  await expect(down).toHaveCount(1);
  await expect(down).toContainText('Conservación de la historia clínica');
  await expect(down).toContainText('corrección de una subida');
  await expect(table).not.toContainText('clinicalRecordRetentionYears');
  await expect(table).not.toContainText('CLINICAL_RECORD_RETENTION_SETTINGS');
});

test('RECEPCIÓN no ve la entrada en Ajustes y, por URL, ve el estado bloqueado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/settings`);
  const links = page.getByRole('main').getByRole('listitem').getByRole('link');
  await expect(links.first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Historia clínica/ })).toHaveCount(0);

  await page.goto(`${origin}/settings/historia-clinica`);
  await expect(page.getByText('Solo administración cambia el plazo de conservación.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('La ficha de cada paciente dice hasta cuándo se conserva su historia.')).toBeVisible();
  await expect(page.getByTestId('retention-years')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cambiar', exact: true })).toHaveCount(0);
});

test('390 px: el diálogo cabe en sus dos pasos, sin scroll lateral y con objetivos táctiles', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await openSettings(page);
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await expectTouchTarget(changeButton(page), { label: 'Cambiar' });

  // Paso 1, subida: aviso largo de las 24 horas.
  const dialog = await openDialogWith(page, raised);
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  for (const target of [dialog.getByRole('button', { name: `Subir a ${raised} años` }), dialog.getByLabel('Años')]) {
    await expectTouchTarget(target, { scope: dialog });
  }
  await expectNoViolations(page, dialog, 'diálogo 390, subida');
  await raiseTo(page, dialog, raised);
  await expectNoHorizontalScroll(page);

  // Paso 2, bajada: la confirmación.
  const reduceDialog = await openDialogWith(page, base);
  await askToReduce(reduceDialog, base, raised);
  await expectDialogInsideViewport(page, reduceDialog);
  await expectNoHorizontalScroll(page);
  await expectTouchTarget(reduceDialog.getByRole('button', { name: 'Reducir el plazo' }), { scope: reduceDialog });
  await expectNoViolations(page, reduceDialog, 'diálogo 390, confirmación');
  await reduceDialog.getByRole('button', { name: 'Reducir el plazo' }).click();
  await expect(reduceDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('retention-years')).toHaveText(`${base} años`);
});
