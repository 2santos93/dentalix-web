import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { dataList, dataListRows } from './support/data-list';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { E2E_REGION } from './support/regional';
import { sedeDayFromToday } from './support/clock';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e DX-015-bis · El reloj del recall lo mueve el procedimiento.
 *
 *  1. En una clínica nueva (nace con sus tipos de recall: Higiene ← profilaxis),
 *     el ADMIN marca «Realizado» una profilaxis desde el plan: el aviso dice
 *     «Recall de Higiene: vence el …» y la ficha muestra ese vencimiento, y
 *     que cuenta desde el procedimiento (no «fijado a mano»).
 *  2. La demo (`seed:demo`, solo lectura) trae la lista de /recall con gente.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `recallproc-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.rproc.${suffix}@example.com` };
const fmt = regionalFormat(E2E_REGION);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Recall Procedimiento ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
});

test('una profilaxis realizada deja el vencimiento de Higiene en la ficha', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Paula',
    lastName: `Profilaxis${suffix}`.slice(0, 30),
    docType: 'NATIONAL_ID',
    docNumber: `RP${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalogRes = await request.get(`${API_URL}/catalog/items`, { headers: session.headers });
  expect(catalogRes.ok(), await catalogRes.text()).toBeTruthy();
  const catalog = (await catalogRes.json()) as { id: string; code: string }[];
  const prophylaxis = catalog.find((c) => c.code === 'PREV-PROFILAXIS');
  expect(prophylaxis, 'el catálogo semilla trae la profilaxis').toBeTruthy();
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, {
    currency: E2E_REGION.currency,
  });
  await apiPost(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: prophylaxis!.id,
  });
  const accept = await request.patch(`${API_URL}/treatment-plans/${plan.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
  const status = page.getByLabel('Estado del ítem del diente 11').locator('visible=true');
  await expect(status).toHaveValue('ACCEPTED');
  await status.selectOption({ label: 'Realizado' });
  const dialog = page.getByRole('dialog', { name: 'Marcar como realizado' });
  // El ADMIN atiende: viene elegido él.
  await expect(dialog.getByLabel('Profesional que lo realizó')).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'Marcar realizado' }).click();
  await expect(dialog).toBeHidden();
  // El aviso dura unos segundos: se lee ya y se compara después con la API.
  const notice = page.getByText(/^Recall de Higiene: vence el /);
  await expect(notice).toBeVisible();
  const noticeText = (await notice.textContent())?.trim();
  await shot(page, 'recall-procedure-toast', 1440);

  // El vencimiento lo calcula la API (hoy en la sede + 6 meses de Higiene).
  const recallsRes = await request.get(`${API_URL}/patients/${patientId}/recalls`, { headers: session.headers });
  expect(recallsRes.ok(), await recallsRes.text()).toBeTruthy();
  const { recalls } = (await recallsRes.json()) as {
    recalls: { recallTypeName: string; dueAt: string; lastDoneAt: string; source: string }[];
  };
  const hygiene = recalls.find((r) => r.recallTypeName === 'Higiene');
  expect(hygiene, 'la profilaxis creó el recall de Higiene').toMatchObject({
    source: 'PROCEDURE',
    lastDoneAt: sedeDayFromToday(0, E2E_REGION.timeZone),
  });
  expect(hygiene!.dueAt > hygiene!.lastDoneAt).toBe(true);
  const due = fmt.civilDate(hygiene!.dueAt);

  expect(noticeText).toBe(`Recall de Higiene: vence el ${due}`);

  await page.goto(`${origin}/patients/${patientId}?tab=data`);
  const row = page.getByTestId('recall-row-HYGIENE');
  await row.scrollIntoViewIfNeeded();
  await expect(row).toContainText(`Vence el ${due}`);
  await expect(row).toContainText(`Cuenta desde el procedimiento realizado el ${fmt.civilDate(hygiene!.lastDoneAt)}`);
  await expect(row).not.toContainText('fijado a mano');
  // Los demás tipos de la clínica, sin recall.
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Sin recall');
  await expect(page.getByTestId('patient-recall')).toContainText('Mantenimiento periodontal');
  await expectNoHorizontalScroll(page);
  await shot(page, 'recall-procedure-record', 1440);
});

test('la lista de recall de la demo no sale vacía', async ({ page }) => {
  const demo = tenantOrigin(DEMO_SUBDOMAIN);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, demo, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
  await page.goto(`${demo}/recall`);
  await expect(page.getByRole('heading', { name: 'Recall', level: 1 })).toBeVisible();
  const rows = dataListRows(dataList(page, 'Pacientes por llamar'));
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.getByText('Nadie pendiente de control')).toHaveCount(0);
  // Los tipos del filtro vienen de la clínica.
  await expect(page.getByLabel('Tipo', { exact: true }).locator('option', { hasText: 'Mantenimiento periodontal' })).toHaveCount(1);
  await shot(page, 'recall-demo-list', 1440);
});
