import { test, expect, type Locator, type Page } from './support/test';
import { fillDate, readDate } from './support/dates';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addStaffViaApi, apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { tenantOrigin } from './support/urls';

/**
 * e2e G1.5 (DX-316): Ajustes › Calendario de la sede.
 *
 * Una clínica nueva por corrida con dos sedes creadas por la API:
 * - A: `en-US` / `America/New_York` / USD / 12 h (fechas MM/DD/YYYY);
 * - B: `de-DE` / `Europe/Berlin` / EUR / 24 h (fechas DD.MM.YYYY).
 *
 *  1. Una sede nueva tiene lunes a viernes y ningún festivo, y la pantalla lo dice.
 *  2. El ADMIN pone domingo a jueves en B y se guarda desde la barra
 *     «Cambios sin guardar» (sin cambios no hay «Guardar»); tras un error de
 *     guardado el foco vuelve a «Guardar días hábiles» y tras guardar bien, a
 *     la primera casilla (en jsdom no se distingue). La semana empieza donde
 *     la empieza el locale de la sede (A en-US: domingo; B de-DE: lunes).
 *  3. Alta, edición y retirada de un festivo, con la fecha en el orden de cada
 *     sede y el día de la semana correcto en un navegador en otra zona que Jest.
 *  4. El mismo ICS dos veces: 12 nuevos y luego 12 ya existían; la lista
 *     muestra «Cada año» con 2 y 2027 con 10, y el resumen `role="status"`
 *     queda tras cerrar el diálogo. Mientras se lee el archivo el foco no cae
 *     en `<body>`.
 *  5. Si entre la revisión y la importación cambian los festivos, el modal
 *     se queda abierto con lo que se importó de verdad.
 *  6. Un DENTIST no ve la entrada y la ruta le enseña el estado bloqueado sin
 *     llamar a la API.
 *  7. A 390 px, sin scroll horizontal con la lista y el modal abiertos.
 *
 * Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR si está definido.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `cal-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.cal.${suffix}@example.com`;
const dentistEmail = `odonto.cal.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;
const ICS = readFileSync(join(__dirname, 'fixtures', 'holidays-12.ics'));

const SEDE_A = { name: 'Sede A', country: 'US', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' } satisfies RegionalSettings & { name: string };
const SEDE_B = { name: 'Sede B', country: 'DE', currency: 'EUR', timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' } satisfies RegionalSettings & { name: string };

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const SEDES = { A: SEDE_A, B: SEDE_B } as const;

/** Los nombres de las casillas, en el orden en que salen. */
async function weekOrderShown(page: Page): Promise<string[]> {
  return page
    .getByRole('group', { name: 'Días hábiles' })
    .getByRole('checkbox')
    .evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).labels?.[0]?.textContent ?? ''));
}

let session: ApiSession;
const ids: Record<'A' | 'B', string> = { A: '', B: '' };

/**
 * La captura `${name}-${width}-${scheme}.png` a 1440 y 390 px, en claro y
 * oscuro; deja la página a 1440. `target` se desplaza a la vista en cada ancho
 * (a 390 px los festivos quedan bajo el pliegue).
 */
async function shoot(page: Page, name: string, target?: Locator): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await target?.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    // Sin el hover del último clic y sin transiciones de color a medias.
    await page.mouse.move(0, 0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png`, fullPage: false });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

/** El calendario de una sede por `?sede=`, ya cargado. */
async function openCalendar(page: Page, sede: 'A' | 'B'): Promise<void> {
  await page.goto(`${origin}/settings/calendario?sede=${ids[sede]}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Calendario de la sede' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('calendar-sede')).toHaveText(`Editando: ${SEDES[sede].name}`);
  await expect(page.getByRole('checkbox', { name: 'Lunes' })).toBeVisible({ timeout: 15_000 });
}

async function expectWeek(page: Page, checked: readonly string[]): Promise<void> {
  for (const day of WEEK) {
    const box = page.getByRole('checkbox', { name: day, exact: true });
    if (checked.includes(day)) await expect(box, day).toBeChecked();
    else await expect(box, day).not.toBeChecked();
  }
}

/** El documento no es más ancho que la pantalla (spec §7.2, 390 px). */
async function expectFitsWidth(page: Page, width: number): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expectNoHorizontalScroll(page);
}

