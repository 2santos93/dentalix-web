import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import type { APIRequestContext } from '@playwright/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-146 · Cartera › «Por avisar hoy»: recepción ve a los deudores a los
 * que toca avisar, con el WhatsApp listo (solo la clínica y el saldo vencido)
 * y «Marcar avisado», que los saca de la lista y no vuelven hoy (1440 y 390
 * px, claro y oscuro). El ADMIN cambia los tramos desde la pestaña.
 *
 * Una clínica nueva por corrida con dos deudores cuyos planes de cuotas
 * vencieron hace más de un año (tramo de 60 días: toca avisar hoy).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `avisos-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const clinicName = `Clínica Avisos ${suffix.slice(0, 8)}`;
const admin = { fullName: 'Ana Titular', email: `ana.avi.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `rita.avi.${suffix}@example.com` };
const deskName = `Debora Aviso${suffix}`.slice(0, 40);
const phoneName = `Mateo Movil${suffix}`.slice(0, 40);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await seedDebtor(request, { name: deskName, doc: `AD${suffix}`, tag: 'a' });
  await seedDebtor(request, { name: phoneName, doc: `AM${suffix}`, tag: 'b' });
});

/** Plan de 400 USD en dos cuotas mensuales desde hace 400 días. */
async function seedDebtor(request: APIRequestContext, p: { name: string; doc: string; tag: string }): Promise<void> {
  const [firstName, ...rest] = p.name.split(' ');
  const { id } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName: rest.join(' '),
    docType: 'NATIONAL_ID',
    docNumber: p.doc.slice(0, 20),
    sex: 'F',
    phone: '412 555 0177',
    countryCode: 'VE',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `aviso-${p.tag}-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Corona ${p.tag} ${suffix.slice(0, 6)}`,
    color: '#3366CC',
    defaultPrice: 400,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${id}/treatment-plans`, { currency: 'USD' });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const accept = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  await apiPost<object>(request, session, `/treatment-plans/${plan.id}/payment-plan`, {
    installmentsCount: 2,
    periodicity: 'MONTHLY',
    startDate: `${sedeDayFromToday(-400)}T00:00:00.000Z`,
  });
}

async function openReminders(page: Page, email: string): Promise<void> {
  await loginAs(page, origin, email, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/caja/cartera?tab=por-avisar`);
  await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('tab', { name: 'Por avisar hoy' })).toHaveAttribute('aria-selected', 'true');
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a 1440 px (${scheme}) recepción avisa por WhatsApp y marca avisado: no vuelve hoy`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReminders(page, reception.email);
    await expect(page.getByText(/^Tramos: 7, 30 y 60 días/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Cambiar tramos' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    if (scheme === 'dark') {
      // La primera pasada ya lo marcó: hoy no reaparece.
      await expect(page.getByRole('row', { name: new RegExp(deskName) })).toHaveCount(0);
      return;
    }

    const row = page.getByRole('row', { name: new RegExp(deskName) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText('Tramo de 60 días')).toBeVisible();
    const whatsapp = row.getByRole('link', { name: `Escribir por WhatsApp a ${deskName}` });
    const href = decodeURIComponent((await whatsapp.getAttribute('href')) ?? '').replace(/\s/g, ' ');
    expect(href).toMatch(/^https:\/\/wa\.me\/584125550177\?text=Hola, te escribimos de /);
    expect(href).toContain('Tienes un saldo vencido de USD 400,00.');
    expect(href).not.toContain('Debora');
    expect(href).not.toContain('Corona');

    await row.getByRole('button', { name: `Marcar avisado a ${deskName}` }).click();
    await expect(page.getByRole('row', { name: new RegExp(deskName) })).toHaveCount(0, { timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole('row', { name: new RegExp(phoneName) })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('row', { name: new RegExp(deskName) })).toHaveCount(0);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a 390 px (${scheme}) la tarjeta cabe sin scroll horizontal y se marca desde ella`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await openReminders(page, reception.email);
    const list = page.getByRole('list', { name: 'Pacientes por avisar hoy' });
    if (scheme === 'light') {
      const card = list.getByRole('listitem').filter({ hasText: phoneName });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByRole('link', { name: `Escribir por WhatsApp a ${phoneName}` })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await card.getByRole('button', { name: `Marcar avisado a ${phoneName}` }).click();
    }
    // Ya no queda nadie por avisar hoy.
    await expect(page.getByText('Hoy no hay a quién avisar')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
  });
}

test('el ADMIN cambia los tramos desde la pestaña (validación en español, modal dentro de 390 px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReminders(page, admin.email);
  await page.getByRole('button', { name: 'Cambiar tramos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tramos de los avisos de saldo' });
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByLabel('Tramo 2 (días)').fill('5');
  await dialog.getByRole('button', { name: 'Guardar tramos' }).click();
  await expect(dialog.getByText('Cada tramo tiene que ser mayor que el anterior.')).toBeVisible();
  await dialog.getByLabel('Tramo 2 (días)').fill('45');
  await dialog.getByLabel('Tramo 3 (días)').fill('');
  await dialog.getByRole('button', { name: 'Guardar tramos' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Tramos: 7 y 45 días/)).toBeVisible({ timeout: 15_000 });
});
