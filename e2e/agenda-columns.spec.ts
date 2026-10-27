import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-121: agenda del día en columnas por profesional, tipos de cita con
 * duración y color, y reagendar con «Mover a…» (teclado) y arrastrando.
 *
 * Una clínica nueva por corrida (sufijo único) con dos profesionales: la
 * dueña (ADMIN, «Ana Titular») y un odontólogo («Luis Segundo»), dos
 * pacientes y la sede SIN restricción de horario. Los tests van en serie y
 * comparten la cita de endodoncia que crea el primero.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `agenda-col-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.${suffix}@example.com` };
const dentist = { fullName: 'Luis Segundo', email: `luis.${suffix}@example.com` };
const patientDoc = `COL${suffix}`.slice(0, 20);
const otherDoc = `COLB${suffix}`.slice(0, 20);
const day = sedeDayFromToday(2);
const typeName = `Endodoncia ${suffix.slice(0, 6)}`;

let session: ApiSession;
let dentistId = '';
let otherPatientId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Columnas ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  await apiPost(request, session, '/patients', {
    firstName: 'Camila',
    lastName: `Columnas${suffix}`.slice(0, 40),
    docType: 'CC',
    docNumber: patientDoc,
    sex: 'F',
  });
  const other = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName: `Ocupado${suffix}`.slice(0, 40),
    docType: 'CC',
    docNumber: otherDoc,
    sex: 'M',
  });
  otherPatientId = other.id;
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  dentistId = members.find((m) => m.fullName === dentist.fullName)!.userId;
  // Ocupa a Luis a las 11:00–11:30: el hueco contra el que chocan los
  // movimientos (409).
  await apiPost(request, session, '/appointments', {
    patientId: otherPatientId,
    providerId: dentistId,
    start: atSede(day, '11:00').toISOString(),
    end: atSede(day, '11:30').toISOString(),
  });
});

/**
 * Columna de un profesional. Por atributo y no por rol: con un modal abierto,
 * Radix marca el resto de la página `aria-hidden` y el rol deja de verse.
 */
