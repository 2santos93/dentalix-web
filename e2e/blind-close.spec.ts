import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';

/**
 * e2e (SEC-043): el arqueo ciego no se puede eludir desde la pantalla.
 *
 * Contra la clínica DEMO sembrada. Con «arqueo ciego» activo, recepción abre
 * su caja y cobra en efectivo (por la API):
 *   - en Caja → Abonos no ve ese cobro (ni en la lista ni en el resumen) y un
 *     aviso le dice por qué y dónde verlo;
 *   - en Caja → Turnos cuenta sin ver lo esperado, cierra sin motivo aunque no
 *     cuadre (la pantalla no lo sabe antes) y el turno sale «Sin justificar»;
 *   - la administradora abre ese turno y ve «Diferencia sin justificar».
 * Al terminar, los ajustes de caja vuelven a los de por defecto. En
 * escritorio (1440px) y en móvil (390px, sin scroll horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

async function apiLogin(request: APIRequestContext, host: string, email: string): Promise<Record<string, string>> {
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login ${email} falló: ${await res.text()}`).toBeTruthy();
  const token = ((await res.json()) as { accessToken: string }).accessToken;
  return { 'X-Tenant-Host': host, Authorization: `Bearer ${token}` };
}

async function post<T>(request: APIRequestContext, headers: Record<string, string>, path: string, data: object): Promise<T> {
  const res = await request.post(`${API_URL}${path}`, { headers, data });
  expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function setBlind(request: APIRequestContext, admin: Record<string, string>, blindClose: boolean) {
  const res = await request.put(`${API_URL}/cash-sessions/settings`, {
    headers: admin,
    data: { requireOpenSession: false, blindClose },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

interface Expected {
  currency: string;
  method: string;
  expected: number;
}

/** Sin arqueo ciego, cierra cuadrada la caja abierta que tenga recepción. */
async function startClean(request: APIRequestContext, host: string) {
  const admin = await apiLogin(request, host, ADMIN_EMAIL);
  const reception = await apiLogin(request, host, RECEPTION_EMAIL);
  await setBlind(request, admin, false);
  const current = await request.get(`${API_URL}/cash-sessions/current`, { headers: reception });
  const body = (await current.json()) as { session: { id: string; expected: Expected[] } | null };
  if (body.session) {
    await post(request, reception, `/cash-sessions/${body.session.id}/close`, {
      counts: body.session.expected.map((l) => ({ currency: l.currency, method: l.method, counted: Math.max(0, l.expected) })),
      differenceReason: 'Cierre previo a la prueba e2e',
    });
  }
  return { admin, reception };
}

async function webLogin(page: Page, origin: string, email: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect
    .poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 })
    .toBe(true);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`arqueo ciego: recepción no ve lo esperado por ninguna vía y el cierre sin motivo queda «Sin justificar» (${viewport.name})`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const narrow = viewport.width === 390;
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const host = new URL(origin).host;
    const { admin, reception } = await startClean(page.request, host);
    const tag = `${suffix}${viewport.width}`;
    const lastName = `Ciego${tag}`;

    try {
      await setBlind(page.request, admin, true);
      await post(page.request, reception, '/cash-sessions/open', { floats: [{ currency: 'USD', amount: 100 }] });
      const patient = await post<{ id: string }>(page.request, admin, '/patients', {
        firstName: 'Arqueo',
        lastName,
        docType: 'NATIONAL_ID',
        docNumber: `28${Date.now().toString().slice(-8)}`,
        sex: 'F',
      });
      const plan = await post<{ id: string }>(page.request, admin, `/patients/${patient.id}/treatment-plans`, {
        currency: 'USD',
      });
      await post(page.request, reception, `/treatment-plans/${plan.id}/payments`, {
        amount: 45,
        currency: 'USD',
        paidAt: new Date().toISOString(),
        method: 'CASH',
      });

      await webLogin(page, origin, RECEPTION_EMAIL);

      // Vía «Abonos»: el cobro de la caja abierta no sale, y el aviso lo explica.
      await page.goto(`${origin}/caja`);
      await expect(page.getByRole('tab', { name: 'Abonos' })).toHaveAttribute('aria-selected', 'true');
      const notice = page.getByTestId('cash-blind-hidden');
      await expect(notice).toBeVisible({ timeout: 15_000 });
      await expect(notice).toContainText('faltan los abonos de las cajas abiertas');
      await expect(page.getByText(lastName)).toHaveCount(0);
      if (narrow) await expectNoHorizontalScroll(page);
      await shot(page, 'sec043-abonos', viewport.width);

      // Vía «Turnos»: sin esperado; cierra sin motivo aunque no cuadre.
      await page.goto(`${origin}/caja?tab=turnos`);
      await expect(page.getByText(/Arqueo ciego: cuenta antes de ver lo esperado/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Esperado hasta ahora')).toHaveCount(0);
      await page.getByRole('button', { name: 'Cerrar caja' }).click();
      const closeDialog = page.getByRole('dialog', { name: 'Cerrar caja' });
      if (narrow) await expectDialogInsideViewport(page, closeDialog);
      await expect(closeDialog.getByText(/Esperado/)).toHaveCount(0);
      await expect(closeDialog.getByLabel('Motivo si crees que no cuadra (opcional)')).toBeVisible();
      // Esperado: 100 + 45 = 145. Cuenta 140 y no deja motivo.
      await closeDialog.getByLabel('Contado en efectivo (USD)').fill('140');
      await shot(page, 'sec043-cierre', viewport.width);
      await closeDialog.getByRole('button', { name: 'Cerrar caja' }).click();
      await expect(page.getByText('Caja cerrada: el arqueo quedó guardado.')).toBeVisible({ timeout: 15_000 });
      const listing = page.getByRole(narrow ? 'list' : 'table', { name: 'Turnos de caja' });
      const row = listing.getByRole(narrow ? 'listitem' : 'row').filter({ hasText: 'Cerrada' }).first();
      await expect(row).toContainText('Sin justificar');
      await expect(row).toContainText('-5,00');
      if (narrow) await expectNoHorizontalScroll(page);
      await row.scrollIntoViewIfNeeded();
      await shot(page, 'sec043-turnos', viewport.width);

      // Cerrada su caja, el cobro vuelve a «Abonos».
      await page.goto(`${origin}/caja`);
      await expect(page.getByText(`Arqueo ${lastName}`).first()).toBeVisible({ timeout: 15_000 });

      // La administradora ve la marca en la ficha del turno.
      const adminContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const adminPage = await adminContext.newPage();
      try {
        await webLogin(adminPage, origin, ADMIN_EMAIL);
        await adminPage.goto(`${origin}/caja?tab=turnos`);
        const adminListing = adminPage.getByRole(narrow ? 'list' : 'table', { name: 'Turnos de caja' });
        const flagged = adminListing.getByRole(narrow ? 'listitem' : 'row').filter({ hasText: 'Sin justificar' }).first();
        await expect(flagged).toBeVisible({ timeout: 15_000 });
        await flagged.getByRole('link').first().click();
        const doc = adminPage.getByTestId('cash-session-report');
        await expect(doc).toContainText('Diferencia sin justificar', { timeout: 15_000 });
        await expect(doc).toContainText('Cerrada con arqueo ciego.');
        if (narrow) await expectNoHorizontalScroll(adminPage);
        await doc.getByText('Diferencia sin justificar').scrollIntoViewIfNeeded();
        await shot(adminPage, 'sec043-informe-admin', viewport.width);
      } finally {
        await adminContext.close();
      }
    } finally {
      await setBlind(page.request, admin, false);
    }
  });
}
