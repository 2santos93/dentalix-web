import { test, expect, type APIRequestContext, type Browser, type Page } from './support/test';
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
 *
 * Revisión DX-050: la dentista lo marca y viene elegida ella; no puede
 * corregirlo (403 en español) y un ADMIN sí, desde la ficha, y la corrección
 * se lee en Auditoría. Los realizados de antes de DX-050 salen «Sin
 * atribuir». Sin errores de la app en la consola.
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

async function apiHeaders(request: APIRequestContext, email: string): Promise<Record<string, string>> {
  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  return { 'X-Tenant-Host': host, Authorization: `Bearer ${accessToken}` };
}

async function seed(request: APIRequestContext, tag: string): Promise<Seeded> {
  const headers = await apiHeaders(request, 'admin@demo.dentalix.app');
  async function call<T>(method: 'get' | 'post' | 'patch', path: string, data?: object): Promise<T> {
    const r = await request[method](API_URL + path, { headers, data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()) as T;
  }
  const locations = await call<{ id: string; name: string }[]>('get', '/locations');
  const norte = locations.find((l) => l.name === 'Sede Norte');
  expect(norte, 'la demo trae la Sede Norte').toBeTruthy();
  const staff = await call<{ userId: string; fullName: string; email?: string; role: string }[]>('get', '/staff');
  const dentist = staff.find((m) => m.email === 'dentista@demo.dentalix.app');
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

/**
 * Errores de la app en la consola (excepciones y `console.error`) y respuestas
 * fallidas de las llamadas de este flujo: el plan y sus ítems, el personal y
 * la auditoría. Las demás llamadas de la ficha quedan fuera: sus 403/404 son
 * previos a DX-050 (abonos y saldo para roles clínicos sin cobro, plan de
 * cuotas inexistente) y no son de este flujo.
 */
const FLOW_CALL = /\/api\/v1\/(treatment-plans\/[^/?]+(\/items\/[^/?]+)?|staff|audit-events)(\?|$)/;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && FLOW_CALL.test(r.url())) {
      problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  return problems;
}

async function pageAs(browser: Browser, email: string, width: number) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    timezoneId: 'America/Bogota',
    locale: 'es-CO',
  });
  const page = await context.newPage();
  const problems = watchConsole(page);
  await loginAs(page, origin, email, password);
  return { context, page, problems };
}