/** Abre «Importar», elige el ICS desde «Elegir archivo» y espera el resumen. */
async function choosePreview(page: Page, opener: 'Importar' = 'Importar') {
  await page.getByRole('button', { name: opener, exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Importar festivos' });
  await expect(dialog).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Elegir archivo' }).click();
  await (await chooser).setFiles({ name: 'festivos.ics', mimeType: 'text/calendar', buffer: ICS });
  return dialog;
}

const holidaysSection = (page: Page) => page.getByRole('region', { name: 'Festivos' });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Calendario ${suffix}`,
    fullName: 'Ana Titular',
    email: adminEmail,
    password,
  });
  ids.A = await createLocationViaApi(request, session, SEDE_A);
  ids.B = await createLocationViaApi(request, session, SEDE_B);
  await addStaffViaApi(request, session, {
    fullName: 'Olga Odontóloga',
    email: dentistEmail,
    role: 'DENTIST',
    password,
  });
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
});

test('new location shows Monday–Friday and the empty state', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await openCalendar(page, 'A');

  await expectWeek(page, ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']);
  await expect(page.getByTestId('working-weekdays-summary')).toHaveText('Lunes a viernes');
  // Sin cambios no hay nada que guardar: ni barra ni «Guardar» deshabilitado a la vista.
  await expect(page.getByRole('button', { name: 'Guardar días hábiles' })).toHaveCount(0);
  // A es en-US: su semana empieza en domingo (weekOrder, como Horarios).
  expect(await weekOrderShown(page)).toEqual(['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']);
  const section = holidaysSection(page);
  await expect(section.getByText('Añade los festivos de tu sede')).toBeVisible();
  await expect(section.getByText('Dentalix no trae los festivos de ningún país.', { exact: false })).toBeVisible();

  // A 390 px, «Añadir festivo» e «Importar» del vacío van a todo el ancho del
  // bloque, como los de la barra de la lista.
  await page.setViewportSize(VIEWPORTS[1]);
  const empty = section.getByRole('heading', { name: 'Festivos' }).locator('xpath=ancestor::section[1]');
  const sectionWidth = (await empty.boundingBox())!.width;
  for (const name of ['Añadir festivo', 'Importar']) {
    const box = (await section.getByRole('button', { name, exact: true }).boundingBox())!;
    // 24 px de padding a cada lado del bloque vacío, más su borde.
    expect(box.width, `${name} a 390 px`).toBeGreaterThanOrEqual(sectionWidth - 2 * 24 - 2);
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await shoot(page, 'empty', section.getByRole('heading', { name: 'Festivos' }));
});

test('admin sets Sunday–Thursday on B and it persists after reload', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  // Por la lista de Sedes → la ficha de B: «Calendario Sede B» abre su calendario (M8, B6).
  await page.goto(`${origin}/settings/sedes`);
  await page.getByRole('link', { name: 'Abrir Sede B', exact: true }).click();
  await page.getByRole('link', { name: 'Calendario Sede B', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/settings/calendario?sede=${ids.B}`);
  await expect(page.getByTestId('calendar-sede')).toHaveText('Editando: Sede B');
  await expectWeek(page, ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']);
  // B es de-DE: su semana empieza en lunes.
  expect(await weekOrderShown(page)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);

  await page.getByRole('checkbox', { name: 'Viernes', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Domingo', exact: true }).check();
  await expect(page.getByTestId('working-weekdays-summary')).toHaveText('Domingo a jueves');
  const save = page.getByRole('button', { name: 'Guardar días hábiles' });

  // Un 400 (con algo de espera, para que el guardado deshabilite el botón):
  // el foco vuelve a «Guardar días hábiles» para reintentar.
  const route = '**/locations/*/calendar/working-weekdays';
  await page.route(route, async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await r.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 400, message: 'Los días hábiles no son válidos.', error: 'Bad Request' }),
    });
  });
  await save.click();
  await expect(page.getByText('Los días hábiles no son válidos.')).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(save).toBeFocused();
  await page.unroute(route);

  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  await expect(page.getByText('Los días hábiles no son válidos.')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Lunes', exact: true })).toBeFocused();
  // Guardado: sin cambios, la barra se va.
  await expect(save).toHaveCount(0);
  await shoot(page, 'weekdays');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Lunes' })).toBeVisible({ timeout: 15_000 });
  await expectWeek(page, ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves']);
  await expect(page.getByTestId('working-weekdays-summary')).toHaveText('Domingo a jueves');
  // A sigue con lunes a viernes: el calendario es de cada sede (sin selector
  // propio: se llega a A por su enlace, como desde su ficha).
  await openCalendar(page, 'A');
  await expect(page).toHaveURL(`${origin}/settings/calendario?sede=${ids.A}`);
  await expect(page.getByTestId('working-weekdays-summary')).toHaveText('Lunes a viernes');
});

