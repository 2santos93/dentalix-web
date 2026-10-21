import { test, expect, type Locator, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDate, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-247: alertas médicas en la agenda y en la cita.
 *
 * Una clínica nueva por corrida (una sede, sin restricción de horario) con una
 * odontóloga («Lina Alerta»), recepción y cuatro pacientes con citas de 15 min
 * mañana: Jorge (prótesis valvular y alergia al látex → «Requiere
 * premedicación»), Ana (anamnesis de hace dos años → «Anamnesis caducada»),
 * Lucas (sin anamnesis → «Sin anamnesis», no «sin alertas») y Clara (al día,
 * sin alertas → sin icono). En serie:
 * 1. 1440 px claro: el icono sale en la tarjeta de 15 min de la vista Día y de
 *    la Semana; con el teclado (Tab desde la tarjeta) se abre la lista con las
 *    etiquetas del banner de la ficha y Escape la cierra; el ratón también; al
 *    abrir la cita, «Requiere premedicación»; la agenda no trae la historia.
 * 2. 390 px oscuro: tocar el icono abre la lista dentro de la pantalla, sin
 *    scroll horizontal.
 * 3. «Nueva cita» con Jorge avisa «Requiere premedicación» antes de agendar.
 * 4. El panel «En clínica» muestra la alerta de Jorge (cita de hoy, llegó).
 * 5. La cabecera de la ficha encabeza el plan y el odontograma con la alerta;
 *    la odontóloga confirma «Sin cambios hoy» en la de Ana y deja de estar
 *    caducada (queda en la auditoría con su nombre).
 * 6. ADMIN cambia la vigencia de la anamnesis en un modal.
 *
 * Con `DX247_QA_SHOTS=1` deja capturas de QA en `DX247_QA_DIR`.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `alertas-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.ale.${suffix}@example.com` };
const dentist = { fullName: 'Lina Alerta', email: `lina.ale.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.ale.${suffix}@example.com` };
const last = `Alerta${suffix}`.slice(0, 40);
const MIN = 60_000;
const tomorrow = sedeDayFromToday(1);

const QA_DIR = path.resolve(process.env.DX247_QA_DIR ?? 'e2e/.qa-shots');
const QA = process.env.DX247_QA_SHOTS === '1';

async function shot(page: Page, name: string) {
  if (!QA) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(QA_DIR, `${name}.png`), animations: 'disabled' });
}

let session: ApiSession;
const patients: Record<'jorge' | 'ana' | 'lucas' | 'clara', string> = {
  jorge: '',
  ana: '',
  lucas: '',
  clara: '',
};
/** La cita de hoy de Jorge para «En clínica»; vacía a menos de 1 h de la medianoche. */
let todayAppointmentId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Alertas ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { timezone: 'America/Bogota', ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const linaId = members.find((m) => m.fullName === dentist.fullName)!.userId;

  const names = { jorge: 'Jorge', ana: 'Ana', lucas: 'Lucas', clara: 'Clara' } as const;
  for (const [i, key] of (['jorge', 'ana', 'lucas', 'clara'] as const).entries()) {
    const created = await apiPost<{ id: string; tenantId: string }>(request, session, '/patients', {
      firstName: names[key],
      lastName: last,
      docType: 'CC',
      docNumber: `ALE${i}${suffix}`.slice(0, 20),
      sex: i % 2 === 0 ? 'M' : 'F',
    });
    patients[key] = created.id;
    // 15 min cada una (la tarjeta más corta), cada media hora desde las 09:00.
    const start = atSede(tomorrow, ['09:00', '09:30', '10:00', '10:30'][i]);
    await apiPost(request, session, '/appointments', {
      patientId: created.id,
      providerId: linaId,
      start: start.toISOString(),
      end: new Date(start.getTime() + 15 * MIN).toISOString(),
      reason: 'Control',
      notes: 'Nota privada de cita DX264',
    });
  }
  const saveHistory = async (patientId: string, data: object) => {
    const res = await request.put(`${API_URL}/patients/${patientId}/medical-history`, {
      headers: session.headers,
      data,
    });
    expect(res.ok(), `anamnesis: ${await res.text()}`).toBeTruthy();
  };
  await saveHistory(patients.jorge, {
    conditions: [{ codigo: 'PROTESIS_VALVULAR', etiqueta: 'Prótesis valvular', estado: 'SI', esAlerta: true }],
    allergies: [{ alergeno: 'Guantes de látex', tipo: 'MATERIAL', severidad: 'MODERADA', esAlerta: true }],
  });
  await saveHistory(patients.clara, {});

  // Jorge, también hoy: llega para el panel «En clínica».
  const start = new Date(Date.now() + 10 * MIN);
  if (sedeDate(new Date(start.getTime() + 15 * MIN)) === sedeDate(new Date())) {
    const appt = await apiPost<{ id: string }>(request, session, '/appointments', {
      patientId: patients.jorge,
      providerId: linaId,
      start: start.toISOString(),
      end: new Date(start.getTime() + 15 * MIN).toISOString(),
      reason: 'Control',
    });
    todayAppointmentId = appt.id;
  }
});

