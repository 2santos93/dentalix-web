import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TODAY_TZ } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_TODAY_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-285: honorario del caso de ortodoncia, cuenta y alineadores.
 *
 * Una clínica nueva con la ortodoncia activada, una odontóloga y recepción;
 * una paciente con un caso de alineadores de 24 controles abierto por la API.
 *   1. 1440 px: la odontóloga pone el honorario (un reparto que no cuadra no
 *      se envía), lo acepta y la cuenta marca la inicial realizada; un control
 *      registrado realiza «1 de 24». Abre una serie de alineadores de 20
 *      bandejas a 14 días y registra la entrega 1–4: la arcada lleva la 1.
 *   2. 390 y 1440 px, claro y oscuro: la pestaña sin scroll horizontal.
 *   3. Recepción ve la cuenta del caso en la ficha, sin acciones ni caso
 *      clínico.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `ortocobro-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Sara Titular', email: `sara.ortocobro.${suffix}@example.com` };
const dentist = { fullName: 'Lina Ortodoncia', email: `lina.ortocobro.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.ortocobro.${suffix}@example.com` };
const lastName = `Cobro${suffix}`.slice(0, 40);
const QA_DIR = process.env.E2E_QA_DIR;
const DAY_MS = 86_400_000;
const dayAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

test.use({ timezoneId: SEDE_TODAY_TZ });
test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let patientId: string;
let caseId: string;
let dentistHeaders: Record<string, string>;

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
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Cobro Ortodoncia ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const settings = await request.put(`${API_URL}/ortho/settings`, { headers: session.headers, data: { enabled: true } });
  expect(settings.ok(), await settings.text()).toBeTruthy();
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Valentina',
      lastName,
      docType: 'NATIONAL_ID',
      docNumber: `OCB${suffix}`.slice(0, 20),
      sex: 'F',
      phone: '+584121234567',
    })
  ).id;
  caseId = (
    await apiPost<{ id: string }>(request, session, `/patients/${patientId}/ortho-cases`, {
      technique: 'ALIGNERS',
      startDate: dayAgo(60),
      estimatedMonths: 24,
      plannedVisits: 24,
    })
  ).id;
  dentistHeaders = session.headers;
});

test('la odontóloga pone y acepta el honorario, registra un control y una entrega de alineadores (1440 y 390)', async ({
  page,
  request,
}) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=ortho`);
  const panel = page.locator('#tabpanel-ortho');
  const account = panel.getByRole('region', { name: 'Cuenta del caso' });
  await expect(account.getByText('Este caso todavía no tiene honorario.')).toBeVisible({ timeout: 15_000 });

  await account.getByRole('button', { name: 'Poner honorario' }).click();
  const fee = page.getByRole('dialog', { name: 'Honorario del caso' });
  await expect(fee.getByLabel('Controles que se cobran')).toHaveValue('24');
  await fee.getByLabel('Honorario total').fill('3000');
  await fee.getByLabel(/Cuota inicial/).fill('600');
  await fee.getByLabel('Importe por control').fill('90');
  await fee.getByLabel('Retiro y retención').fill('200');
  await fee.getByRole('button', { name: 'Guardar honorario' }).click();
  await expect(fee.getByText(/El reparto no cuadra con el total/)).toBeVisible();
  await fee.getByLabel('Retiro y retención').fill('240');
  await expect(fee.getByTestId('ortho-fee-sum')).toHaveText('El reparto cuadra con el total.');
  await page.setViewportSize(VIEWPORTS[1]);
  await expectNoHorizontalScroll(page);
  if (QA_DIR) {
    mkdirSync(QA_DIR, { recursive: true });
    await page.screenshot({ path: `${QA_DIR}/ortho-fee-form-390-light.png` });
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await fee.getByRole('button', { name: 'Guardar honorario' }).click();
  await expect(fee).toBeHidden();

  await account.getByRole('button', { name: 'Aceptar honorario' }).click();
  const confirm = page.getByRole('dialog', { name: 'Aceptar el honorario' });
  await confirm.getByRole('button', { name: 'Aceptar honorario' }).click();
  await expect(confirm).toBeHidden();
  await expect(account.getByText('0 de 24 controles cobrados')).toBeVisible();
  await expect(account.getByText('Al día')).toBeVisible();

  // Un control (por la API): el control 1 de 24 pasa a realizado.
  const visit = await request.post(`${API_URL}/patients/${patientId}/ortho-cases/${caseId}/visits`, {
    headers: dentistHeaders,
    data: { entryDate: dayAgo(2), hygieneIndex: 1 },
  });
  expect(visit.ok(), await visit.text()).toBeTruthy();
  await page.reload();
  await expect(account.getByText('1 de 24 controles cobrados')).toBeVisible({ timeout: 15_000 });

  const aligners = panel.getByRole('region', { name: 'Alineadores' });
  await expect(aligners.getByText('Este caso no tiene series de alineadores.')).toBeVisible();
  await aligners.getByRole('button', { name: 'Nueva serie' }).click();
  const series = page.getByRole('dialog', { name: 'Nueva serie de alineadores' });
  await series.getByLabel('Marca').fill('Marca X');
  await series.getByLabel('Número de bandejas').fill('20');
  await series.getByLabel('Días por bandeja').fill('14');
  await series.getByRole('button', { name: 'Abrir serie' }).click();
  await expect(series).toBeHidden();
  await aligners.getByRole('button', { name: 'Registrar entrega' }).click();
  const delivery = page.getByRole('dialog', { name: 'Registrar entrega' });
  await expect(delivery.getByLabel('Desde la bandeja')).toHaveValue('1');
  await expect(delivery.getByLabel('Hasta la bandeja')).toHaveValue('4');
  await delivery.getByRole('button', { name: 'Registrar entrega' }).click();
  await expect(delivery).toBeHidden();
  await expect(aligners.getByTestId('aligner-arch-Superior')).toHaveText('Bandeja 1 de 20');
  await expect(aligners.getByTestId('aligner-arch-Inferior')).toHaveText('Bandeja 1 de 20');
  await expect(aligners.getByText(/Bandejas 1–4/)).toBeVisible();

  await checkViewports(page, 'ortho-billing-tab');
});

test('recepción ve la cuenta del caso sin acciones ni caso clínico (1440 y 390)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=ortho`);
  const panel = page.locator('#tabpanel-ortho');
  await expect(panel.getByText('Cuenta del caso')).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/3\.000,00/).first()).toBeVisible();
  await expect(panel.getByText('1 de 24 controles cobrados')).toBeVisible();
  await expect(panel.getByRole('button', { name: /honorario/ })).toHaveCount(0);
  await expect(panel.getByText('Alineadores')).toHaveCount(0);
  await expect(panel.getByText('Historial de controles')).toHaveCount(0);
  await checkViewports(page, 'ortho-billing-reception');
});
