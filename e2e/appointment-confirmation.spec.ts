import { test, expect, type Page } from './support/test';
import { fillDate } from './support/dates';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { disableBusinessHours } from './support/business-hours';
import { API_URL } from './support/urls';
import { atSede, sedeDayFromToday } from './support/clock';
import { apiPost, createLocationViaApi, registerClinicViaApi } from './support/api';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e DX-005 — confirmación de cita por enlace firmado, de punta a punta y sin
 * mocks: recepción abre la cita en la agenda, pulsa "Enviar confirmación",
 * obtiene el enlace (y el botón de WhatsApp prellenado); el paciente abre el
 * enlace en un móvil (390px, sin sesión), ve su cita y con un segundo clic la
 * confirma; la agenda de recepción la muestra CONFIRMED sin tocar nada más.
 *
 * El paciente y la cita se crean por la API (no es lo que prueba este spec; el
 * alta por UI ya la cubren patients.spec.ts / agenda.spec.ts). Requiere la API
 * y la web levantadas (ver playwright.config.ts y e2e/support/urls.ts).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Clinica Confirma ${suffix}`;
const subdomain = `test-confirma-${suffix}`;
const fullName = 'Dra. Recepción Prueba';
const email = `confirma.${suffix}@example.com`;
const password = 'Password123!';

async function session(page: Page): Promise<{ accessToken: string; userId: string }> {
  const accessToken = await accessTokenOf(page);
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')) as {
    sub: string;
  };
  return { accessToken, userId: payload.sub };
}

test('recepción genera el enlace -> el paciente confirma desde el móvil -> la agenda muestra CONFIRMED', async ({
  page,
  browser,
}) => {
  const origin = await registerAndLogin(page, { subdomain, clinicName, fullName, email, password });
  await disableBusinessHours(page, origin);
  const { accessToken, userId } = await session(page);
  const api = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };

  // --- Datos: paciente con móvil y una cita mañana a las 10:00 ---
  const patientRes = await page.request.post(`${API_URL}/patients`, {
    headers: api,
    data: {
      firstName: 'Camila',
      lastName: `Confirma${suffix}`,
      docType: 'NATIONAL_ID',
      docNumber: `DOCCONF${suffix}`,
      sex: 'F',
      phone: '+58 414 555 0101',
    },
  });
  expect(patientRes.ok(), await patientRes.text()).toBeTruthy();
  const patientId = ((await patientRes.json()) as { id: string }).id;

  // Mañana a las 10:00 de la SEDE (la zona del navegador), no de Node.
  const day = sedeDayFromToday(1);
  const start = atSede(day, '10:00');
  const end = atSede(day, '10:30');
  const apptRes = await page.request.post(`${API_URL}/appointments`, {
    headers: api,
    data: {
      patientId,
      providerId: userId,
      start: start.toISOString(),
      end: end.toISOString(),
      reason: `Control ${suffix}`,
    },
  });
  expect(apptRes.ok(), await apptRes.text()).toBeTruthy();

  // --- Recepción: agenda -> Día de mañana -> Detalle -> Enviar confirmación ---
  await page.goto(`${origin}/agenda`);
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  // DX-121: el Día abre en columnas; la fila con estado está en «Lista».
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await fillDate(page, 'Fecha', day);

  const row = page.locator('table tr', { hasText: `Camila Confirma${suffix}` });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: /Detalle de la cita de 10:00–10:30/ }).click();

  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Enviar confirmación' }).click();

  const linkInput = sheet.getByLabel('Enlace de confirmación');
  await expect(linkInput).toHaveValue(/\/confirmar\/[A-Za-z0-9_-]{43}$/, { timeout: 10_000 });
  const confirmationUrl = await linkInput.inputValue();
  expect(new URL(confirmationUrl).host).toBe(new URL(origin).host);

  const whatsapp = sheet.getByRole('link', { name: /Abrir WhatsApp/ });
  const href = (await whatsapp.getAttribute('href')) ?? '';
  expect(href.startsWith('https://wa.me/584145550101?text=')).toBe(true);
  const message = decodeURIComponent(href.split('?text=')[1]);
  expect(message).toContain('Hola Camila');
  expect(message).toContain('a las 10:00');
  expect(message).toContain(fullName);
  expect(message).toContain(confirmationUrl);

  await page.keyboard.press('Escape');
  await expect(row.getByText('Confirmación pendiente')).toBeVisible({ timeout: 10_000 });

  // --- Paciente: otro navegador (sin sesión), pantalla de móvil ---
  const patientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const patientPage = await patientContext.newPage();
  await patientPage.goto(confirmationUrl);

  await expect(patientPage.getByRole('heading', { name: clinicName })).toBeVisible({ timeout: 10_000 });
  await expect(patientPage.getByText('Hola Camila,')).toBeVisible();
  await expect(patientPage.getByText('10:00–10:30')).toBeVisible();
  await expect(patientPage.getByText(fullName)).toBeVisible();
  // Nada clínico ni el apellido en la página pública.
  await expect(patientPage.getByText(`Control ${suffix}`)).toHaveCount(0);
  await expect(patientPage.getByText(`Confirma${suffix}`)).toHaveCount(0);
  // Usable a 390px: sin scroll horizontal.
  const overflow = await patientPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Abrir el enlace no confirmó nada: sigue agendada.
  await page.reload();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  // DX-121: el Día abre en columnas; la fila con estado está en «Lista».
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  await expect(row.getByRole('combobox', { name: /Estado de la cita de/ })).toHaveText('Agendada', { timeout: 10_000 });

  // Segundo clic: confirmar.
  await patientPage.getByRole('button', { name: 'Confirmar asistencia' }).click();
  await expect(patientPage.getByText('Confirmaste tu asistencia. ¡Te esperamos!')).toBeVisible();

  // Volver a abrir el enlace: muestra la respuesta, sin botones.
  await patientPage.reload();
  await expect(patientPage.getByRole('heading', { name: 'Ya respondiste' })).toBeVisible({ timeout: 10_000 });
  await expect(patientPage.getByRole('button', { name: 'Confirmar asistencia' })).toHaveCount(0);
  await patientContext.close();

  // --- La agenda refleja la respuesta sin intervención manual ---
  await page.reload();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  // DX-121: el Día abre en columnas; la fila con estado está en «Lista».
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  await expect(row.getByRole('combobox', { name: /Estado de la cita de/ })).toHaveText('Confirmada', { timeout: 10_000 });
  await expect(row.getByText('Confirmación pendiente')).toHaveCount(0);
});

// DX-354: la página pública pinta con la sede de la cita, no con la zona del navegador del paciente.
test('con el navegador del paciente en otra zona, el día y la hora son los de la sede (Tokio, 24 h)', async ({
  browser,
  request,
}) => {
  const tokyoSubdomain = `test-confirma-tk-${suffix}`.slice(0, 40);
  const session = await registerClinicViaApi(request, {
    subdomain: tokyoSubdomain,
    clinicName: `Clinica Tokio ${suffix}`,
    fullName: 'Dra. Tokio',
    email: `confirma.tk.${suffix}@example.com`,
    password,
  });
  const sede = {
    name: 'Sede Tokio',
    country: 'JP',
    currency: 'JPY',
    timeZone: 'Asia/Tokyo',
    locale: 'ja-JP',
    hourCycle: 'h23',
  } as const;
  const sedeId = await createLocationViaApi(request, session, sede);
  const at = { ...session, headers: { ...session.headers, 'X-Location-Id': sedeId } };
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
  }[];
  const patient = await apiPost<{ id: string }>(request, at, '/patients', {
    firstName: 'Hana',
    lastName: `Tokio${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `TK${suffix}`.slice(0, 20),
    sex: 'F',
    phone: '+81 90 1234 5678',
  });
  await request.put(`${API_URL}/locations/schedule`, { headers: at.headers, data: { ranges: [] } });
  const start = new Date(Math.ceil((Date.now() + 2 * 24 * 60 * 60_000) / 300_000) * 300_000);
  const end = new Date(start.getTime() + 30 * 60_000);
  const appt = await apiPost<{ id: string }>(request, at, '/appointments', {
    patientId: patient.id,
    providerId: staff[0].userId,
    start: start.toISOString(),
    end: end.toISOString(),
    reason: `Control ${suffix}`,
  });
  const link = await apiPost<{ url: string }>(request, at, `/appointments/${appt.id}/confirmation-link`, {});

  // El navegador del paciente está en otra zona (Los Ángeles): no cuenta.
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 844 } });
  const patientPage = await context.newPage();
  await patientPage.goto(link.url);
  const fmt = regionalFormat({ locale: sede.locale, hourCycle: sede.hourCycle });
  const norm = (text: string) => text.replace(/\s+/g, ' ');
  await expect(patientPage.getByText('Hola Hana,')).toBeVisible({ timeout: 15_000 });
  const summary = patientPage.locator('dl').first();
  await expect.poll(async () => norm((await summary.textContent()) ?? '')).toContain(norm(fmt.longDate(start, sede.timeZone)));
  await expect
    .poll(async () => norm((await summary.textContent()) ?? ''))
    .toContain(`${fmt.time(start, sede.timeZone)}–${fmt.time(end, sede.timeZone)}`);

  // Sin formato de la sede (respuesta interceptada) y cancelación tardía con cargo: el paciente no
  // puede aceptar el cargo en línea; ni «—» como importe ni «Cancelar cita».
  await patientPage.route(
    (url) => /\/api\/v1\/public\/appointment-confirmations\/[^/]+$/.test(url.pathname),
    async (route) => {
    if (route.request().method() !== 'GET' || !['fetch', 'xhr'].includes(route.request().resourceType())) {
      return route.continue();
    }
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown> & { appointment: Record<string, unknown> };
    await route.fulfill({
      response: res,
      json: {
        ...body,
        isLate: true,
        cancellationPolicy: { policyVersionId: 'pv-e2e', noticeHours: 24, text: '', suggestedFee: 25, currency: 'USD' },
        appointment: { ...body.appointment, timeZone: null, locale: null, hourCycle: null },
      },
    });
    },
  );
  await patientPage.reload();
  await expect(patientPage.getByTestId('public-fee-needs-clinic')).toContainText('llama a la clínica para cancelar', {
    ignoreCase: true,
    timeout: 15_000,
  });
  await expect(patientPage.getByRole('button', { name: 'Cancelar cita' })).toHaveCount(0);
  await expect(patientPage.getByText('Llama a la clínica para confirmar la hora de tu cita.')).toBeVisible();
  await expect(patientPage.getByText(/Cargo por inasistencia/)).toHaveCount(0);
  await context.close();
});
