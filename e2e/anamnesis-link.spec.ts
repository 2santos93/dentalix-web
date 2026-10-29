import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-099: anamnesis previa a la cita por enlace seguro.
 *
 * Una clínica nueva por corrida (política de datos publicada) con recepción,
 * una odontóloga y una paciente con cita mañana. En serie:
 *   1. Recepción (1440) abre la ficha, pulsa «Enviar anamnesis» y copia el
 *      enlace (con su `wa.me` prellenado).
 *   2. La paciente lo abre sin sesión a 390 px: no-referrer y no-store en la
 *      respuesta, solo su nombre de pila, autorización de datos de salud antes
 *      del cuestionario, validación en español, declara una alergia a la
 *      penicilina y un anticoagulante, y envía. Un segundo intento con el
 *      mismo enlace ve «Este enlace ya no es válido, contacte con su clínica.».
 *   3. La ficha dice «Anamnesis pendiente de revisión»; recepción no puede
 *      aceptarla (sin botón).
 *   4. La odontóloga (1440) ve el contador del menú, abre la revisión con las
 *      diferencias y las alertas, acepta, y la alerta aparece en la ficha.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `anamnesis-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.anam.${suffix}@example.com` };
const dentist = { fullName: 'Lina Revisora', email: `lina.anam.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.anam.${suffix}@example.com` };
const lastName = `Anamnesis${suffix}`.slice(0, 40);
const docNumber = `AN${suffix}`.slice(0, 20);
const POLICY = {
  policyText: 'Política de tratamiento de datos de la clínica (Ley 1581).',
  generalText: 'Autorizo el tratamiento de mis datos personales.',
  sensitiveHealthText:
    'Autorizo el tratamiento de mis datos sensibles de salud (historia clínica). No está obligado a autorizarlo. Finalidad: la atención odontológica.',
  marketingText: 'Autorizo recibir comunicaciones comerciales.',
};

let session: ApiSession;
let patientId = '';
let link = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Anamnesis ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  await apiPost(request, session, '/privacy-policies', POLICY);
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  const dentistId = staff.find((m) => m.fullName === dentist.fullName)!.userId;
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Mariana Isabel',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber,
    sex: 'F',
    phone: '+57 300 123 4567',
  });
  patientId = patient.id;
  const start = atSede(sedeDayFromToday(1), '10:00');
  await apiPost(request, session, '/appointments', {
    patientId,
    providerId: dentistId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });
});

async function answerAll(page: Page, option: 'No') {
  const groups = page.getByRole('radiogroup');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    if ((await group.getByRole('radio', { checked: true }).count()) === 0) {
      await group.getByText(option, { exact: true }).click();
    }
  }
}

test('recepción envía el enlace desde la ficha (1440)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);
  const section = page.getByTestId('patient-anamnesis-section');
  await section.getByRole('button', { name: 'Enviar anamnesis' }).click();
  const input = section.getByLabel('Enlace de anamnesis');
  await expect(input).toHaveValue(/\/anamnesis\/[A-Za-z0-9_-]{43}$/);
  link = await input.inputValue();
  const whatsapp = section.getByRole('link', { name: /Abrir WhatsApp/ });
  const href = await whatsapp.getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
  expect(decodeURIComponent(href!)).not.toContain(lastName);
  await expect(section.getByText('Esperando al paciente')).toBeVisible();
});

test('la paciente responde a 390 px sin sesión, con su autorización, y el enlace no sirve dos veces', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO' });
  const page = await context.newPage();
  const response = await page.goto(link);
  const headers = response!.headers();
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['cache-control']).toContain('no-store');

  await expect(page.getByRole('heading', { level: 1, name: 'Cuestionario de salud' })).toBeVisible();
  await expect(page.getByText('Hola, Mariana.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(lastName);
  await expect(page.locator('body')).not.toContainText(docNumber);

  // Autorización antes del cuestionario.
  await expect(page.getByText(POLICY.sensitiveHealthText)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Para continuar debe autorizar el tratamiento de sus datos de salud.')).toBeVisible();
  await page.getByRole('checkbox', { name: /Autorizo el tratamiento de mis datos de salud/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Validación en español.
  await page.getByRole('button', { name: 'Enviar respuestas' }).click();
  await expect(page.getByText(/Faltan \d+ datos por completar/)).toBeVisible();

  const allergies = page.getByRole('radiogroup', { name: /alergia a algún medicamento/ });
  await allergies.getByText('Sí', { exact: true }).click();
  await page.getByLabel('¿A qué es alérgico?').fill('Penicilina');
  await page.getByLabel('Tipo').selectOption('MEDICAMENTO');
  const anticoagulants = page.getByRole('radiogroup', { name: /adelgazar la sangre/ });
  await anticoagulants.getByText('Sí', { exact: true }).click();
  await page.getByLabel('¿Cuál?').fill('Warfarina');
  await answerAll(page, 'No');
  await page.getByRole('checkbox', { name: /información que he dado es verdadera/ }).check();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Enviar respuestas' }).click();
  await expect(page.getByRole('heading', { name: '¡Gracias! Recibimos sus respuestas' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Ya usado → 410 en la página.
  await page.goto(link);
  await expect(page.getByText('Este enlace ya no es válido, contacte con su clínica.')).toBeVisible();
  await context.close();
});

test('la ficha dice «pendiente de revisión»; recepción no puede aceptarla', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);
  const section = page.getByTestId('patient-anamnesis-section');
  await expect(section.getByText('Anamnesis pendiente de revisión')).toBeVisible();
  await expect(section.getByRole('link', { name: 'Revisar' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Anamnesis por revisar/ })).toHaveCount(0);

  const dentistApi = await apiLogin(request, origin, dentist.email, password);
  const rows = (await (await request.get(`${API_URL}/medical-history/submissions`, { headers: dentistApi.headers })).json()) as {
    id: string;
  }[];
  await page.goto(`${origin}/anamnesis-por-revisar/${rows[0].id}`);
  await expect(page.getByText(/solo las ven odontólogos, asistentes y administradores/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toHaveCount(0);
});

test('la odontóloga revisa a 1440, acepta y la alerta aparece en la ficha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients`);
  const navEntry = page.getByRole('link', { name: 'Anamnesis por revisar · 1' }).first();
  await expect(navEntry).toBeVisible();
  await navEntry.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Anamnesis por revisar' })).toBeVisible();
  await page.getByRole('link', { name: `Revisar la anamnesis de Mariana Isabel ${lastName}` }).click();

  await expect(page.getByRole('heading', { name: `Anamnesis de Mariana Isabel ${lastName}` })).toBeVisible();
  await expect(page.getByText('El paciente no tenía anamnesis: todo aparece como nuevo. Los «Sí» primero.')).toBeVisible();
  const entries = page.getByTestId('anamnesis-diff-entry');
  await expect(entries.first()).toContainText('Penicilina');
  await expect(entries.first()).toContainText('Nuevo');
  const alerts = page.getByTestId('anamnesis-proposed-alerts');
  await expect(alerts).toContainText('Alergia a penicilina');
  await expect(alerts).toContainText('Anticoagulantes');
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
  await expect(page.getByText('Anamnesis aceptada')).toBeVisible();
  await page.getByRole('link', { name: 'Ir a la ficha' }).click();
  await expect(page.getByText('Alergia a penicilina').first()).toBeVisible();
  await expect(page.getByTestId('patient-anamnesis-section').getByText('Aceptada', { exact: true })).toBeVisible();
  await page.goto(`${origin}/anamnesis-por-revisar`);
  await expect(page.getByText('No hay anamnesis por revisar')).toBeVisible();
});