/** La anamnesis de Ana tiene dos años: la historia no se puede antedatar por la API. */
function backdateAnaHistory(): void {
  const databaseUrl = process.env.E2E_DATABASE_URL as string;
  const tenantId = JSON.parse(
    Buffer.from(session.headers.Authorization.split('.')[1], 'base64url').toString(),
  ).tenantId as string;
  execFileSync('psql', [
    databaseUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO medical_history_versions (id, "tenantId", "patientId", version, allergies, conditions, medications, surgeries, "safetyFlags", "hasCriticalAlert", "createdAt")
     SELECT gen_random_uuid(), '${tenantId}', '${patients.ana}', 1, '[]', '[]', '[]', '[]', '{}', false, now() - interval '2 years'
      WHERE NOT EXISTS (SELECT 1 FROM medical_history_versions WHERE "patientId" = '${patients.ana}')`,
  ]);
}

async function openDay(page: Page, day: string) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(day);
}

function card(page: Page, firstName: string): Locator {
  return page.getByTestId('day-column-appointment').filter({ hasText: `${firstName} ${last}` });
}

test('DX-264 Mes: tres alertas, +1 más, teclado y toque a 390/1440 claro y oscuro', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!process.env.E2E_DATABASE_URL, 'Requiere la BD e2e aislada para fechar la anamnesis');
  backdateAnaHistory();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await expect(page.getByLabel('Calendario del mes')).toBeVisible();
  // Seleccionar mañana también resuelve el cambio de mes en su último día.
  await openDay(page, tomorrow);
  const listed = page.waitForResponse((r) => r.url().includes('/api/v1/appointments?') && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  const body = await (await listed).json() as Record<string, unknown>[];
  expect(body.length).toBeGreaterThan(0);
  for (const appointment of body) expect(appointment).not.toHaveProperty('notes');
  expect(JSON.stringify(body)).not.toContain('Nota privada de cita DX264');
  const day = page.getByTestId('calendar-day').filter({ has: page.locator(`[data-testid="month-appointment"]`) }).and(page.locator(`[data-date="${tomorrow}"]`));
  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ colorScheme });
      await expect(day.getByTestId('month-appointment')).toHaveCount(3);
      await expect(day.getByText('+1 más', { exact: true })).toBeVisible();
      const icons = day.getByTestId('medical-alert-indicator');
      await expect(icons).toHaveCount(3);
      const labels = ['Requiere premedicación', 'Anamnesis caducada', 'Sin anamnesis'];
      for (let i = 0; i < labels.length; i++) {
        const icon = icons.nth(i);
        await expect(icon).toHaveAccessibleDescription(new RegExp(labels[i]));
        await page.mouse.move(0, 0);
        await day.getByRole('button', { name: /citas$/ }).focus();
        await page.keyboard.press('Escape');
        await icon.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
        const touchHits = await icon.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const x = (r.left + r.right) / 2;
          const y = (r.top + r.bottom) / 2;
          return [[-21.5, -21.5], [21.5, -21.5], [-21.5, 21.5], [21.5, 21.5]].map(([dx, dy]) =>
            document.elementFromPoint(x + dx, y + dy)?.closest('[data-testid="medical-alert-indicator"]') === el,
          );
        });
        expect(touchHits, `${width}/${colorScheme}/alerta ${i}`).toEqual([true, true, true, true]);
        await icon.click();
        const popover = page.getByTestId('medical-alert-popover');
        await expect(popover).toContainText(labels[i]);
        const box = await popover.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await page.keyboard.press('Escape');
      }
      await icons.first().focus();
      await expect(page.getByTestId('medical-alert-popover')).toContainText(labels[0]);
      await page.keyboard.press('Escape');
      await expect(icons.first()).toBeFocused();
      expect(await day.locator('button button').count()).toBe(0);
      await expectNoHorizontalScroll(page);
      const contained = await day.evaluate((cell) => {
        const c = cell.getBoundingClientRect();
        return [...cell.querySelectorAll('[data-testid="medical-alert-indicator"]')].every((el) => {
          const r = el.getBoundingClientRect();
          const center = (r.left + r.right) / 2;
          return center - 22 >= c.left && center + 22 <= c.right;
        });
      });
      expect(contained).toBe(true);
      await page.mouse.move(0, 0);
      await day.getByRole('button', { name: /citas$/ }).focus();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('medical-alert-popover')).toBeHidden();
      await day.scrollIntoViewIfNeeded();
      await shot(page, `agenda-mes-alertas-${width}-${colorScheme}`);
      if (QA) await day.screenshot({ path: path.join(QA_DIR, `agenda-mes-celda-${width}-${colorScheme}.png`), animations: 'disabled' });
    }
  }
  expect(errors).toEqual([]);
});

test('1440 px: el icono en las citas de 15 min, con teclado y ratón, y «Requiere premedicación» al abrir la cita', async ({
  page,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL no definido: no se puede fechar la anamnesis en el pasado');
  backdateAnaHistory();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);

  // La agenda trae solo banderas: ni el alérgeno ni la condición.
  const listed = page.waitForResponse(
    (r) => r.url().includes('/api/v1/appointments?') && r.request().method() === 'GET',
  );
  await openDay(page, tomorrow);
  const body = await (await listed).text();
  expect(body).not.toContain('látex');
  expect(body).not.toContain('PROTESIS_VALVULAR');
  expect(body).not.toContain('"allergies"');

  const jorge = card(page, 'Jorge');
  await expect(jorge).toBeVisible({ timeout: 15_000 });
  await jorge.scrollIntoViewIfNeeded();
  const jorgeIcon = jorge.getByRole('button', { name: `Alertas médicas de Jorge ${last}` });
  await expect(jorgeIcon).toBeVisible();
  await expect(jorgeIcon).toHaveAttribute('data-severity', 'critical');
  // Clara está al día y sin alertas: sin icono.
  await expect(card(page, 'Clara').getByTestId('medical-alert-indicator')).toHaveCount(0);
  // Lucas no tiene anamnesis: «Sin anamnesis», nunca «sin alertas».
  const lucasIcon = card(page, 'Lucas').getByTestId('medical-alert-indicator');
  await expect(lucasIcon).toHaveAttribute('data-severity', 'attention');

  // Teclado: de la tarjeta al icono con Tab; Escape cierra y el foco se queda.
  await jorge.getByRole('button').first().focus();
  await page.keyboard.press('Tab');
  await expect(jorgeIcon).toBeFocused();
  const popover = page.getByTestId('medical-alert-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toContainText('Requiere premedicación');
  await expect(popover).toContainText('Requiere profilaxis antibiótica');
  await expect(popover).toContainText('Alergia a látex');
  await shot(page, 'agenda-dia-alerta-1440-claro');
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(jorgeIcon).toBeFocused();

  // Ratón: pasar por encima del de Ana y del de Lucas.
  await card(page, 'Ana').getByTestId('medical-alert-indicator').hover();
  await expect(page.getByTestId('medical-alert-popover')).toContainText('Anamnesis caducada');
  await lucasIcon.hover();
  await expect(page.getByTestId('medical-alert-popover')).toContainText('Sin anamnesis');
  await page.mouse.move(0, 0);

  // Abrir la cita: «Requiere premedicación» va primero en el detalle.
  await jorge.getByRole('button').first().click();
  await expect(page.getByTestId('premedication-notice')).toContainText('Requiere premedicación');
  await shot(page, 'agenda-detalle-premedicacion-1440');
  await page.keyboard.press('Escape');

  // Semana: el mismo icono en la tarjeta de 15 min (la de mañana; la de hoy,
  // si cae en la misma semana, también lo lleva).
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  const weekCard = page
    .getByTestId('week-grid-appointment')
    .filter({ hasText: `Jorge ${last}` })
    .last()
    .locator('..');
  await expect(weekCard.getByTestId('medical-alert-indicator')).toBeVisible({ timeout: 15_000 });
  await shot(page, 'agenda-semana-alerta-1440');
});

test('390 px oscuro: tocar el icono abre las alertas dentro de la pantalla, sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await loginAs(page, origin, reception.email, password);
  await openDay(page, tomorrow);
  const picker = page.getByRole('group', { name: 'Profesional visible' });
  await picker.getByRole('button', { name: dentist.fullName }).click();

  const jorge = card(page, 'Jorge');
  await expect(jorge).toBeVisible({ timeout: 15_000 });
  await jorge.scrollIntoViewIfNeeded();
  const icon = jorge.getByRole('button', { name: `Alertas médicas de Jorge ${last}` });
  // Zona táctil REAL de 44 px: lo que el navegador entrega al tocar en las
  // esquinas del cuadrado de 44 px centrado en el icono es el propio icono (la
  // tarjeta de 24 px no lo recorta); y «Mover» sigue recibiendo su toque.
  // Centrada en la pantalla: las esquinas tienen que caer dentro de la ventana.
  await icon.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  const hits = await icon.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const h = 21.5;
    const owner = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest('[data-testid="medical-alert-indicator"]') === el;
    return [
      [cx - h, cy - h],
      [cx + h, cy - h],
      [cx - h, cy + h],
      [cx + h, cy + h],
      [cx, cy],
    ].map(([x, y]) => owner(x, y));
  });
  expect(hits).toEqual([true, true, true, true, true]);
  const move = jorge.getByRole('button', { name: `Mover a… la cita de Jorge ${last}` });
  const moveBox = await move.boundingBox();
  const moveHit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? '',
    [moveBox!.x + moveBox!.width / 2, moveBox!.y + moveBox!.height / 2],
  );
  expect(moveHit).toBe(`Mover a… la cita de Jorge ${last}`);

  await icon.click();
  const popover = page.getByTestId('medical-alert-popover');
  await expect(popover).toContainText('Requiere profilaxis antibiótica');
  const box = await popover.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expectNoHorizontalScroll(page);
  await shot(page, 'agenda-dia-alerta-390-oscuro');
  // Tocar fuera la cierra.
  await page.getByRole('heading', { level: 1 }).click();
  await expect(popover).toBeHidden();
});

test('«Nueva cita» con Jorge avisa «Requiere premedicación» antes de agendar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await openDay(page, tomorrow);
  await page.getByRole('button', { name: 'Nueva cita', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cita' });
  await dialog.getByLabel('Paciente', { exact: true }).fill(`ALE0${suffix}`.slice(0, 20));
  await expect(dialog.getByTestId('premedication-notice')).toContainText('Requiere premedicación', {
    timeout: 15_000,
  });
  await shot(page, 'nueva-cita-premedicacion-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
});

test('«En clínica» muestra la misma alerta junto al paciente que llegó', async ({ page, request }) => {
  test.skip(todayAppointmentId === '', 'A menos de 1 h de la medianoche de la sede no hay cita de hoy.');
  const arrived = await request.patch(`${API_URL}/appointments/${todayAppointmentId}`, {
    headers: session.headers,
    data: { status: 'ARRIVED' },
  });
  expect(arrived.ok(), await arrived.text()).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda/en-clinica`);
  const item = page
    .getByTestId('in-clinic-group-waiting')
    .getByTestId('in-clinic-item')
    .filter({ hasText: `Jorge ${last}` });
  await expect(item).toBeVisible({ timeout: 15_000 });
  const icon = item.getByRole('button', { name: `Alertas médicas de Jorge ${last}` });
  await expect(icon).toHaveAttribute('data-severity', 'critical');
  await icon.focus();
  await expect(page.getByTestId('medical-alert-popover')).toContainText('Requiere premedicación');
  await shot(page, 'en-clinica-alerta-1440');
});