test('add, edit and delete a holiday on A', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  // El día de la semana sale de la fecha civil, no de la zona del navegador
  // (Jest corre en UTC; aquí, la zona de Playwright).
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).not.toBe('UTC');

  for (const [sede, shown] of [
    ['A', '05/03/2027 · lunes'],
    ['B', '03.05.2027 · lunes'],
  ] as const) {
    await openCalendar(page, sede);
    const section = holidaysSection(page);
    await section.getByRole('button', { name: 'Añadir festivo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Añadir festivo' });
    await expect(dialog).toBeVisible();
    await fillDate(dialog, 'Fecha', '2027-05-03');
    await dialog.getByLabel('Nombre').fill('Fiesta de la sede');
    if (sede === 'A') await shoot(page, 'holiday-modal');
    await dialog.getByRole('button', { name: 'Añadir festivo' }).click();
    await expect(dialog).toBeHidden();

    const year = section.getByRole('table', { name: '2027' });
    await expect(year.getByRole('row').filter({ hasText: 'Fiesta de la sede' })).toContainText(shown);
    await expect(section.getByRole('button', { name: 'Añadir festivo' })).toBeFocused();

    // Editar: nombre nuevo, misma fecha.
    await section.getByRole('button', { name: `Acciones de Fiesta de la sede, ${shown}` }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar festivo' });
    await expect.poll(() => readDate(edit, 'Fecha')).toBe('2027-05-03');
    await edit.getByLabel('Nombre').fill('Fiesta mayor de la sede');
    await edit.getByRole('button', { name: 'Guardar festivo' }).click();
    await expect(edit).toBeHidden();
    const row = year.getByRole('row').filter({ hasText: 'Fiesta mayor de la sede' });
    await expect(row).toContainText(shown);
    await expect(year.getByRole('row')).toHaveCount(2); // cabecera + el festivo

    // Eliminar, con confirmación.
    await section.getByRole('button', { name: `Acciones de Fiesta mayor de la sede, ${shown}` }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    const confirm = page.getByRole('dialog', { name: 'Eliminar festivo' });
    await expect(confirm).toContainText('¿Eliminar «Fiesta mayor de la sede»? Los plazos ya calculados no cambian.');
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect(confirm).toBeHidden();
    await expect(section.getByText('Añade los festivos de tu sede')).toBeVisible();
  }
});

test('import the ICS twice: second preview says 12 ya existían', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await openCalendar(page, 'A');
  const section = holidaysSection(page);

  // M8: mientras se lee el archivo, «Elegir archivo» se deshabilita y el foco
  // no puede caer en <body>. La vista previa espera hasta que se mire.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previewRoute = '**/locations/*/holidays/import/preview';
  await page.route(
    previewRoute,
    async (r) => {
      await held;
      await r.continue();
    },
    { times: 1 },
  );
  const dialog = await choosePreview(page);
  await expect(dialog.getByText('Leyendo el archivo…')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Elegir otro archivo' })).toBeDisabled();
  const focusDuringRead = await page.evaluate(() => ({
    body: document.activeElement === document.body,
    inDialog: !!document.activeElement?.closest('[role="dialog"]'),
  }));
  release();
  expect(focusDuringRead.body, 'el foco cae en <body> mientras se lee el archivo').toBe(false);
  expect(focusDuringRead.inDialog, 'el foco sale del diálogo mientras se lee el archivo').toBe(true);

  await expect(dialog.getByTestId('holiday-import-summary')).toHaveText('12 nuevos · 0 ya existían · 0 con errores');
  const submit = dialog.getByRole('button', { name: 'Importar 12 festivos' });
  await expect(submit).toBeEnabled();
  await shoot(page, 'import-preview');
  await submit.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // El resumen tras importar se anuncia fuera del diálogo (T10 I1): la región
  // `status` de «Festivos» es accesible (sin aria-hidden) y ya no hay diálogo.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(section.getByRole('status').filter({ hasText: 'Importados 12 festivos' })).toHaveText('Importados 12 festivos');
  await expect(section.getByRole('button', { name: 'Importar', exact: true })).toBeFocused();

  const recurring = section.getByRole('table', { name: 'Cada año' });
  await expect(recurring.getByRole('row')).toHaveCount(3);
  await expect(recurring.getByRole('row').nth(1)).toContainText('30 de junio');
  await expect(recurring.getByRole('row').nth(2)).toContainText('31 de diciembre');
  const year = section.getByRole('table', { name: '2027' });
  await expect(year.getByRole('row')).toHaveCount(11);
  await expect(year.getByRole('row').filter({ hasText: 'Festivo de prueba 05' })).toContainText('05/03/2027 · lunes');
  await shoot(page, 'list', section.getByRole('heading', { name: 'Festivos' }));

  // Segunda vez: nada nuevo.
  const again = await choosePreview(page);
  await expect(again.getByTestId('holiday-import-summary')).toHaveText('0 nuevos · 12 ya existían · 0 con errores');
  await expect(again.getByText('No hay festivos nuevos que importar.')).toBeVisible();
  await expect(again.getByRole('button', { name: 'Importar 0 festivos' })).toBeDisabled();
  await expect(again.getByRole('region', { name: 'Filas que no se importan' }).getByRole('listitem')).toHaveCount(12);
  await again.getByRole('button', { name: 'Cancelar' }).click();
  await expect(again).toBeHidden();
  await expect(year.getByRole('row')).toHaveCount(11);
  await expect(recurring.getByRole('row')).toHaveCount(3);
});

