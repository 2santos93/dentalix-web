import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeWeekdayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import { API_URL, tenantOrigin } from './support/urls';

// DX-358: al elegir un festivo de la sede, la cita avisa pero se puede agendar.
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `festivo-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.festivo.${suffix}@example.com` };
const holiday = sedeWeekdayFromToday(5);
const normalDay = sedeWeekdayFromToday(12);
let session: ApiSession;

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Festivo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  const [{ id }] = (await locations.json()) as { id: string }[];
  await apiPost(request, session, `/locations/${id}/holidays`, {
    date: holiday,
    name: 'Fiesta de la Sede',
    recurring: false,
  });
});

test('«Nueva cita» avisa del festivo sin bloquear y el aviso se va con otro día', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('main').getByRole('button', { name: 'Nueva cita' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await fillDate(dialog, 'Fecha', holiday);
  await expect(dialog.getByTestId('holiday-notice')).toContainText('Fiesta de la Sede', { timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: /agendar/i })).toBeEnabled();
  await fillDate(dialog, 'Fecha', normalDay);
  await expect(dialog.getByTestId('holiday-notice')).toHaveCount(0);
});