function column(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

function endoCard(page: Page): Locator {
  return page.getByTestId('day-column-appointment').filter({ hasText: typeName });
}

async function openDay(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(day);
  await expect(page.getByTestId('day-column')).toHaveCount(2, { timeout: 15_000 });
}

test('ADMIN crea el tipo «Endodoncia 90 min» y una cita con ese tipo: la hora de fin sale sola y la tarjeta lleva su color', async ({
  page,
}) => {
  await loginAs(page, origin, admin.email, password);

  // --- /settings/tipos-de-cita ---
  await page.goto(`${origin}/settings/tipos-de-cita`);
  await page.getByRole('button', { name: 'Nuevo tipo' }).click();
  const typeDialog = page.getByRole('dialog');
  await typeDialog.getByLabel('Nombre').fill(typeName);
  await typeDialog.getByLabel('Duración (minutos)').fill('90');
  await typeDialog.getByLabel('Código del color').fill('#7C3AED');
  await typeDialog.getByRole('button', { name: 'Crear tipo' }).click();
  await expect(typeDialog).toBeHidden();
  await expect(page.getByRole('table', { name: 'Tipos de cita' })).toContainText(typeName);

  // --- Agenda, Día en columnas: una por profesional, vacías ---
  await openDay(page);
  await expect(column(page, admin.fullName).getByText('Sin citas hoy')).toBeVisible();

  // «Nueva cita» de la columna de Ana: el profesional ya viene elegido.
  await column(page, admin.fullName).getByRole('button', { name: `Nueva cita con ${admin.fullName}` }).click();
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await form.getByLabel('Paciente', { exact: true }).fill(patientDoc);
  await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
  await expect(form.getByLabel('Profesional', { exact: true })).toHaveValue(/.+/);
  await form.getByLabel('Hora de inicio').fill('09:00');
  await form.getByLabel(/Tipo de cita/).selectOption({ label: `${typeName} · 90 min` });
  await expect(form.getByLabel('Hora de fin')).toHaveValue('10:30');
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(form).toBeHidden({ timeout: 10_000 });

  const card = column(page, admin.fullName).getByTestId('day-column-appointment');
  await expect(card).toContainText('09:00–10:30');
  await expect(card).toContainText(typeName);
  // Fondo del tipo y texto claro (AA sobre violeta).
  await expect(card).toHaveCSS('background-color', 'rgb(124, 58, 237)');
  await expect(card).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('«Mover a…» con teclado: a otro profesional; si choca, 409 en el modal y la cita no cambia', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  await openDay(page);

  // Solo teclado: foco en «Mover a…» de la tarjeta y Enter.
  await endoCard(page).getByRole('button', { name: /^Mover a… la cita de/ }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Mover a…' })).toBeVisible();
  await dialog.getByLabel('Profesional').focus();
  await dialog.getByLabel('Profesional').selectOption({ label: dentist.fullName });
  // Primero contra el hueco ocupado de Luis (11:00): rechazo por solape.
  await dialog.getByLabel('Hora de inicio').fill('11:00');
  await page.keyboard.press('Enter');
  await expect(dialog.getByText('El profesional ya tiene una cita en ese horario')).toBeVisible({
    timeout: 10_000,
  });
  await expect(column(page, admin.fullName).getByTestId('day-column-appointment')).toHaveCount(1);

  // Luego a un hueco libre (09:00, misma hora): se mueve a la columna de Luis.
  await dialog.getByLabel('Hora de inicio').fill('09:00');
  await dialog.getByLabel('Hora de inicio').press('Enter');
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(column(page, dentist.fullName).getByTestId('day-column-appointment')).toHaveCount(2);
  await expect(column(page, admin.fullName).getByText('Sin citas hoy')).toBeVisible();
});

test('arrastrar con el ratón entre columnas reagenda; soltar sobre otra cita la devuelve a su sitio con el error', async ({
  page,
}) => {
  await loginAs(page, origin, admin.email, password);
  await openDay(page);

  const card = endoCard(page);
  await card.scrollIntoViewIfNeeded();
  const from = (await card.boundingBox())!;
  const anaColumn = (await column(page, admin.fullName).boundingBox())!;

  // Agarra la tarjeta cerca de su borde superior y suéltala en la columna de
  // Ana, 30 min más abajo (1,6 px por minuto).
  const grabY = from.y + 6;
  await page.mouse.move(from.x + from.width / 2, grabY);
  await page.mouse.down();
  await page.mouse.move(anaColumn.x + anaColumn.width / 2, grabY + 20, { steps: 5 });
  await page.mouse.move(anaColumn.x + anaColumn.width / 2, grabY + 48, { steps: 5 });
  await expect(page.getByTestId('drag-preview')).toContainText(`Mover a las 09:30 · ${admin.fullName}`);
  await page.mouse.up();

  const moved = column(page, admin.fullName).getByTestId('day-column-appointment');
  await expect(moved).toContainText('09:30–11:00', { timeout: 10_000 });
  // El PATCH y el refresco terminaron (la tarjeta deja de estar ocupada).
  await expect(moved).not.toHaveAttribute('aria-busy', 'true', { timeout: 10_000 });

  // Ahora sobre la cita de Luis de las 11:00: el servidor responde 409, la
  // tarjeta vuelve a la columna de Ana y sale el aviso.
  const again = (await moved.boundingBox())!;
  const luisColumn = (await column(page, dentist.fullName).boundingBox())!;
  const top = again.y + 6;
  await page.mouse.move(again.x + again.width / 2, top);
  await page.mouse.down();
  await page.mouse.move(luisColumn.x + luisColumn.width / 2, top + 20, { steps: 5 });
  // 09:30 -> 11:00 son 90 min: 144 px más abajo.
  await page.mouse.move(luisColumn.x + luisColumn.width / 2, top + 144, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByText('El profesional ya tiene una cita en ese horario')).toBeVisible({
    timeout: 10_000,
  });
  await expect(column(page, admin.fullName).getByTestId('day-column-appointment')).toContainText(
    '09:30–11:00',
  );
});

test('móvil (390 px): una sola columna con selector deslizable, «Mover a…» y tipos de cita sin salirse de la pantalla', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(day);

  const picker = page.getByRole('group', { name: 'Profesional visible' });
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('day-column').filter({ visible: true })).toHaveCount(1);
  await picker.getByRole('button', { name: dentist.fullName }).click();
  await expect(column(page, dentist.fullName)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // «Mover a…» desde la tarjeta de Luis (11:00): el modal cabe en 390 px.
  await column(page, dentist.fullName)
    .getByRole('button', { name: /^Mover a… la cita de/ })
    .first()
    .click();
  const moveDialog = page.getByRole('dialog');
  await expect(moveDialog.getByRole('heading', { name: 'Mover a…' })).toBeVisible();
  await expectDialogInsideViewport(page, moveDialog);
  await expectNoHorizontalScroll(page);
  await moveDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(moveDialog).toBeHidden();

  // /settings/tipos-de-cita: en móvil, tarjetas en vez de tabla; y el modal «Nuevo tipo».
  await page.goto(`${origin}/settings/tipos-de-cita`);
  await expect(page.getByText(typeName).filter({ visible: true })).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Nuevo tipo' }).click();
  const typeDialog = page.getByRole('dialog');
  await expect(typeDialog.getByLabel('Nombre')).toBeVisible();
  await expectDialogInsideViewport(page, typeDialog);
  await expectNoHorizontalScroll(page);
});
