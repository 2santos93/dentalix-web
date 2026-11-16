import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TODAY_TZ } from './support/clock';
import { expectNoHorizontalOverflowInDialog, expectNoHorizontalScroll } from './support/layout';
import { E2E_TODAY_REGION } from './support/regional';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-017: orden de laboratorio dental desde el plan del paciente.
 *
 * Una clínica nueva con un laboratorio («Laboratorio Dental Caracas», servicio
 * «Corona zirconio» de 5 días hábiles), una odontóloga y recepción; una
 * paciente con un plan que lleva una corona en el 16.
 *   1. 1440 px: la odontóloga, desde el ítem del plan («Orden de laboratorio
 *      del diente 16»), crea la orden con el diente y la prestación puestos y
 *      la fecha prometida sugerida; la envía y la marca recibida, y la ve en la
 *      sección «Laboratorio» de la ficha como «Recibida». La sección y el
 *      formulario, sin scroll horizontal a 390 px (claro y oscuro con QA).
 *   2. Recepción ve el trabajo en «Trabajos de laboratorio» a 1440 y 390 px
 *      (tarjetas y filtros plegados).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `labdx-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Sara Titular', email: `sara.lab.${suffix}@example.com` };
const dentist = { fullName: 'Laura Prótesis', email: `laura.lab.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.lab.${suffix}@example.com` };
const lastName = `Lab${suffix}`.slice(0, 40);
const procedure = `Corona de zirconio ${suffix}`.slice(0, 60);
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

test.use({ timezoneId: SEDE_TODAY_TZ });
test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let patientId: string;

/** Sin scroll horizontal a 1440 y 390 px y, con E2E_QA_DIR, la captura en claro y oscuro. */
async function checkViewports(page: Page, name: string): Promise<void> {
  if (QA_DIR) mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalScroll(page);
    if (!QA_DIR) continue;
    await page.mouse.move(0, 0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png` });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Laboratorio ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const lab = await apiPost<{ id: string }>(request, session, '/dental-labs', {
    name: 'Laboratorio Dental Caracas',
    contactName: 'Carmen Rojas',
  });
  await apiPost(request, session, `/dental-labs/${lab.id}/services`, {
    name: 'Corona zirconio',
    leadTimeBusinessDays: 5,
    referencePrice: '120.00',
    referenceCurrency: 'USD',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `lab-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: procedure,
    color: '#3366CC',
    defaultPrice: 300,
  });
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Valentina',
      lastName,
      docType: 'NATIONAL_ID',
      docNumber: `LAB${suffix}`.slice(0, 20),
      sex: 'F',
    })
  ).id;
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, { currency: 'USD' });
  await apiPost(request, session, `/treatment-plans/${plan.id}/items`, { toothNumber: '16', catalogItemId: catalog.id });
});

test('la odontóloga crea la orden desde el plan, la envía, la recibe y la ve en la ficha (1440 y 390)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  await page.getByRole('link', { name: 'Orden de laboratorio del diente 16' }).click({ timeout: 20_000 });

  const form = page.getByRole('dialog', { name: 'Nueva orden de laboratorio' });
  await expect(form.getByLabel('Trabajo')).toHaveValue(procedure, { timeout: 15_000 });
  await expect(form.getByText('16', { exact: true })).toBeVisible();
  await form.getByRole('combobox', { name: 'Laboratorio' }).selectOption({ label: 'Laboratorio Dental Caracas' });
  await form.getByRole('combobox', { name: 'Servicio (opcional)' }).selectOption({ label: 'Corona zirconio · 5 días hábiles' });
  await expect(form.getByText(/Sugerida: 5 días hábiles desde hoy/)).toBeVisible();
  await form.getByLabel('Color o tono (opcional)').fill('A2');
  await form.getByLabel('Material (opcional)').fill('Zirconio monolítico');

  // El formulario a 390 px, sin desbordar (pantalla completa en el teléfono).
  await page.setViewportSize(VIEWPORTS[1]);
  await expectNoHorizontalOverflowInDialog(form);
  await expectNoHorizontalScroll(page);
  if (QA_DIR) {
    mkdirSync(QA_DIR, { recursive: true });
    await page.screenshot({ path: `${QA_DIR}/lab-order-form-390-light.png` });
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await form.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(form).toBeHidden();
  await expect(page).not.toHaveURL(/labOrderPlanItem/);

  const panel = page.locator('#tabpanel-lab-orders');
  const table = panel.getByRole('table', { name: 'Órdenes de laboratorio del paciente' });
  const row = table.getByRole('row').filter({ hasText: procedure });
  await expect(row).toContainText('Borrador');
  await expect(row).toContainText(`Del plan: ${procedure} · diente 16`);

  await row.getByRole('button', { name: /^Acciones de Orden N\.º \d+/ }).click();
  await page.getByRole('menuitem', { name: 'Enviar' }).click();
  const send = page.getByRole('dialog', { name: /^Enviar la orden N\.º \d+$/ });
  await expect(send.getByText(/Sugerida: 5 días hábiles desde hoy/)).toBeVisible();
  await send.getByRole('button', { name: 'Enviar' }).click();
  await expect(send).toBeHidden();
  await expect(row).toContainText('Enviada');

  await row.getByRole('button', { name: /^Acciones de Orden N\.º \d+/ }).click();
  await page.getByRole('menuitem', { name: 'Recibir' }).click();
  const receive = page.getByRole('dialog', { name: /^Recibir la orden N\.º \d+$/ });
  await receive.getByRole('button', { name: 'Marcar recibida' }).click();
  await expect(receive).toBeHidden();
  await expect(row).toContainText('Recibida');

  // Recargada, la ficha la sigue mostrando recibida (sale de las fechas en la API).
  await page.goto(`${origin}/patients/${patientId}?tab=lab-orders`);
  await expect(panel.getByRole('table', { name: 'Órdenes de laboratorio del paciente' }).getByRole('row').filter({ hasText: procedure })).toContainText('Recibida', { timeout: 15_000 });
  await checkViewports(page, 'lab-orders-tab');
});

test('recepción ve el trabajo en «Trabajos de laboratorio» (1440 y 390)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/laboratorio`);
  await expect(page.getByRole('heading', { name: 'Trabajos de laboratorio', level: 1 })).toBeVisible();
  const list = page.getByRole('table', { name: 'Trabajos de laboratorio de la sede, los atrasados primero' });
  await expect(list.getByText(`Valentina ${lastName}`)).toBeVisible({ timeout: 15_000 });
  await expect(list.getByText('Recibida')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Solo atrasados' }).check();
  await expect(page.getByText('No hay trabajos atrasados en esta sede')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Solo atrasados' }).uncheck();
  await expect(list.getByText(`Valentina ${lastName}`)).toBeVisible();
  await checkViewports(page, 'lab-orders-list');

  // A 390 px: tarjetas y los filtros en un desplegable.
  await page.setViewportSize(VIEWPORTS[1]);
  await expect(page.getByRole('button', { name: 'Filtros' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Trabajos de laboratorio de la sede, los atrasados primero' })).toContainText(
    `Valentina ${lastName}`,
  );
  await expectNoHorizontalScroll(page);
});
