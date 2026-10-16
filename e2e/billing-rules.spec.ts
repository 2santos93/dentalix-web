import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi } from './support/api';
import { API_URL } from './support/urls';

/**
 * e2e (DX-109): nadie cobra sobre un presupuesto rechazado.
 *
 * Se siembra por la API una clínica con un paciente y un plan presentado y
 * rechazado por el paciente. En la pestaña del plan:
 *   - «Registrar abono» está deshabilitado y explica por qué;
 *   - no se ofrece crear un plan de pagos;
 *   - los ítems no se pueden cambiar ni quitar, ni se agregan nuevos.
 * Y la API, si alguien lo intenta igual, responde 409 con el mensaje de negocio
 * en español. En escritorio y en móvil (390px, sin scroll horizontal).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinic = {
  subdomain: `test-clinic-cobro-${suffix}`,
  clinicName: `Clínica Cobro ${suffix}`,
  fullName: 'Dra. Cobro',
  email: `cobro.${suffix}@example.com`,
  password: 'Password123!',
};
const NOT_BILLABLE = 'Este plan está «Rechazado»: no admite abonos ni planes de cuotas.';
const API_NOT_BILLABLE = 'El plan está «Rechazado»: no admite abonos ni planes de cuotas.';

test('plan rechazado: sin «Registrar abono», sin plan de pagos, ítems congelados; la API responde 409 en español', async ({
  page,
  request,
}) => {
  const admin = await registerClinicViaApi(request, clinic);
  const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
    code: `res-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Resina ${suffix}`,
    color: '#3366CC',
    defaultPrice: 120_000,
  });
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Rocío',
    lastName: `Rechazo${suffix}`,
    docType: 'CC',
    docNumber: `DX109${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
  });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/present`, {});
  await apiPost(request, admin, `/treatment-plans/${plan.id}/reject`, { reason: 'PRICE' });

  // La API no admite el abono aunque alguien lo intente por fuera de la UI.
  const refused = await request.post(`${API_URL}/treatment-plans/${plan.id}/payments`, {
    headers: admin.headers,
    data: { amount: 1000, currency: 'COP', paidAt: '2026-10-16', method: 'CASH' },
  });
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { message: string }).message).toBe(API_NOT_BILLABLE);

  await loginAs(page, admin.origin, clinic.email, clinic.password);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);

    const payButton = page.getByRole('button', { name: 'Registrar abono', exact: true });
    await expect(payButton).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByText(NOT_BILLABLE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear plan de pagos' })).toHaveCount(0);
    await expect(
      page.getByText('Este plan está «Rechazado»: sus ítems ya no se pueden añadir, cambiar ni quitar.'),
    ).toBeVisible();
    await expect(page.getByRole('form', { name: 'Agregar ítem' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Quitar', exact: true })).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
