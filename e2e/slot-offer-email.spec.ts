import { test, expect, type Locator, type Page } from './support/test';
import { confirmCancellation } from './support/cancellation';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, linkFromMail, mailMark } from './support/mail';
import { API_URL, tenantOrigin } from './support/urls';
import { chooseAppointmentStatus } from './support/appointment-status';
import { fillDate } from './support/dates';

/**
 * e2e DX-448: la oferta de hueco por EMAIL de punta a punta, con la caducidad
 * anticipada que elige la clínica.
 *
 * 1. El ADMIN abre Ajustes › Ofertas de hueco (390 y 1440 px): ve los valores
 *    de la instalación («Al empezar el hueco», «20 minutos»), los estados de
 *    carga y de error, y cambia la caducidad a 60 minutos.
 * 2. Recepción (1440 px) cancela la cita de las 10:00 → «Ocupar este hueco» →
 *    elige a Ana → «Enviar oferta con enlace» por correo.
 * 3. El email llega al buzón de la suite (E2E_MAIL_DIR, MAIL_TRANSPORT=file):
 *    sin apellidos, con una caducidad que ya no es la hora del hueco. Ana
 *    abre el enlace del email en el móvil (390 px, sin sesión) y acepta.
 * 4. El panel pasa a «Aceptado por Ana» y la agenda la muestra a las 10:00.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `ofmail-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Olga Titular', email: `olga.om.${suffix}@example.com` };
const dentist = { fullName: 'Lina Correo', email: `lina.om.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.om.${suffix}@example.com` };
const last = `Correo${suffix}`.slice(0, 40);
const ANA_EMAIL = `ana.om.${suffix}@example.com`;

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}
const SLOT_DAY = weekdayFrom(2);

let session: ApiSession;

function column(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

test.describe('Oferta de hueco por email con la caducidad de la clínica (DX-448)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    session = await registerClinicViaApi(request, {
      subdomain,
      clinicName: `Clínica Correo ${suffix}`,
      fullName: admin.fullName,
      email: admin.email,
      password,
    });
    await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
    await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
    const schedule = await request.put(`${API_URL}/locations/schedule`, {
      headers: session.headers,
      data: {
        ranges: [1, 2, 3, 4, 5].flatMap((weekday) => [
          { weekday, startMinute: 540, endMinute: 780 },
          { weekday, startMinute: 900, endMinute: 1140 },
        ]),
      },
    });
    expect(schedule.ok()).toBeTruthy();
    const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
    const members = (await staff.json()) as { userId: string; fullName: string }[];
    const linaId = members.find((m) => m.fullName === dentist.fullName)!.userId;

    const gabi = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Gabi',
      lastName: last,
      docType: 'NATIONAL_ID',
      docNumber: `OFM1${suffix}`.slice(0, 20),
      sex: 'F',
      phone: '4141234567',
    });
    const ana = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Ana',
      lastName: last,
      docType: 'NATIONAL_ID',
      docNumber: `OFM2${suffix}`.slice(0, 20),
      sex: 'F',
      email: ANA_EMAIL,
    });
    await apiPost(request, session, '/appointments', {
      patientId: gabi.id,
      providerId: linaId,
      start: atSede(SLOT_DAY, '10:00').toISOString(),
      end: atSede(SLOT_DAY, '10:30').toISOString(),
    });
    await apiPost(request, session, '/waitlist', { patientId: ana.id, durationMinutes: 30 });
  });

  test('ADMIN: carga, error y cambio de la caducidad en Ajustes › Ofertas de hueco (390 y 1440)', async ({ page }) => {
    await loginAs(page, origin, admin.email, password);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      // Error al cargar: error de sección con «Reintentar», que vuelve a pedirlo.
      let fail = true;
      await page.route('**/slot-offer-settings', async (route) => {
        if (route.request().method() === 'GET' && fail) {
          await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' });
          return;
        }
        await route.continue();
      });
      await page.goto(`${origin}/settings/ofertas-de-hueco`);
      await expect(page.getByRole('heading', { level: 1, name: 'Ofertas de hueco' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('No pudimos cargar los ajustes de las ofertas de hueco.')).toBeVisible();
      await expectNoHorizontalScroll(page);
      fail = false;
      await page.getByRole('button', { name: /Reintentar/ }).click();
      await expect(page.getByTestId('slot-offer-expiryLeadMinutes')).toBeVisible();
      await page.unroute('**/slot-offer-settings');

      // Cargando: el esqueleto mientras la respuesta tarda.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/slot-offer-settings', async (route) => {
        if (route.request().method() === 'GET') await held;
        await route.continue();
      });
      await page.reload();
      await expect(page.getByRole('status', { name: 'Cargando' }).first()).toBeVisible({ timeout: 15_000 });
      await expectNoHorizontalScroll(page);
      release();
      await expect(page.getByTestId('slot-offer-minLeadMinutes')).toHaveText('20 minutos');
      await page.unroute('**/slot-offer-settings');
      await expectNoHorizontalScroll(page);
    }

    await expect(page.getByTestId('slot-offer-expiryLeadMinutes')).toHaveText('Al empezar el hueco');
    await page.getByRole('button', { name: 'Cambiar la caducidad del enlace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar la caducidad del enlace' });
    // Fuera de rango: el error en el campo, sin llamar a la API.
    await dialog.getByLabel('Minutos').fill('241');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(
      dialog.getByText('La caducidad anticipada de la oferta tiene que ser un número entero de minutos entre 0 y 240.'),
    ).toBeVisible();
    await dialog.getByLabel('Minutos').fill('60');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('slot-offer-expiryLeadMinutes')).toHaveText('60 minutos antes del hueco');
    await expect(page.getByText('Caducidad guardada: 60 minutos antes del hueco.')).toBeVisible();
  });

  test('recepción ofrece por email → la paciente abre el enlace del email y acepta → agenda al día', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, reception.email, password);
    await page.goto(`${origin}/agenda`);
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    await fillDate(page, 'Fecha', SLOT_DAY);
    await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 15_000 });

    await column(page, dentist.fullName)
      .getByRole('button', { name: new RegExp(`10:00–10:30 · Gabi ${last}.*Detalle de la cita`) })
      .click();
    const detail = page.getByRole('dialog').filter({ hasText: 'Estado' });
    await chooseAppointmentStatus(detail.getByRole('combobox', { name: /^Estado: / }), 'Cancelada');
    await confirmCancellation(page, 'El paciente avisa', 'ILLNESS');
    await detail.getByRole('button', { name: 'Ocupar este hueco', exact: true }).click();

    const panel = page.getByTestId('fill-opening-panel');
    await expect(panel.getByTestId('opening-candidate')).toHaveCount(1, { timeout: 10_000 });
    await panel.getByRole('checkbox', { name: `Elegir a Ana ${last} para la oferta con enlace` }).check();
    await panel.getByRole('button', { name: 'Enviar oferta con enlace' }).click();

    const dialog = page.getByRole('dialog', { name: 'Enviar oferta con enlace' });
    await dialog.getByRole('radio', { name: /Correo electrónico/ }).check();
    const sentSince = mailMark();
    await dialog.getByRole('button', { name: 'Enviar oferta' }).click();
    await expect(dialog.getByText('Correo en camino')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Listo' }).click();
    await expect(panel.getByTestId('slot-link-offers')).toHaveText('Oferta enviada (1)', { timeout: 10_000 });

    // --- El email: el enlace, sin apellidos ni nada clínico, y la caducidad
    // de la clínica (60 min antes: ya no es la hora del hueco) ---
    const link = await linkFromMail(ANA_EMAIL, /(https?:\/\/\S+\/hueco\/[A-Za-z0-9_-]{43})/, { since: sentSince });
    const slotLabel = await linkFromMail(ANA_EMAIL, /Se liberó un hueco el (.+?) en /, { since: sentSince });
    const expiresLabel = await linkFromMail(ANA_EMAIL, /La oferta caduca el (.+?) y el enlace/, { since: sentSince });
    expect(expiresLabel).not.toBe(slotLabel);
    const body = await linkFromMail(ANA_EMAIL, /^([\s\S]*\/hueco\/[\s\S]*)$/, { since: sentSince });
    expect(body).toContain('Ana');
    expect(body).not.toContain(last);
    expect(new URL(link).origin).toBe(origin);

    // --- Ana, en su móvil y sin sesión, abre el enlace del email y acepta ---
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phone = await mobile.newPage();
    try {
      await phone.goto(link);
      await expect(phone.getByText(/Hola Ana,/)).toBeVisible({ timeout: 15_000 });
      await expect(phone.getByText(last)).toHaveCount(0);
      await expectNoHorizontalScroll(phone);
      await phone.getByRole('button', { name: 'Aceptar el hueco' }).click();
      await expect(phone.getByRole('heading', { name: 'Listo: el hueco es tuyo' })).toBeVisible();
      await expectNoHorizontalScroll(phone);
    } finally {
      await mobile.close();
    }

    // --- Recepción lo ve sin recargar (sondeo) y la agenda se pone al día ---
    await expect(panel.getByTestId('slot-link-offers')).toHaveText(`Aceptado por Ana ${last}`, {
      timeout: 30_000,
    });
    await page.keyboard.press('Escape');
    await expect(
      column(page, dentist.fullName).getByRole('button', {
        name: new RegExp(`10:00–10:30 · Ana ${last}.*Detalle de la cita`),
      }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
