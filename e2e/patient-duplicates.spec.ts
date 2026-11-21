import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeViolations } from './support/axe';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { shot } from './support/qa-shot';
import { expectTouchTarget } from './support/touch-targets';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-266: «Posibles duplicados» y fusión segura (solo ADMIN).
 *
 * Siembra por la API (sin BD): la API no deja dar de alta dos pacientes con el
 * mismo documento, así que las parejas son de nombre + nacimiento y de
 * teléfono + nombre.
 * - 1440 px: ADMIN entra por Pacientes → «Duplicados», ve el motivo de cada
 *   pareja, descarta la de teléfono («No es duplicado») y fusiona la de
 *   nombre tomando el correo de la ficha absorbida; la pareja desaparece, se
 *   ofrece la ficha conservada y la ficha antigua lleva a ella.
 * - 390 px: la lista y el modal no desbordan, la acción mide 44 px y la
 *   fusión también sale.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `duplicados266-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.dx266.${suffix}@example.com` };
const tag = suffix.slice(0, 6);
const LIST = 'Parejas de posibles duplicados';
const DIALOG = 'Fusionar pacientes';

// Pareja 1 (1440): mismo nombre y nacimiento; la absorbida trae el correo.
const yusmary = { firstName: 'Yusmary', lastName: `Pérez${tag}`, birthDate: '1988-07-21' };
// Pareja 2: mismo teléfono y nombre, nacimientos distintos (se descarta).
const jose = { firstName: 'José', lastName: `Rodríguez${tag}`, phone: '+58 414 555 0101' };
// Pareja 3 (390): mismo nombre y nacimiento.
const carmen = { firstName: 'Carmen', lastName: `Villalobos${tag}`, birthDate: '1975-02-03' };

let session: ApiSession;
let yusmaryOld: string;
let yusmaryNew: string;
let carmenOld: string;

test.describe.configure({ mode: 'serial' });

async function createPatient(request: APIRequestContext, body: Record<string, unknown>): Promise<string> {
  return (await apiPost<{ id: string }>(request, session, '/patients', { docType: 'NATIONAL_ID', sex: 'F', ...body })).id;
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

function pairCard(page: Page, name: string) {
  return page.getByRole('list', { name: LIST }).locator(':scope > li').filter({ hasText: name });
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Duplicados ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  // La primera de cada pareja es la más antigua: la que el modal propone conservar.
  yusmaryOld = await createPatient(request, { ...yusmary, docNumber: `V-${tag}1` });
  yusmaryNew = await createPatient(request, {
    ...yusmary,
    docNumber: `V-${tag}2`,
    email: `yusmary.dx266.${suffix}@example.com`,
  });
  await createPatient(request, { ...jose, sex: 'M', birthDate: '1960-01-10', docNumber: `V-${tag}3` });
  await createPatient(request, { ...jose, sex: 'M', birthDate: '1992-05-30', docNumber: `V-${tag}4` });
  carmenOld = await createPatient(request, { ...carmen, docNumber: `V-${tag}5` });
  await createPatient(request, { ...carmen, docNumber: `V-${tag}6` });
});

