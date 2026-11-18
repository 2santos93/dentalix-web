import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';

/**
 * e2e (DX-092 + DX-123): cancelar un plan de cuotas pide el motivo, y el
 * cancelado queda a la vista con «Cancelado», fecha, autor y motivo. Abrir un
 * plan sin plan de cuotas ya no deja un 404 en la consola.
 *
 * Una clínica nueva con un plan de tratamiento de USD 600 y un plan de cuotas
 * de 2 mensuales. A 390 y 1440 px: «Cancelar plan» sin motivo no hace nada y
 * lo dice; con motivo cancela; la sección queda «Sin plan de pagos» y el
 * historial plegado «Planes de pagos cancelados» lo enseña. axe en claro y
 * oscuro, sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
const clinic = {
  subdomain: `test-clinic-cancel-cuotas-${suffix}`,
  clinicName: `Clínica Cancelar Cuotas ${suffix}`,
  fullName: 'Dra. Cancela Cuotas',
  email: `cancela.cuotas.${suffix}@example.com`,
  password: 'Password123!',
};

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function planWithInstallments(request: APIRequestContext, admin: ApiSession, tag: string) {
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Mariela',
    lastName: `Cuotas${tag}${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `DX092${tag}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
    code: `cc${tag}-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Corona ${tag} ${suffix}`,
    color: '#3366CC',
    defaultPrice: 600,
  });
  const item = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
  });
  const accept = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: admin.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  await apiPost<object>(request, admin, `/treatment-plans/${plan.id}/payment-plan`, {
    installmentsCount: 2,
    periodicity: 'MONTHLY',
    startDate: '2099-01-10',
  });
  return { patientId: patient.id, planId: plan.id };
}

test('Cancelar un plan de cuotas pide motivo y deja el rastro «Cancelado» con fecha, autor y motivo; sin 404 en la consola', async ({
  page,
  request,
}) => {
  const admin = await registerClinicViaApi(request, clinic);
  // DX-123 (B-4): ninguna respuesta 404 de /payment-plan, ni en la consola.
  const notFound: string[] = [];
  page.on('response', (res) => {
    if (/\/treatment-plans\/[^/]+\/payment-plan(\/history)?(\?|$)/.test(res.url()) && res.status() === 404) {
      notFound.push(res.url());
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('404')) notFound.push(`${msg.text()} ${msg.location().url}`);
  });
  await loginAs(page, admin.origin, clinic.email, clinic.password);

  for (const viewport of VIEWPORTS) {
    const { patientId } = await planWithInstallments(request, admin, String(viewport.width));
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/patients/${patientId}?tab=treatment-plans`);
    const section = page.getByRole('region', { name: 'Plan de pagos' });
    const calendar = section
      .getByRole('table', { name: 'Calendario de cuotas' })
      .or(section.getByRole('list', { name: 'Calendario de cuotas' }));
    await expect(calendar).toBeVisible({ timeout: 20_000 });

    await section.getByRole('button', { name: 'Cancelar plan' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Cancelar el plan de pagos?' });
    await expect(dialog).toBeVisible();
    await expectDialogInsideViewport(page, dialog);
    // Sin motivo: nada sale, y lo dice junto al campo.
    await dialog.getByRole('button', { name: 'Cancelar plan de pagos' }).click();
    await expect(dialog.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeVisible();
    await expect(dialog.getByLabel('Motivo de la cancelación')).toBeFocused();
    const found = await axeInBothThemes(page, dialog);
    expect(found.light, `axe del modal a ${viewport.width} px (claro)`).toEqual([]);
    expect(found.dark, `axe del modal a ${viewport.width} px (oscuro)`).toEqual([]);
    await dialog.getByLabel('Motivo de la cancelación').fill('El paciente pagará el saldo de contado');
    await shot(page, 'dx092-cancel-modal', viewport.width);
    await dialog.getByRole('button', { name: 'Cancelar plan de pagos' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Sin plan de cuotas activo, y el cancelado en el historial.
    await expect(section.getByText('Sin plan de pagos')).toBeVisible({ timeout: 15_000 });
    const history = section.getByRole('button', { name: /Planes de pagos cancelados/ });
    await expect(history).toContainText('1 plan');
    await history.click();
    const entry = section.getByRole('listitem').filter({ hasText: 'Cancelado' });
    await expect(entry).toContainText('por Dra. Cancela Cuotas');
    await expect(entry).toContainText('Motivo: El paciente pagará el saldo de contado');
    await expect(entry).toContainText('2 cuotas mensuales');
    // La fecha, con el formato de la sede (nunca «—»).
    await expect(entry).toContainText(/Cancelado\s*\d/);
    await entry.scrollIntoViewIfNeeded();
    const sectionAxe = await axeInBothThemes(page, section);
    expect(sectionAxe.light, `axe del historial a ${viewport.width} px (claro)`).toEqual([]);
    expect(sectionAxe.dark, `axe del historial a ${viewport.width} px (oscuro)`).toEqual([]);
    await expectNoHorizontalScroll(page);
    await shot(page, 'dx123-cancelled-history', viewport.width);

    // Recargar la ficha (plan sin cuotas activas): sin 404.
    await page.reload();
    await expect(section.getByText('Sin plan de pagos')).toBeVisible({ timeout: 20_000 });
  }
  expect(notFound).toEqual([]);
});
