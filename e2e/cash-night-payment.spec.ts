import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { atSede, sedeDayFromToday } from './support/clock';

/**
 * e2e (DX-097): un abono cobrado a las 20:00 en Bogotá sale en la caja de
 * «Hoy» de la sede.
 *
 * Las 20:00 de Bogotá son la 01:00 UTC del día SIGUIENTE. Antes la API cortaba
 * los días a medianoche UTC y la web pedía el día del navegador: con el
 * navegador en Bogotá, la caja de «hoy» no lo listaba. Ahora la API corta cada
 * día a medianoche de la zona de la sede (la de su horario) y la web toma
 * «hoy» de la sede, no del navegador.
 *
 * El día D es AYER en la sede (así el abono y el reloj del navegador, fijado a
 * las 22:30 de D, quedan en el pasado y no dependen de la hora de la corrida).
 * La clínica, el paciente, el plan y el abono se siembran por la API.
 * Escritorio (1440) y móvil (390), y una corrida con el navegador en UTC para
 * comprobar que «Hoy» sale de la sede y no del navegador.
 */
const PASSWORD = 'Password123!';

interface Seeded {
  origin: string;
  email: string;
  patientName: string;
  day: string;
}

async function seedNightPayment(page: Page, tag: string): Promise<Seeded> {
  const suffix = `${randomUUID().slice(0, 6)}${tag}`;
  const clinic = {
    subdomain: `noche-${suffix}`,
    clinicName: `Clínica Noche ${suffix}`,
    fullName: 'Dueña Noche',
    email: `noche.${suffix}@example.com`,
    password: PASSWORD,
  };
  const admin: ApiSession = await registerClinicViaApi(page.request, clinic);
  const lastName = `Nocturno${suffix}`;
  const patient = await apiPost<{ id: string }>(page.request, admin, '/patients', {
    firstName: 'Abono',
    lastName,
    docType: 'CC',
    docNumber: `DX97${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(page.request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  const day = sedeDayFromToday(-1);
  const paidAt = atSede(day, '20:00');
  const saved = await apiPost<{ paidAt: string }>(page.request, admin, `/treatment-plans/${plan.id}/payments`, {
    amount: 97_000,
    currency: 'COP',
    paidAt: paidAt.toISOString(),
    method: 'CASH',
  });
  // En UTC ya es el día siguiente: es justo el caso que se prueba.
  expect(saved.paidAt.slice(0, 10)).not.toBe(day);
  return { origin: admin.origin, email: clinic.email, patientName: `Abono ${lastName}`, day };
}

/** `YYYY-MM-DD` → `dd/mm/yyyy`, como lo pinta la app. */
function shown(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

async function expectNightPaymentToday(page: Page, seeded: Seeded): Promise<void> {
  // El reloj del navegador: las 22:30 del día D en la sede.
  await page.clock.setFixedTime(atSede(seeded.day, '22:30'));
  await loginAs(page, seeded.origin, seeded.email, PASSWORD);
  await page.goto(`${seeded.origin}/caja`);

  await expect(page.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cash-period-note')).toHaveText(
    `${shown(seeded.day)} · días en hora de la sede (America/Bogota)`,
    { timeout: 15_000 },
  );
  const table = page.getByRole('table', { name: 'Abonos del período' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  const row = table.getByRole('row').filter({ hasText: seeded.patientName });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(shown(seeded.day));
  await expect(row).toContainText('97.000');

  // Sin scroll horizontal de la página (390 px incluido).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`un abono a las 20:00 de Bogotá sale en la caja de «Hoy» de la sede (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const seeded = await seedNightPayment(page, String(viewport.width));
    await expectNightPaymentToday(page, seeded);
  });
}

test('con el navegador en UTC, «Hoy» sigue siendo el día de la sede', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'es-CO', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    const seeded = await seedNightPayment(page, 'utc');
    await expectNightPaymentToday(page, seeded);
  } finally {
    await context.close();
  }
});
