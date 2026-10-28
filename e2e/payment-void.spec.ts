import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-049 · SEC-013): anular un abono exige motivo y deja rastro.
 *
 * Registra una clínica (su dueño es ADMIN), siembra por la API real un paciente
 * con un plan y un abono, y desde la pestaña «Plan de tratamiento»:
 *   - «Anular» abre el modal con el campo «Motivo de la anulación»;
 *   - enviar sin motivo no anula y explica el error junto al campo;
 *   - con motivo, el abono sale de la lista;
 *   - el «Estado de cuenta» lo lista como «Anulado por <admin>: <motivo>».
 * Se ejecuta en escritorio (1440px) y en móvil (390px).
 *
 * Requiere los dos servidores (ver `playwright.config.ts`).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const adminName = 'Ada Admin';
const REASON = 'Cobro registrado dos veces';

async function seed(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  tag: string,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Ana',
    lastName: `Anular${tag}`,
    docType: 'CC',
    docNumber: `AN${tag}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  await post(`/treatment-plans/${plan.id}/payments`, {
    amount: 120,
    currency: 'USD',
    paidAt: new Date().toISOString(),
    method: 'CASH',
  });
  return patient.id;
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`anular abono pide motivo y el estado de cuenta muestra quién y por qué (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-void-${tag}`,
      clinicName: `Clinica Anular ${tag}`,
      fullName: adminName,
      email: `test.user.void.${tag}@example.com`,
      password,
    });
    const patientId = await seed(page.request, origin, await accessTokenOf(page), tag);

    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
    const panel = page.locator('#tabpanel-treatment-plans');
    await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({
      timeout: 15_000,
    });
    await panel.getByRole('button', { name: /^Abonos y saldo\s+\d+ abonos?$/ }).click();
    await panel.getByRole('button', { name: 'Anular' }).locator('visible=true').first().click();

    const dialog = page.getByRole('dialog', { name: '¿Anular este abono?' });
    await expect(dialog).toBeVisible();
    const reason = dialog.getByLabel('Motivo de la anulación');
    await expect(reason).toBeVisible();

    // Sin motivo: no anula y explica el error junto al campo.
    await dialog.getByRole('button', { name: 'Anular abono' }).click();
    await expect(dialog.getByRole('alert')).toContainText('al menos 3 caracteres');
    await expect(reason).toHaveAttribute('aria-invalid', 'true');

    await reason.fill(REASON);
    await dialog.getByRole('button', { name: 'Anular abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(panel.getByText('Este plan todavía no tiene abonos.')).toBeVisible({
      timeout: 10_000,
    });

    // Estado de cuenta: el anulado con su autor y motivo.
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const statement = page.locator('#tabpanel-account-statement');
    const movements = statement.getByRole('table', { name: 'Movimientos (abonos)' });
    await expect(movements).toContainText(`Anulado por ${adminName}: ${REASON}`, {
      timeout: 10_000,
    });
  });
}
