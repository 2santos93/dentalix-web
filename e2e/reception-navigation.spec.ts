import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiPost, registerClinicViaApi } from './support/api';

/**
 * DX-070 (TST-004): lo que ve RECEPCIÓN.
 *
 * - Menú: Pacientes, Agenda y Caja sí; Catálogo, Inventario, Dashboard y
 *   Personal no (sus endpoints le darían 403: CATALOG_READ_ROLES,
 *   INVENTORY_ROLES, DASHBOARD_ROLES y STAFF_WRITE_ROLES en la API).
 * - Ficha del paciente: Datos, Estado de cuenta y Autorizaciones; ninguna
 *   pestaña clínica (historia, odontograma, periodontograma, plan,
 *   consentimientos, recetas), ni siquiera pidiéndola por la URL.
 *
 * Clínica, recepcionista (invitada y aceptada por la API) y paciente se
 * siembran en el `beforeAll`.
 */
const PASSWORD = 'Password123!';
const RECEPTION_PASSWORD = 'Recepcion2026!';

let origin: string;
let patientId: string;
let receptionEmail: string;

test.beforeAll(async ({ playwright }) => {
  const suffix = randomUUID().slice(0, 8);
  const api = await playwright.request.newContext();
  try {
    const admin = await registerClinicViaApi(api, {
      subdomain: `recep-${suffix}`,
      clinicName: `Clínica Recepción ${suffix}`,
      fullName: 'Dueña Recepción',
      email: `recep.admin.${suffix}@example.com`,
      password: PASSWORD,
    });
    origin = admin.origin;
    receptionEmail = `recep.${suffix}@example.com`;
    await addStaffViaApi(api, admin, {
      fullName: 'Rosa Recepción',
      email: receptionEmail,
      role: 'RECEPTION',
      password: RECEPTION_PASSWORD,
    });
    ({ id: patientId } = await apiPost<{ id: string }>(api, admin, '/patients', {
      firstName: 'Paciente',
      lastName: `Recepción ${suffix}`,
      docType: 'NATIONAL_ID',
      docNumber: `RC${suffix}`,
      sex: 'F',
    }));
  } finally {
    await api.dispose();
  }
});

test('RECEPTION no ve el menú de catálogo ni las pestañas clínicas del paciente', async ({ page }) => {
  await loginAs(page, origin, receptionEmail, RECEPTION_PASSWORD);
  await page.goto(`${origin}/patients`);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });

  // --- Menú ---
  const nav = page.getByRole('navigation').first();
  // Las entradas por rol se pintan cuando el rol ya se conoce: «Caja» (solo
  // ADMIN y RECEPTION) es la señal de que el menú está resuelto.
  await expect(nav.getByRole('link', { name: 'Caja' })).toBeVisible({ timeout: 10_000 });
  await expect(nav.getByRole('link', { name: 'Pacientes' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Agenda' })).toBeVisible();
  for (const hidden of ['Catálogo', 'Inventario', 'Dashboard', 'Personal']) {
    await expect(page.getByRole('link', { name: hidden, exact: true }), hidden).toHaveCount(0);
  }

  // --- Ficha del paciente ---
  await page.goto(`${origin}/patients/${patientId}`);
  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab', { name: 'Datos' })).toBeVisible({ timeout: 15_000 });
  await expect(tabs.getByRole('tab', { name: 'Estado de cuenta' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'Autorizaciones' })).toBeVisible();
  const clinicalTabs = [
    'Historia clínica',
    'Odontograma',
    'Periodontograma',
    'Plan de tratamiento',
    'Consentimientos',
    'Recetas',
  ];
  for (const name of clinicalTabs) {
    await expect(page.getByRole('tab', { name, exact: true }), name).toHaveCount(0);
  }

  // Pedir una pestaña clínica por la URL tampoco la abre: cae en «Datos».
  await page.goto(`${origin}/patients/${patientId}?tab=clinical-history`);
  await expect(page.getByRole('tab', { name: 'Datos' })).toHaveAttribute('aria-selected', 'true', {
    timeout: 15_000,
  });
  for (const name of clinicalTabs) {
    await expect(page.getByRole('tab', { name, exact: true }), name).toHaveCount(0);
  }
});
