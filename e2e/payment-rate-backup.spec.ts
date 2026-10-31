import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeViolations } from './support/axe';
import { ageRateBacklog, E2E_DATABASE_URL, postponeRateRetry } from './support/db';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';

/**
 * DX-402: el caso de la QA de DX-380 (punto 7, caso A) desde el aviso, a 1440
 * y 390 px. La clínica está en la fuente automática y el proveedor no da la
 * tasa (la API de la suite no tiene clave): un abono en USD a un plan en COP
 * de hace dos días queda «sin tasa» más de 24 h, con el reintento aplazado
 * 20 h. El ADMIN sigue el aviso del panel hasta Ajustes › Tasa de cambio,
 * pasa a manual (manual desde hoy) y registra la tasa COP de ese día: el
 * formulario le dice que servirá de respaldo a ese abono (y, con un día sin
 * abonos pendientes, que no se usará). El registro adelanta el reintento y el
 * barrido de cada minuto (worker de la API de la suite, APP_ROLE=all) congela
 * la tasa: el aviso desaparece.
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

/** Un día de la sede de la suite (`AAAA-MM-DD`), `offset` días desde hoy. */
function sedeDay(offset: number): string {
  const day = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: E2E_REGION.timeZone! }).format(day);
}

/** Paciente, plan en COP con un ítem aceptado y un abono en USD de `day` sin tasa. */
async function seedPaymentWithoutRate(
  request: APIRequestContext,
  session: ApiSession,
  tag: string,
  day: string,
): Promise<string> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Ana',
    lastName: `Respaldo${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX402${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `dx402-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona ${tag}`,
    color: '#3366CC',
    defaultPrice: 1_000_000,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
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
    { amount: 50, currency: 'USD', paidAt: day, method: 'CASH' },
  );
  expect(payment.exchangeRateStatus, 'sin clave del proveedor el abono queda «sin tasa»').toBe('MISSING');
  return payment.id;
}

for (const viewport of VIEWPORTS) {
  test.describe(`tasa manual de un día anterior a «manual desde» (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('desde el aviso: pasar a manual y registrar la tasa del día del abono lo resuelve', async ({
      page,
      request,
    }) => {
      test.skip(!E2E_DATABASE_URL, DB_SKIP);
      test.setTimeout(240_000);
      const tag = `${suffix}${viewport.width}`;
      const email = `admin.dx402.${tag}@example.com`;
      const session = await registerClinicViaApi(request, {
        subdomain: `dx402-${tag}`,
        clinicName: `Clínica Respaldo ${tag}`,
        fullName: 'Rosa Respaldo',
        email,
        password,
      });
      const day = sedeDay(-2);
      const paymentId = await seedPaymentWithoutRate(request, session, tag, day);
      ageRateBacklog(paymentId, 26);
      postponeRateRetry(paymentId, 20);

      // 1. El aviso del panel propone lo que resuelve el caso.
      await loginAs(page, session.origin, email, password);
      await page.goto(`${session.origin}/dashboard`);
      const notice = page.getByRole('region', { name: NOTICE });
      await expect(notice).toBeVisible({ timeout: 15_000 });
      await expect(notice).toContainText('1 abono sin tasa');
      await expect(notice).toContainText('servirá de respaldo');
      await notice.getByRole('link', { name: 'Revisar la tasa de cambio' }).click();
      await expect(page).toHaveURL(/\/settings\/tasa-de-cambio$/);

      // 2. Pasa a manual: rige desde hoy.
      await page.getByRole('button', { name: 'Cambiar' }).click();
      const sourceDialog = page.getByRole('dialog', { name: 'Cambiar de dónde sale la tasa' });
      await expect(sourceDialog).toContainText('respaldo');
      await sourceDialog.getByRole('radio', { name: /Manual/ }).check();
      await sourceDialog.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByTestId('exchange-rate-source')).toContainText('Manual desde el');

      // 3. Registrar la tasa de un día anterior: el formulario dice a qué abonos se aplicará.
      await page.getByRole('button', { name: 'Registrar tasa' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Registrar tasa' });
      await dialog.getByLabel('Fecha').fill(sedeDay(-3));
      await dialog.getByLabel('Moneda').selectOption('COP');
      const backupNotice = dialog.getByTestId('manual-rate-backup-notice');
      await expect(backupNotice).toContainText('anterior a «manual desde»');
      await expect(backupNotice).toContainText('así que ahora no se usará');
      await dialog.getByLabel('Fecha').fill(day);
      await expect(backupNotice).toContainText('Servirá de respaldo al abono sin tasa de ese día que necesita la tasa de COP');
      await dialog.getByLabel(/^Tasa por 1/).fill('4000');
      expect(await axeViolations(page, dialog)).toEqual([]);
      if (QA_DIR) {
        mkdirSync(QA_DIR, { recursive: true });
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.screenshot({ path: `${QA_DIR}/dx402-formulario-${viewport.width}-${scheme}.png` });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      }
      if (viewport.width === 390) {
        await expectNoHorizontalScroll(page);
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
      await dialog.getByRole('button', { name: 'Registrar tasa' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText('Tasa de COP registrada.')).toBeVisible();

      // 4. El registro adelanta el reintento y el barrido lo resuelve: el aviso desaparece.
      // Se espera a la primera lectura del aviso antes de recargar: recargar con
      // el `/auth/refresh` de la carga aún en vuelo lo aborta después de que la
      // API rotara la cookie, y el siguiente refresh (cookie vieja) da 401 y
      // manda a /login, donde el sondeo esperaría para siempre.
      const isBacklog = (r: { url(): string }) => new URL(r.url()).pathname.endsWith('/payments/rate-backlog');
      await Promise.all([page.waitForResponse(isBacklog), page.goto(`${session.origin}/dashboard`)]);
      await expect
        .poll(
          async () => {
            const [res] = await Promise.all([
              page.waitForResponse(isBacklog),
              page.reload(),
            ]);
            return ((await res.json()) as { count: number }).count;
          },
          { timeout: 120_000, intervals: [5_000] },
        )
        .toBe(0);
      await expect(page.getByRole('region', { name: NOTICE })).toHaveCount(0);

      // 5. La tasa ya la usa el abono: no se puede corregir.
      await page.goto(`${session.origin}/settings/tasa-de-cambio`);
      await expect(page.getByRole('table', { name: 'Tasas manuales' })).toContainText('Usada en abonos');
      if (QA_DIR) {
        await page.screenshot({ path: `${QA_DIR}/dx402-usada-${viewport.width}.png` });
      }
    });
  });
}
