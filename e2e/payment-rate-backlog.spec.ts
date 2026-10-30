import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeViolations } from './support/axe';
import { ageRateBacklog, E2E_DATABASE_URL } from './support/db';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';

/**
 * DX-380: aviso al ADMIN de abonos sin tasa de más de 24 h, en el panel, a
 * 1440 y 390 px. Un abono en COP a un plan en USD se cobra sin tasa (la API de
 * la suite no tiene clave del proveedor), su reintento se envejece 25 h por
 * psql y el ADMIN ve «1 abono sin tasa desde el …» con el enlace a Ajustes ›
 * Tasa de cambio; recepción no lo ve ni lo pide. Al pasar a tasa manual y
 * registrar la de hoy, el reintento se adelanta y el barrido de cada minuto
 * (el worker de la API de la suite, APP_ROLE=all) lo resuelve: el aviso
 * desaparece.
 */

const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se puede envejecer el reintento del abono';
const NOTICE = 'Abonos sin tasa';
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

/** Hoy en la zona de la sede de la suite (`AAAA-MM-DD`). */
function sedeToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: E2E_REGION.timeZone! }).format(new Date());
}

/** Paciente, plan en USD con un ítem aceptado y un abono en COP sin tasa. Devuelve el abono. */
async function seedPaymentWithoutRate(request: APIRequestContext, session: ApiSession, tag: string): Promise<string> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Ana',
    lastName: `SinTasa${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX380${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `dx380-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona ${tag}`,
    color: '#3366CC',
    defaultPrice: 1000,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const accept = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), `aceptar el ítem falló: ${await accept.text()}`).toBeTruthy();
  const payment = await apiPost<{ id: string; exchangeRateStatus: string }>(
    request,
    session,
    `/treatment-plans/${plan.id}/payments`,
    { amount: 40000, currency: 'COP', paidAt: new Date(Date.now() - 60_000).toISOString(), method: 'CASH' },
  );
  expect(payment.exchangeRateStatus, 'sin clave del proveedor el abono queda «sin tasa»').toBe('MISSING');
  return payment.id;
}

for (const viewport of VIEWPORTS) {
  test.describe(`aviso de abonos sin tasa (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('el ADMIN ve el aviso pasadas 24 h, recepción no, y desaparece al registrar la tasa', async ({
      page,
      browser,
      request,
    }) => {
      test.skip(!E2E_DATABASE_URL, DB_SKIP);
      test.setTimeout(180_000);
      const tag = `${suffix}${viewport.width}`;
      const email = `admin.dx380.${tag}@example.com`;
      const session = await registerClinicViaApi(request, {
        subdomain: `dx380-${tag}`,
        clinicName: `Clínica Tasa ${tag}`,
        fullName: 'Rosa Tasa',
        email,
        password,
      });
      const paymentId = await seedPaymentWithoutRate(request, session, tag);
      ageRateBacklog(paymentId, 25);

      await loginAs(page, session.origin, email, password);
      await page.goto(`${session.origin}/dashboard`);
      const notice = page.getByRole('region', { name: NOTICE });
      await expect(notice).toBeVisible({ timeout: 15_000 });
      // Solo el recuento y el día (con el formato de la sede): nada del paciente ni importes.
      await expect(notice).toContainText(/^1 abono sin tasa desde el \d{1,2}\/\d{1,2}\/\d{4}/);
      await expect(notice).not.toContainText(`SinTasa${tag}`);
      await expect(notice).not.toContainText('COP');
      const link = notice.getByRole('link', { name: 'Revisar la tasa de cambio' });
      await expect(link).toHaveAttribute('href', '/settings/tasa-de-cambio');
      expect(await axeViolations(page, notice)).toEqual([]);
      if (QA_DIR) {
        // QA visual (390 y 1440, claro y oscuro), solo si se pide.
        mkdirSync(QA_DIR, { recursive: true });
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.screenshot({ path: `${QA_DIR}/dx380-aviso-${viewport.width}-${scheme}.png` });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      }
      if (viewport.width === 390) {
        await expectNoHorizontalScroll(page);
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }

      // Recepción: ni lo ve ni lo pide.
      const receptionEmail = `recepcion.dx380.${tag}@example.com`;
      await addStaffViaApi(request, session, {
        fullName: 'Luis Recepción',
        email: receptionEmail,
        role: 'RECEPTION',
        password,
      });
      const other = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const receptionPage = await other.newPage();
      const asked: string[] = [];
      receptionPage.on('request', (req) => {
        if (new URL(req.url()).pathname.endsWith('/payments/rate-backlog')) asked.push(req.url());
      });
      await loginAs(receptionPage, session.origin, receptionEmail, password);
      await receptionPage.goto(`${session.origin}/dashboard`);
      await receptionPage.waitForLoadState('networkidle');
      await expect(receptionPage.getByRole('region', { name: NOTICE })).toHaveCount(0);
      expect(asked).toEqual([]);
      await other.close();

      // El ADMIN pasa a tasa manual y registra la de hoy: el reintento se
      // adelanta y el barrido de cada minuto lo resuelve.
      const manual = await request.put(`${API_URL}/exchange/settings`, {
        headers: session.headers,
        data: { source: 'MANUAL' },
      });
      expect(manual.ok(), `pasar a manual falló: ${await manual.text()}`).toBeTruthy();
      await apiPost(request, session, '/exchange/manual-rates', { date: sedeToday(), currency: 'COP', rate: 4000 });
      await expect
        .poll(
          async () => {
            const [res] = await Promise.all([
              page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/payments/rate-backlog')),
              page.reload(),
            ]);
            return ((await res.json()) as { count: number }).count;
          },
          { timeout: 120_000, intervals: [5_000] },
        )
        .toBe(0);
      await expect(notice).toHaveCount(0);
    });
  });
}
