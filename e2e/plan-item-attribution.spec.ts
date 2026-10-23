import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { API_URL, tenantOrigin } from './support/urls';
import { loginAs } from './support/auth';

/**
 * DX-050 · Producción atribuible. En la clínica demo (`npm run seed:demo`), la
 * asistente marca «Realizado» un procedimiento aceptado: el modal le pide
 * quién lo realizó (ella no atiende, así que no viene nadie elegido), y la
 * ficha muestra «Realizado por … · fecha · sede» con la sede activa. Lo mismo
 * a 390 px y a 1440 px, sin desbordar la página y con controles de 44 px en
 * el móvil. La API guarda el profesional, la sede y la hora.
 */
const origin = tenantOrigin('demo');
const host = new URL(origin).host;
const password = 'DemoDentalix2026!';

interface Seeded {
  patientId: string;
  planId: string;
  itemId: string;
  norteId: string;
  dentistId: string;
  dentistName: string;
  headers: Record<string, string>;
}

async function seed(request: APIRequestContext, tag: string): Promise<Seeded> {
  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email: 'admin@demo.dentalix.app', password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { 'X-Tenant-Host': host, Authorization: `Bearer ${accessToken}` };
  async function call<T>(method: 'get' | 'post' | 'patch', path: string, data?: object): Promise<T> {
    const r = await request[method](API_URL + path, { headers, data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()) as T;
  }
  const locations = await call<{ id: string; name: string }[]>('get', '/locations');
  const norte = locations.find((l) => l.name === 'Sede Norte');
  expect(norte, 'la demo trae la Sede Norte').toBeTruthy();
  const staff = await call<{ userId: string; fullName: string; email?: string; role: string }[]>('get', '/staff');
  const dentist = staff.find((m) => m.role === 'DENTIST');
  expect(dentist, 'la demo trae una dentista').toBeTruthy();
  const patient = await call<{ id: string }>('post', '/patients', {
    firstName: 'Atribución',
    lastName: tag,
    docType: 'CC',
    docNumber: tag,
    sex: 'F',
  });
  const catalog = await call<{ id: string }>('post', '/catalog/items', {
    code: tag,
    kind: 'PROCEDURE',
    labelEs: `Resina ${tag}`,
    color: '#3366CC',
    defaultPrice: 100000,
  });
  const plan = await call<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, { currency: 'COP' });
  const item = await call<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
  });
  await call('patch', `/treatment-plans/${plan.id}`, { status: 'ACCEPTED' });
  return {
    patientId: patient.id,
    planId: plan.id,
    itemId: item.id,
    norteId: norte!.id,
    dentistId: dentist!.userId,
    dentistName: dentist!.fullName,
    headers,
  };
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'desbordamiento horizontal',
  ).toBeLessThanOrEqual(0);
}

/** Hoy en Bogotá como lo pinta la ficha (dd/mm/aaaa). */
function todayInBogota(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
  return parts;
}

test.setTimeout(120_000);

for (const [width, theme] of [
  [390, 'light'],
  [1440, 'dark'],
] as const) {
  test(`DX-050: la asistente marca realizado eligiendo a la dentista (${width}px, ${theme})`, async ({ page }) => {
    const tag = `dx050${randomUUID().slice(0, 8)}${width}`;
    const data = await seed(page.request, tag);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      ({ locationId, theme }) => {
        localStorage.setItem('dentalix.activeLocationId', locationId);
        localStorage.setItem('theme', theme);
      },
      { locationId: data.norteId, theme },
    );

    await loginAs(page, origin, 'asistente@demo.dentalix.app', password);
    await page.goto(`${origin}/patients/${data.patientId}?tab=treatment-plans`);

    const status = page.getByLabel('Estado del ítem del diente 16').locator('visible=true');
    await expect(status).toHaveValue('ACCEPTED');
    await status.selectOption({ label: 'Realizado' });

    const dialog = page.getByRole('dialog', { name: 'Marcar como realizado' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Resina ${tag} · diente 16`)).toBeVisible();
    await expect(dialog.getByText('Se registra en Sede Norte.')).toBeVisible();
    const performer = dialog.getByLabel('Profesional que lo realizó');
    // La asistente no atiende y hay varios profesionales: nadie viene elegido.
    await expect(performer).toHaveValue('');
    await expect(performer.locator('option', { hasText: 'Asistente' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Marcar realizado' }).click();
    await expect(dialog.getByText('Elige qué profesional lo realizó.')).toBeVisible();

    await performer.selectOption(data.dentistId);
    if (width === 390) {
      const box = await performer.boundingBox();
      expect(box?.height ?? 0, 'selector táctil de 44 px').toBeGreaterThanOrEqual(44);
      await noOverflow(page);
    }
    await page.screenshot({
      path: `test-results/dx050-modal-${width}-${theme}.png`,
    });
    await dialog.getByRole('button', { name: 'Marcar realizado' }).click();
    await expect(dialog).toBeHidden();

    const line = `Realizado por ${data.dentistName} · ${todayInBogota()} · Sede Norte`;
    const attribution = page.getByText(line).locator('visible=true');
    await expect(attribution).toBeVisible();
    await attribution.scrollIntoViewIfNeeded();
    await expect(status).toHaveValue('DONE');
    await noOverflow(page);
    await page.screenshot({ path: `test-results/dx050-ficha-${width}-${theme}.png` });

    const stored = await page.request.get(`${API_URL}/treatment-plans/${data.planId}`, { headers: data.headers });
    expect(stored.ok(), await stored.text()).toBeTruthy();
    const plan = (await stored.json()) as {
      items: { id: string; status: string; performedById: string; performedLocationId: string; completedAt: string }[];
    };
    expect(plan.items.find((i) => i.id === data.itemId)).toMatchObject({
      status: 'DONE',
      performedById: data.dentistId,
      performedLocationId: data.norteId,
      completedAt: expect.any(String),
    });
  });
}