test('the import result differs from the preview: the modal stays open with what was imported', async ({
  page,
  request,
}) => {
  await loginAs(page, origin, adminEmail, password);
  await openCalendar(page, 'B');
  const dialog = await choosePreview(page);
  await expect(dialog.getByTestId('holiday-import-summary')).toHaveText('12 nuevos · 0 ya existían · 0 con errores');

  // Entretanto, otra persona añade uno de los festivos del archivo.
  await apiPost(request, session, `/locations/${ids.B}/holidays`, {
    date: '2027-01-11',
    name: 'Añadido entretanto',
    recurring: false,
  });
  await dialog.getByRole('button', { name: 'Importar 12 festivos' }).click();

  await expect(dialog.getByTestId('holiday-import-summary')).toHaveText('11 nuevos · 1 ya existía · 0 con errores');
  await expect(
    dialog.getByText('Los festivos de la sede cambiaron mientras revisabas el archivo. Esto es lo que se importó.'),
  ).toBeVisible();
  await expect(dialog.locator(':focus')).toContainText('Los festivos de la sede cambiaron');
  await expect(dialog.getByRole('button', { name: /^Importar/ })).toHaveCount(0);
  // La lista de detrás ya está recargada: 1 añadido + 11 importados.
  await dialog.getByRole('button', { name: 'Cerrar' }).first().click();
  await expect(dialog).toBeHidden();
  const section = holidaysSection(page);
  await expect(section.getByRole('status').filter({ hasText: 'Importados 11 festivos' })).toHaveText(
    'Importados 11 festivos · 1 ya existía',
  );
  await expect(section.getByRole('table', { name: '2027' }).getByRole('row')).toHaveCount(11);
  await expect(section.getByRole('table', { name: 'Cada año' }).getByRole('row')).toHaveCount(3);
  const first = section.getByRole('table', { name: '2027' }).getByRole('row').nth(1);
  await expect(first).toContainText('11.01.2027 · lunes');
  await expect(first).toContainText('Añadido entretanto');
});

test('a DENTIST does not see the settings entry and the route shows the locked state', async ({ page }) => {
  const calendarCalls: string[] = [];
  page.on('request', (r) => {
    if (/\/locations\/[^/]+\/(calendar|holidays)/.test(r.url())) calendarCalls.push(`${r.method()} ${r.url()}`);
  });
  await loginAs(page, origin, dentistEmail, password);
  await page.goto(`${origin}/settings`);
  const main = page.getByRole('main');
  await expect(main.getByRole('listitem').getByRole('link').first()).toBeVisible({ timeout: 15_000 });
  await expect(main.getByRole('link', { name: /Calendario de la sede/ })).toHaveCount(0);

  await page.goto(`${origin}/settings/calendario?sede=${ids.A}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Calendario de la sede' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Solo administración cambia el calendario de la sede.' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Añadir festivo' })).toHaveCount(0);
  expect(calendarCalls, 'la pantalla bloqueada no llama a la API del calendario').toEqual([]);
});

test('390 px has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[1]);
  await loginAs(page, origin, adminEmail, password);
  await openCalendar(page, 'A');
  const section = holidaysSection(page);
  await expect(section.getByRole('table', { name: '2027' }).getByRole('row')).toHaveCount(11);
  await expectFitsWidth(page, 390);

  const dialog = await choosePreview(page);
  await expect(dialog.getByTestId('holiday-import-summary')).toHaveText('0 nuevos · 12 ya existían · 0 con errores');
  await expectDialogInsideViewport(page, dialog);
  await expectFitsWidth(page, 390);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});
