import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { openPatientTab } from './support/patient-tabs';

/**
 * e2e (DX-253): saldo a favor en el estado de cuenta, a 1440 px y a 390 px.
 *
 * Siembra por la API real un paciente con un plan de 500 USD con 300 abonados
 * que luego se CANCELA (300 a favor) y otro plan vivo de 400 USD. Desde la
 * pestaña «Estado de cuenta»:
 *   - «Aplicar a otro plan» 200 → el origen queda con 100 a favor (vista previa
 *     y fila), el destino baja a 200;
 *   - «Devolver» 40 por transferencia con motivo → el comprobante numerado
 *     (DEV-…) con línea de firma, imprimible en A4 y en tirilla de 80 mm;
 *   - a 390 px los modales se usan sin scroll horizontal.
 */
const API = API_URL;
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const usd = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
const money = (amount: number) => usd.format(amount);

async function seed(request: APIRequestContext, origin: string, token: string, tag: string) {
  const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Host': new URL(origin).host };
  async function call<T>(method: 'post' | 'patch', path: string, data: object): Promise<T> {
    const res = await request[method](`${API}${path}`, { headers, data });
    expect(res.ok(), `${method} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await call<{ id: string }>('post', '/patients', {
    firstName: 'Ana',
    lastName: `Favor${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `SF${tag}`.slice(0, 20),
    sex: 'F',
  });
  async function plan(price: number, code: string): Promise<string> {
    const catalog = await call<{ id: string }>('post', '/catalog/items', {
      code: `${code}-${tag}`,
      kind: 'PROCEDURE',
      labelEs: `Corona ${code}`,
      color: '#3366CC',
      defaultPrice: price,
    });
    const created = await call<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
      currency: 'USD',
    });
    const item = await call<{ id: string }>('post', `/treatment-plans/${created.id}/items`, {
      toothNumber: '11',
      catalogItemId: catalog.id,
    });
    await call('patch', `/treatment-plans/${created.id}/items/${item.id}`, { status: 'ACCEPTED' });
    return created.id;
  }
  const origen = await plan(500, 'sfo');
  await plan(400, 'sfd');
  await call('post', `/treatment-plans/${origen}/payments`, {
    amount: 300,
    currency: 'USD',
    paidAt: '2026-09-01',
    method: 'TRANSFER',
  });
  await call('patch', `/treatment-plans/${origen}`, { status: 'CANCELLED' });
  return patient.id;
}

async function noHorizontalScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`saldo a favor: aplicar a otro plan y devolver con comprobante (${viewport.width} px)`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-sf-${tag}`,
      clinicName: `Clinica Saldo Favor ${tag}`,
      fullName: 'Test User',
      email: `test.user.saldofavor.${tag}@example.com`,
      password: 'Password123!',
    });
    const token = await accessTokenOf(page);
    const patientId = await seed(page.request, origin, token, tag);
    await context.addInitScript(() => {
      window.print = () => undefined;
    });

    await page.goto(`${origin}/patients/${patientId}`);
    await openPatientTab(page, 'Estado de cuenta');
    const panel = page.locator('#tabpanel-account-statement');
    const credit = panel.getByTestId('credit-balance');
    await expect(credit).toBeVisible({ timeout: 10_000 });
    await expect(credit.getByTestId('credit-row')).toContainText(money(300));

    // --- Aplicar a otro plan -------------------------------------------------
    await credit.getByRole('button', { name: /Aplicar a otro plan/ }).click();
    const transfer = page.getByRole('dialog');
    await transfer.getByLabel('Importe a aplicar').fill('200');
    await expect(transfer.getByRole('region', { name: 'Vista previa' })).toContainText(money(100));
    await noHorizontalScroll(page);
    await transfer.getByRole('button', { name: 'Aplicar al plan' }).click();
    await expect(transfer).toBeHidden();
    await expect(credit.getByTestId('credit-row')).toContainText(money(100));

    // --- Devolver --------------------------------------------------------------
    await credit.getByRole('button', { name: /Devolver/ }).click();
    const refund = page.getByRole('dialog');
    await refund.getByLabel('Importe a devolver').fill('40');
    await refund.getByLabel('Cómo se devuelve').selectOption('TRANSFER');
    await refund.getByLabel('Motivo').fill('El paciente se muda de ciudad');
    await noHorizontalScroll(page);
    await refund.getByRole('button', { name: 'Devolver' }).click();

    const receipt = page.getByRole('dialog', { name: 'Devolución registrada' });
    const document = receipt.getByTestId('refund-document');
    await expect(document).toContainText(/DEV-[A-Z0-9]+-000001/);
    await expect(document).toContainText(money(40));
    await expect(document).toContainText('El paciente se muda de ciudad');
    await expect(receipt.getByTestId('signature-line')).toHaveCount(2);

    for (const [name, format] of [
      ['Imprimir A4', 'a4'],
      ['Tirilla 80 mm', '80mm'],
    ] as const) {
      const [tab] = await Promise.all([
        context.waitForEvent('page'),
        receipt.getByRole('link', { name: new RegExp(name) }).click(),
      ]);
      await expect(tab.getByTestId('refund-document')).toHaveAttribute('data-format', format, {
        timeout: 10_000,
      });
      await tab.close();
    }
    await receipt.getByRole('button', { name: 'Cerrar' }).first().click();
    await expect(credit.getByTestId('credit-row')).toContainText(money(60));
  });
}