test('DX-050: la dentista marca realizado (viene elegida ella), no lo corrige (403) y un ADMIN sí, con rastro en Auditoría', async ({
  browser,
}) => {
  const tag = `dx050${randomUUID().slice(0, 8)}fix`;
  const dentist = await pageAs(browser, 'dentista@demo.dentalix.app', 1440);
  const data = await seed(dentist.page.request, tag);

  await dentist.page.goto(`${origin}/patients/${data.patientId}?tab=treatment-plans`);
  const status = dentist.page.getByLabel('Estado del ítem del diente 16').locator('visible=true');
  await expect(status).toHaveValue('ACCEPTED');
  await status.selectOption({ label: 'Realizado' });
  const dialog = dentist.page.getByRole('dialog', { name: 'Marcar como realizado' });
  const performer = dialog.getByLabel('Profesional que lo realizó');
  // Quien marca atiende: viene elegida ella.
  await expect(performer).toHaveValue(data.dentistId);
  await dialog.getByRole('button', { name: 'Marcar realizado' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    dentist.page.getByText(new RegExp(`^Realizado por ${data.dentistName} · ${todayInBogota()}`)).locator('visible=true'),
  ).toBeVisible();
  // La dentista no corrige: ni se le ofrece ni la API lo admite.
  await expect(dentist.page.getByRole('button', { name: /^Corregir quién realizó/ })).toHaveCount(0);
  const staff = (await (
    await dentist.page.request.get(`${API_URL}/staff`, { headers: data.headers })
  ).json()) as { userId: string; fullName: string; email: string }[];
  const other = staff.find((m) => m.email === 'dentista2@demo.dentalix.app')!;
  const denied = await dentist.page.request.patch(`${API_URL}/treatment-plans/${data.planId}/items/${data.itemId}`, {
    headers: await apiHeaders(dentist.page.request, 'dentista@demo.dentalix.app'),
    data: { performedById: other.userId },
  });
  expect(denied.status()).toBe(403);
  expect(((await denied.json()) as { message: string }).message).toBe(
    'Solo un administrador puede cambiar quién realizó un procedimiento o cuándo.',
  );
  expect(dentist.problems).toEqual([]);
  await dentist.context.close();

  // El ADMIN lo corrige desde la ficha y queda en Auditoría.
  const admin = await pageAs(browser, 'admin@demo.dentalix.app', 1440);
  await admin.page.goto(`${origin}/patients/${data.patientId}?tab=treatment-plans`);
  await admin.page.getByRole('button', { name: 'Corregir quién realizó el ítem del diente 16' }).locator('visible=true').click();
  const correct = admin.page.getByRole('dialog', { name: 'Corregir quién lo realizó' });
  await expect(correct.getByLabel('Profesional que lo realizó')).toHaveValue(data.dentistId);
  await correct.getByLabel('Profesional que lo realizó').selectOption(other.userId);
  await correct.getByRole('button', { name: 'Guardar' }).click();
  await expect(correct).toBeHidden();
  await expect(
    admin.page.getByText(new RegExp(`^Realizado por ${other.fullName} · ${todayInBogota()}`)).locator('visible=true'),
  ).toBeVisible();
  await admin.page.goto(`${origin}/settings/auditoria`);
  const row = admin.page.getByRole('row', { name: /Corrección de quién lo realizó · Otro profesional/ }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(`Atribución ${tag}`);
  expect(admin.problems).toEqual([]);
  await admin.context.close();
});

for (const width of [390, 1440]) {
  test(`DX-050: un realizado anterior a DX-050 sale «Sin atribuir» (${width}px)`, async ({ browser }) => {
    const admin = await pageAs(browser, 'admin@demo.dentalix.app', width);
    const headers = await apiHeaders(admin.page.request, 'admin@demo.dentalix.app');
    const found = await admin.page.request.get(`${API_URL}/patients?query=Salcedo`, { headers });
    expect(found.ok(), await found.text()).toBeTruthy();
    const { items } = (await found.json()) as { items: { id: string; lastName: string }[] };
    const patient = items.find((p) => p.lastName.startsWith('Salcedo'));
    expect(patient, 'la demo trae a Ricardo Salcedo con un realizado sin atribuir').toBeTruthy();
    await admin.page.goto(`${origin}/patients/${patient!.id}?tab=treatment-plans`);
    const unattributed = admin.page.getByText('Sin atribuir', { exact: true }).locator('visible=true');
    await expect(unattributed).toBeVisible();
    await unattributed.scrollIntoViewIfNeeded();
    await noOverflow(admin.page);

    // DX-305: atribuirlo pide quién, cuándo y en qué sede. Se abre y se cancela
    // (la demo conserva su «Sin atribuir» para «Comparar sedes»).
    await admin.page
      .getByRole('button', { name: /^Atribuir quién, cuándo y dónde se realizó el ítem del diente/ })
      .locator('visible=true')
      .first()
      .click();
    const attribute = admin.page.getByRole('dialog', { name: 'Atribuir el procedimiento' });
    await expect(attribute.getByLabel('Sede donde se realizó')).toBeVisible();
    await expect(attribute.getByLabel('Fecha en que se realizó')).toBeVisible();
    await expect(attribute.getByLabel('Profesional que lo realizó')).toBeVisible();
    await noOverflow(admin.page);
    await attribute.getByRole('button', { name: 'Guardar' }).click();
    // Sin sede activa falta la sede; con ella, la fecha.
    await expect(
      attribute.getByText(/^(Elige la sede donde se realizó\.|Indica la fecha en que se realizó \(no puede ser futura\)\.)$/),
    ).toBeVisible();
    await attribute.getByRole('button', { name: 'Cancelar' }).click();
    await expect(attribute).toBeHidden();
    await expect(unattributed).toBeVisible();
    expect(admin.problems).toEqual([]);
    await admin.context.close();
  });
}