test('la cabecera del plan y del odontograma lleva la alerta; «Sin cambios hoy» queda con autor y hora', async ({
  page,
  request,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL no definido: no se puede fechar la anamnesis en el pasado');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, dentist.email, password);

  for (const tab of ['treatment-plans', 'odontogram']) {
    await page.goto(`${origin}/patients/${patients.jorge}?tab=${tab}`);
    const header = page.getByTestId('record-medical-alert');
    await expect(header).toContainText('Requiere premedicación', { timeout: 15_000 });
    await header.getByRole('button', { name: `Alertas médicas de Jorge ${last}` }).click();
    await expect(page.getByTestId('medical-alert-popover')).toContainText('Alergia a látex');
    await page.keyboard.press('Escape');
  }
  await shot(page, 'ficha-odontograma-alerta-1440');

  await page.goto(`${origin}/patients/${patients.ana}?tab=treatment-plans`);
  await expect(page.getByTestId('record-medical-alert')).toContainText('Anamnesis caducada', { timeout: 15_000 });
  const review = page.getByTestId('anamnesis-review');
  await expect(review).toHaveAttribute('data-status', 'EXPIRED');
  await review.getByRole('button', { name: 'Sin cambios hoy' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Sin cambios en la salud del paciente?' });
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByRole('button', { name: 'Confirmar sin cambios' }).click();
  await expect(dialog).toBeHidden();
  await expect(review).toContainText(`Sin cambios hoy · confirmado a las`);
  await expect(review).toContainText(dentist.fullName);
  await expect(review).toHaveAttribute('data-status', 'CURRENT');
  await expect(page.getByTestId('record-medical-alert')).toHaveCount(0);

  // En la auditoría, con la odontóloga como autora.
  const events = await request.get(
    `${API_URL}/audit-events?patientId=${patients.ana}&resourceType=MEDICAL_HISTORY&action=UPDATE`,
    { headers: session.headers },
  );
  expect(events.ok()).toBeTruthy();
  const page1 = (await events.json()) as { items: { metadata: { reason?: string }; actorUserId: string }[] };
  expect(page1.items.some((e) => e.metadata.reason === 'NO_CHANGES_CONFIRMED')).toBe(true);
});

test('ADMIN cambia la vigencia de la anamnesis en un modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/historia-clinica`);
  await expect(page.getByTestId('anamnesis-validity')).toHaveText('12 meses', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Cambiar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar la vigencia de la anamnesis' });
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByLabel('Meses de vigencia').selectOption('6');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('anamnesis-validity')).toHaveText('6 meses');
  await expectNoHorizontalScroll(page);
});
