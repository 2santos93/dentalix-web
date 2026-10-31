import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { apiLogin, apiPost, type ApiSession } from './support/api';
import { API_URL, tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';
import { sedeDayFromToday } from './support/clock';
import { openSection } from './support/nav';

/**
 * DX-145 · Cartera por antigüedad, vista por RECEPCIÓN en la clínica demo
 * (`npm run seed:demo`, que ya deja deudores en los cuatro tramos).
 *
 * Además se siembra por la API un deudor propio de esta corrida con un plan de
 * cuotas que venció hace más de un año, así que siempre encabeza el filtro
 * «Más de 90 días». Recepción entra por el menú, filtra y ve su fila (1440 px)
 * o su tarjeta (390 px, sin scroll lateral) con «Llamar», un WhatsApp
 * prellenado sin importes y el enlace al estado de cuenta. No ve «Exportar CSV»
 * (solo ADMIN).
 */
const origin = tenantOrigin('demo');
const DEMO_PASSWORD = 'DemoDentalix2026!';
const RECEPTION = 'recepcion@demo.dentalix.app';
const ADMIN = 'admin@demo.dentalix.app';

const suffix = randomUUID().slice(0, 8);
const lastName = `Cartera${suffix}`;
const fullName = `Deudor ${lastName}`;
let patientId: string;

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext();
  try {
    const admin: ApiSession = await apiLogin(api, origin, ADMIN, DEMO_PASSWORD);
    ({ id: patientId } = await apiPost<{ id: string }>(api, admin, '/patients', {
      firstName: 'Deudor',
      lastName,
      docType: 'NATIONAL_ID',
      docNumber: `CA${suffix}`,
      sex: 'M',
      phone: '300 555 0199',
      countryCode: 'CO',
    }));
    const catalog = await apiPost<{ id: string }>(api, admin, '/catalog/items', {
      code: `cartera-${suffix}`,
      kind: 'PROCEDURE',
      labelEs: `Corona ${suffix}`,
      color: '#3366CC',
      defaultPrice: 400000,
    });
    const plan = await apiPost<{ id: string }>(api, admin, `/patients/${patientId}/treatment-plans`, {
      currency: 'COP',
    });
    const item = await apiPost<{ id: string }>(api, admin, `/treatment-plans/${plan.id}/items`, {
      toothNumber: '11',
      catalogItemId: catalog.id,
    });
    const accept = await api.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
      headers: admin.headers,
      data: { status: 'ACCEPTED' },
    });
    expect(accept.ok(), await accept.text()).toBeTruthy();
    // Dos cuotas mensuales desde hace 400 días: las dos, de más de 90.
    await apiPost<object>(api, admin, `/treatment-plans/${plan.id}/payment-plan`, {
      installmentsCount: 2,
      periodicity: 'MONTHLY',
      startDate: `${sedeDayFromToday(-400)}T00:00:00.000Z`,
    });
  } finally {
    await api.dispose();
  }
});

async function openCarteraAsReception(page: Page): Promise<void> {
  await loginAs(page, origin, RECEPTION, DEMO_PASSWORD);
  // Toda la clínica: el deudor sembrado no tiene sede asignada por cita.
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/caja`);
  await openSection(page, 'Cartera');
  await expect(page).toHaveURL(/\/caja\/cartera$/);
  await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Resumen por antigüedad' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Antigüedad' }).selectOption({ label: 'Más de 90 días' });
}

function expectSafeWhatsApp(href: string | null): void {
  expect(href).toMatch(/^https:\/\/wa\.me\/573005550199\?text=/);
  const text = decodeURIComponent(href!.split('?text=')[1]);
  expect(text).toContain('Hola Deudor');
  expect(text).not.toMatch(/\d/);
  expect(text).not.toMatch(/COP|\$|saldo|deuda|cuota|corona/i);
}

test('recepción abre Cartera desde el menú y filtra más de 90 días (1440 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCarteraAsReception(page);

  const row = page.getByRole('row', { name: new RegExp(fullName) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('Más de 90 días').first()).toBeVisible();
  await expect(row.getByRole('link', { name: `Llamar a ${fullName}: 300 555 0199` })).toHaveAttribute(
    'href',
    'tel:3005550199',
  );
  expectSafeWhatsApp(await row.getByRole('link', { name: `WhatsApp a ${fullName}` }).getAttribute('href'));
  await expect(row.getByRole('link', { name: `Estado de cuenta de ${fullName}` })).toHaveAttribute(
    'href',
    `/patients/${patientId}?tab=account-statement`,
  );
  // Todas las filas filtradas tienen deuda de más de 90 días.
  const ages = await page.getByRole('table').getByText(/^\d+ días$/).allTextContents();
  expect(ages.length).toBeGreaterThan(0);
  for (const age of ages) expect(Number.parseInt(age, 10)).toBeGreaterThan(90);
  // El CSV es solo de ADMIN.
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // El enlace lleva al estado de cuenta del paciente.
  await row.getByRole('link', { name: `Estado de cuenta de ${fullName}` }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}\\?tab=account-statement`));
});

test('a 390 px cada deudor es una tarjeta con sus botones, sin scroll lateral', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCarteraAsReception(page);

  const card = page.getByRole('article', { name: fullName });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('table')).toBeHidden();
  const call = card.getByRole('link', { name: `Llamar a ${fullName}: 300 555 0199` });
  const whatsapp = card.getByRole('link', { name: `WhatsApp a ${fullName}` });
  await expect(call).toBeVisible();
  expectSafeWhatsApp(await whatsapp.getAttribute('href'));
  // Al alcance del pulgar: 44 px de alto como mínimo.
  for (const button of [call, whatsapp]) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expectNoHorizontalScroll(page);
});

test('el ADMIN exporta la cartera filtrada en CSV, con la marca de fecha aproximada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, ADMIN, DEMO_PASSWORD);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/caja/cartera`);
  await page.getByRole('combobox', { name: 'Antigüedad' }).selectOption({ label: 'Más de 90 días' });
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toBeVisible({ timeout: 15_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^cartera-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  const { readFile } = await import('node:fs/promises');
  const csv = await readFile(path!, 'utf8');
  expect(csv).toContain('Fecha aproximada');
  expect(csv).toContain(`"${fullName}"`);
  await expect(page.getByText('Cartera exportada.')).toBeVisible();
});

test('a 390 px los importes de cada tarjeta no se salen de ella (deudas de millones)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, RECEPTION, DEMO_PASSWORD);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/caja/cartera`);
  // La demo tiene deudores de más de un millón con varios tramos (p. ej. 1.535.000 COP).
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15_000 });
  const overflowing = await page.getByRole('article').evaluateAll((cards) =>
    cards.flatMap((card) => {
      const right = card.getBoundingClientRect().right;
      const worst = Math.max(
        ...[...card.querySelectorAll('*')].map((el) => el.getBoundingClientRect().right),
      );
      return worst > right ? [`${card.querySelector('h3')?.textContent}: ${Math.round(worst - right)} px`] : [];
    }),
  );
  expect(overflowing, 'contenido fuera de la tarjeta').toEqual([]);
  await expectNoHorizontalScroll(page);
});