test('1440 px: ADMIN descarta una pareja y fusiona otra; la ficha antigua lleva a la conservada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);

  await page.goto(`${origin}/patients`);
  await page.getByRole('link', { name: 'Posibles duplicados' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Posibles duplicados' })).toBeVisible({ timeout: 15_000 });

  const yusmaryCard = pairCard(page, fullName(yusmary));
  await expect(yusmaryCard).toBeVisible({ timeout: 15_000 });
  await expect(yusmaryCard).toContainText('Mismo nombre y nacimiento');
  const joseCard = pairCard(page, fullName(jose));
  await expect(joseCard).toContainText('Mismo teléfono y nombre');
  await expect(page.getByText('3 parejas')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'duplicates-list', 1440);

  // «No es duplicado»: la pareja deja de salir.
  await joseCard.getByRole('button', { name: `${fullName(jose)} y ${fullName(jose)} no son la misma persona` }).click();
  await expect(joseCard).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('2 parejas')).toBeVisible();

  // Fusionar: se conserva la más antigua y el correo sale de la absorbida.
  await yusmaryCard.getByRole('button', { name: `Fusionar a ${fullName(yusmary)} y ${fullName(yusmary)}` }).click();
  const dialog = page.getByRole('dialog', { name: DIALOG });
  await expectDialogInsideViewport(page, dialog);
  // La pareja llega en orden de id: se mira la ficha por su valor, no por su posición.
  const keptGroup = dialog.getByRole('radiogroup', { name: '¿Qué ficha se conserva?' });
  await expect(keptGroup.locator(`input[value="${yusmaryOld}"]`)).toBeChecked();
  const email = dialog.getByRole('radiogroup', { name: 'Correo' });
  await expect(email).toBeVisible({ timeout: 15_000 });
  await email.getByRole('radio', { name: `yusmary.dx266.${suffix}@example.com` }).check();
  await expect(dialog.getByText('La fusión no se puede deshacer', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fusionar pacientes' })).toBeDisabled();
  await shot(page, 'duplicates-merge-dialog', 1440);
  await dialog.getByRole('checkbox', { name: 'Entiendo que la fusión no se puede deshacer' }).check();
  await dialog.getByRole('button', { name: 'Fusionar pacientes' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  await expect(page.getByText(`Fusión hecha: queda la ficha de ${fullName(yusmary)}`)).toBeVisible();
  await expect(yusmaryCard).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('1 pareja', { exact: true })).toBeVisible();
  await shot(page, 'duplicates-merged', 1440);

  // El conservado tiene el correo elegido.
  const kept = await page.request.get(`${API_URL}/patients/${yusmaryOld}`, { headers: session.headers });
  expect(kept.ok(), await kept.text()).toBeTruthy();
  expect(((await kept.json()) as { email: string | null }).email).toBe(`yusmary.dx266.${suffix}@example.com`);

  // La ficha antigua del absorbido lleva a la del conservado (con la pestaña).
  await page.goto(`${origin}/patients/${yusmaryNew}?tab=data`);
  await expect(page).toHaveURL(new RegExp(`/patients/${yusmaryOld}\\?tab=data$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: fullName(yusmary) })).toBeVisible({ timeout: 15_000 });
});

test('390 px: la lista y el modal no desbordan, la acción mide 44 px y la fusión sale', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients/duplicados`);
  const card = pairCard(page, fullName(carmen));
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  const merge = card.getByRole('button', { name: `Fusionar a ${fullName(carmen)} y ${fullName(carmen)}` });
  await expectTouchTarget(merge);
  await shot(page, 'duplicates-list', 390);

  await merge.click();
  const dialog = page.getByRole('dialog', { name: DIALOG });
  await expectDialogInsideViewport(page, dialog);
  const confirm = dialog.getByRole('checkbox', { name: 'Entiendo que la fusión no se puede deshacer' });
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await shot(page, 'duplicates-merge-dialog', 390);
  await confirm.check();
  const submit = dialog.getByRole('button', { name: 'Fusionar pacientes' });
  await expectTouchTarget(submit, { scope: dialog });
  await submit.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(card).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('No hay posibles duplicados')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir la ficha' })).toHaveAttribute('href', `/patients/${carmenOld}`);
  await expectNoHorizontalScroll(page);
  await shot(page, 'duplicates-empty', 390);
});

/**
 * DX-266-bis: lo que llegó tarde a la ficha absorbida. La ventana (una cita
 * confirmada en el mismo instante que la fusión) no se puede provocar desde
 * el navegador ni por la API (que ya no escribe en un absorbido): la
 * detección se simula interceptando el GET; «Pasar a esta ficha» va a la API
 * real, que responde que ya no queda nada (idempotente, probado en la API con
 * la ventana real). Comprueba el aviso, el diálogo, axe, claro/oscuro y que,
 * al pasarlo, la ficha se relee sin el aviso.
 */
for (const width of [1440, 390] as const) {
  test(`${width} px: DX-266-bis — el aviso de lo que quedó en la ficha fusionada y «Pasar a esta ficha»`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, admin.email, password);
    let pending = true;
    await page.route(/\/patient-duplicates\/merge-leftovers\?keptId=/, async (route) => {
      // La página puede cancelar una lectura (AbortController del efecto) y su
      // respuesta queda descartada: no se lee el cuerpo para comprobar el
      // estado y una petición ya cancelada se ignora.
      const response = await route.fetch().catch(() => null);
      if (!response) return;
      expect(response.status(), 'GET merge-leftovers').toBe(200);
      const body = pending
        ? {
            items: [
              {
                absorbedPatientId: yusmaryNew,
                patientCode: '2',
                firstName: yusmary.firstName,
                lastName: yusmary.lastName,
                mergedAt: new Date().toISOString(),
                tables: [
                  { table: 'appointments', count: 1 },
                  { table: 'payments', count: 1 },
                ],
                categories: [
                  { category: 'appointments', count: 1 },
                  { category: 'payments', count: 1 },
                ],
                total: 2,
              },
            ],
          }
        : await response.json().catch(() => null);
      if (body === null) return;
      await route.fulfill({ response, json: body }).catch(() => undefined);
    });

    await page.goto(`${origin}/patients/${yusmaryOld}?tab=data`);
    const banner = page.getByTestId('merge-leftovers-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(
      banner.getByRole('heading', {
        name: `Quedaron 2 registros en la ficha de ${fullName(yusmary)}, que se fusionó con esta`,
      }),
    ).toBeVisible();
    await expect(banner).toContainText('1 cita y 1 pago');
    const action = banner.getByRole('button', { name: 'Pasar a esta ficha' });
    if (width === 390) await expectTouchTarget(action);
    await expectNoHorizontalScroll(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      expect(await axeViolations(page, banner)).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await shot(page, 'merge-leftovers-banner', width);

    await action.click();
    const dialog = page.getByRole('dialog', { name: '¿Pasar los registros a esta ficha?' });
    await expectDialogInsideViewport(page, dialog);
    await expect(dialog).toContainText(`1 cita y 1 pago de la ficha fusionada de ${fullName(yusmary)}`);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      expect(await axeViolations(page, dialog)).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await shot(page, 'merge-leftovers-dialog', width);

    // A partir de aquí, la lista real (vacía).
    pending = false;
    await dialog.getByRole('button', { name: 'Pasar a esta ficha' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Ya no quedaba nada por pasar: todo está en esta ficha.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: fullName(yusmary) })).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveCount(0);
    await shot(page, 'merge-leftovers-done', width);
  });
}
