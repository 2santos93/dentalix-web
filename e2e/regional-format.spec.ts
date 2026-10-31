import { test, expect, type APIRequestContext, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiLogin, apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { fillRegistrationLocation, loginAs, waitForHydratedForm } from './support/auth';
import { dataList, dataListRows } from './support/data-list';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { registrationTokenFor } from './support/mail';
import { pickRegional, type RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat, type HourCycle } from '../src/lib/format/regional-format';

/**
 * e2e GLOBAL-G1-B (DX-350, DX-315): formato regional y reloj por sede.
 *
 * Una clínica nueva por corrida con dos sedes creadas por la API:
 * - A: `en-US` / `America/New_York` / USD / 12 h;
 * - B: `ja-JP` / `Asia/Tokyo` / JPY / 24 h.
 * En cada una, un paciente con un implante aceptado: su cita T (hoy, ya
 * empezada; se crea mañana y se mueve a hoy por la BD, como DX-273) «llegó»
 * por la API, y la cita H de dentro de unos días se quedó la reserva.
 *
 *  1. Panel «En clínica»: las horas en 12 h en A y en 24 h en B, y el aviso
 *     «reservado en la cita del …» con la fecha en el orden de cada sede.
 *  2. En A, los recuentos de la importación («1,234 filas») y el tamaño de un
 *     documento («1.5 KB») con los separadores de `en-US`.
 *  3. Modal de sede: «Reloj» bajo la vista previa, sin media fila vacía; en
 *     Chromium, una hora de 12 h y un número `de-DE` exactos (M7: entre
 *     navegadores la garantía es «mismas partes», no «mismos bytes»). El ADMIN
 *     pasa A a 24 h y el panel lo pinta en 24 h sin recargar la página.
 *  4. Registro por la UI: el reloj sugerido por el navegador de la prueba sale
 *     marcado y es el que se guarda (no se pasa `hourCycle`: prueba la sugerencia).
 *  5. Una sede con `hourCycle` NULL (fixture por la BD): la web pinta
 *     SedeConfigError kind="locale" y el panel, el 409 de la API; nunca otro reloj.
 *
 * Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR si está definido.
 * Sin E2E_DATABASE_URL los casos que la necesitan se saltan (permitido en
 * e2e/allowed-skips.json); en la CI siempre está.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `g1b-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.g1b.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se pueden mover a hoy las citas ni quitar el reloj de una sede';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const SEDE_A = { name: 'Sede A', country: 'US', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' } satisfies RegionalSettings & { name: string };
const SEDE_B = { name: 'Sede B', country: 'JP', currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP', hourCycle: 'h23' } satisfies RegionalSettings & { name: string };
const SEDE_C = { name: 'Sede C', country: 'FR', currency: 'EUR', timeZone: 'Europe/Paris', locale: 'fr-FR', hourCycle: 'h12' } satisfies RegionalSettings & { name: string };
type Sede = typeof SEDE_A | typeof SEDE_B | typeof SEDE_C;

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

let session: ApiSession;
let providerId: string;
let catalogId: string;
const ids: Record<'A' | 'B' | 'C', string> = { A: '', B: '', C: '' };

interface Scenario {
  patient: string;
  /** Inicio de la cita que llegó (T) y de la que tiene la reserva (H). */
  arrivedStart: Date;
  holderStart: Date;
}
const scenarios: Partial<Record<'A' | 'B', Scenario>> = {};

/** Partes de pared de un instante en una zona: la comprobación del orden no usa el helper. */
function wall(at: Date, timeZone: string): { year: string; month: string; day: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      calendar: 'gregory',
      numberingSystem: 'latn',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** Medianoche de hoy en la zona (sin cambio de hora en el día). */
function zonedMidnight(now: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, Number(x.value)]),
  );
  return now.getTime() - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 - now.getMilliseconds();
}

function psql(sql: string): void {
  execFileSync('psql', [process.env.E2E_DATABASE_URL as string, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
}

/** Las llamadas de la sesión en una sede (`X-Location-Id`). */
function at(sede: 'A' | 'B'): ApiSession {
  return { ...session, headers: { ...session.headers, 'X-Location-Id': ids[sede] } };
}

/** El instante redondeado al minuto, `days` días después de ahora (la API no agenda en el pasado). */
function fromNow(days: number, extraMinutes = 0): Date {
  const t = Date.now() + days * DAY + extraMinutes * MIN;
  return new Date(Math.ceil(t / (5 * MIN)) * 5 * MIN);
}

async function scenario(
  request: APIRequestContext,
  sede: 'A' | 'B',
  settings: Sede,
  slot: number,
  taken: readonly Date[] = [],
): Promise<Scenario> {
  const s = at(sede);
  const patient = await apiPost<{ id: string }>(request, s, '/patients', {
    firstName: `Paciente${sede}`,
    lastName: `Formato${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `G1B${sede}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, s, `/patients/${patient.id}/treatment-plans`, {
    currency: settings.currency,
  });
  const item = await apiPost<{ id: string }>(request, s, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '36',
    catalogItemId: catalogId,
  });
  const accepted = await request.patch(`${API_URL}/treatment-plans/${plan.id}`, {
    headers: s.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();

  // T: mañana con el implante; por la BD, hoy (día de la sede) y ya empezada.
  const tomorrow = fromNow(1, slot * 60);
  const t = await apiPost<{ id: string }>(request, s, '/appointments', {
    patientId: patient.id,
    providerId,
    start: tomorrow.toISOString(),
    end: new Date(tomorrow.getTime() + 15 * MIN).toISOString(),
    planItemIds: [item.id],
  });
  const now = new Date();
  const midnight = zonedMidnight(now, settings.timeZone);
  const arrivedStart = new Date(Math.max(midnight + slot * 6 * MIN, now.getTime() - (10 + slot * 6) * MIN));
  arrivedStart.setUTCSeconds(0, 0);
  // Las dos sedes comparten profesional y la BD prohíbe solaparle citas: si el
  // día de esta sede acaba de empezar (el tope de medianoche la empuja), su
  // ventana de 5 min puede caer encima de la de la otra sede. Se mueve justo
  // detrás de la ocupada, o justo delante si así ya no cabe antes de ahora.
  for (const other of taken) {
    if (Math.abs(arrivedStart.getTime() - other.getTime()) >= 6 * MIN) continue;
    const after = other.getTime() + 6 * MIN;
    const before = other.getTime() - 6 * MIN;
    arrivedStart.setTime(after < now.getTime() - MIN ? after : Math.max(before, midnight));
  }
  expect(arrivedStart.getTime(), `ya no queda margen hoy en ${settings.timeZone}: vuelve a lanzar el spec`).toBeLessThan(
    now.getTime() - MIN,
  );
  psql(
    `UPDATE appointments SET start = '${arrivedStart.toISOString()}', "end" = '${new Date(arrivedStart.getTime() + 5 * MIN).toISOString()}' WHERE id = '${t.id}'`,
  );
  // H: dentro de unos días, con el mismo implante (la reserva de T venció).
  const holderStart = fromNow(5, slot * 60);
  await apiPost<{ id: string }>(request, s, '/appointments', {
    patientId: patient.id,
    providerId,
    start: holderStart.toISOString(),
    end: new Date(holderStart.getTime() + 30 * MIN).toISOString(),
    planItemIds: [item.id],
  });
  const arrived = await request.patch(`${API_URL}/appointments/${t.id}`, {
    headers: s.headers,
    data: { status: 'ARRIVED' },
  });
  expect(arrived.ok(), await arrived.text()).toBeTruthy();
  return { patient: `Paciente${sede} Formato${suffix}`.slice(0, 60), arrivedStart, holderStart };
}

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  // Sin el hover del último clic y sin transiciones de color a medias.
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: false });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Entra como el ADMIN con `sede` elegida (la sede activa vive en localStorage). */
async function loginAt(page: Page, sede: 'A' | 'B' | 'C'): Promise<void> {
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), ids[sede]);
}

/** El panel «En clínica» a pantalla completa. */
async function openInClinic(page: Page) {
  await page.goto(`${origin}/agenda/en-clinica`);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'En clínica', exact: true })).toBeVisible({ timeout: 15_000 });
  return main;
}

/** Marca la ventana: si la página se recarga, la marca desaparece. */
async function markWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __g1bNoReload?: boolean }).__g1bNoReload = true;
  });
}

async function expectSameWindow(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => (window as unknown as { __g1bNoReload?: boolean }).__g1bNoReload === true),
    'la página no se recargó',
  ).toBe(true);
}

/** PDF mínimo válido de exactamente `size` bytes (relleno en un comentario). */
function pdfOfSize(size: number): Buffer {
  const head = ['%PDF-1.4', '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj', '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj', '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj', 'trailer << /Root 1 0 R >>'].join('\n');
  const tail = '\n%%EOF\n';
  const pad = size - head.length - tail.length - 2;
  return Buffer.from(`${head}\n%${'0'.repeat(pad)}${tail}`, 'latin1');
}

/** CSV «;» de `rows` pacientes. */
function csvOf(rows: number): Buffer {
  const lines = ['Tipo Doc;Documento;Nombre;Apellidos;Sexo'];
  for (let i = 0; i < rows; i += 1) lines.push(`PASSPORT;G1B${suffix}${i};Persona${i};Importada;F`);
  return Buffer.from(lines.join('\n'), 'utf8');
}

async function locationsOf(request: APIRequestContext, s: ApiSession) {
  const res = await request.get(`${API_URL}/locations`, { headers: s.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; name: string; hourCycle: HourCycle | null; regionalSettingsReviewedAt: string | null }[];
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Formato ${suffix}`,
    fullName: 'Ana Titular',
    email: adminEmail,
    password,
  });
  ids.A = await createLocationViaApi(request, session, SEDE_A);
  ids.B = await createLocationViaApi(request, session, SEDE_B);
  ids.C = await createLocationViaApi(request, session, SEDE_C);
  for (const sede of ['A', 'B'] as const) {
    const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: at(sede).headers, data: { ranges: [] } });
    expect(schedule.ok(), await schedule.text()).toBeTruthy();
  }
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  providerId = staff.find((m) => m.fullName === 'Ana Titular')!.userId;
  catalogId = (
    await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `g1b-${suffix}`.slice(0, 20),
      kind: 'PROCEDURE',
      labelEs: `Implante ${suffix.slice(0, 6)}`,
      color: '#3366CC',
      defaultPrice: 1000,
    })
  ).id;
});

test('panel «En clínica»: 12 h en A, 24 h en B, y la reserva en otra cita con la fecha en el orden de cada sede', async ({
  page,
  request,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  test.setTimeout(150_000);
  scenarios.A = await scenario(request, 'A', SEDE_A, 0);
  scenarios.B = await scenario(request, 'B', SEDE_B, 1, [scenarios.A.arrivedStart]);
  const cases = [
    { sede: 'A', settings: SEDE_A, s: scenarios.A, order: (w: ReturnType<typeof wall>) => `${w.month}/${w.day}/${w.year}` },
    { sede: 'B', settings: SEDE_B, s: scenarios.B, order: (w: ReturnType<typeof wall>) => `${w.year}/${w.month}/${w.day}` },
  ] as const;

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const c of cases) {
      const fmt = regionalFormat({ locale: c.settings.locale, hourCycle: c.settings.hourCycle });
      await loginAt(page, c.sede);
      const main = await openInClinic(page);
      const row = main.locator('[data-appointment-id]').filter({ hasText: c.s.patient });
      const time = fmt.time(c.s.arrivedStart, c.settings.timeZone);
      await expect(row).toContainText(`Cita ${time}`, { timeout: 15_000 });
      if (c.settings.hourCycle === 'h12') {
        // M7, en Chromium: hora de 12 h con «a. m.»/«p. m.» en español, sin cero a la izquierda.
        expect(time).toMatch(/^(1[0-2]|[1-9]):[0-5]\d\s[ap]\.\s?m\.$/);
      } else {
        expect(time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      }
      // La fecha de la otra cita en el orden de SU sede (partes, no el helper).
      const date = c.order(wall(c.s.holderStart, c.settings.timeZone));
      expect(fmt.date(c.s.holderStart, c.settings.timeZone)).toBe(date);
      const notice = main.getByRole('group', { name: 'Tratamiento reservado en otra cita' });
      await expect(notice).toContainText(
        `Este tratamiento está reservado en la cita del ${date} a las ${fmt.time(c.s.holderStart, c.settings.timeZone)} (${c.settings.name}).`,
      );
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
      await shoot(page, `panel-sede-${c.sede.toLowerCase()}`, viewport.width);
    }
  }
});

test('en A: los recuentos de la importación y el tamaño de un documento con los separadores de en-US', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAt(page, 'A');
    await page.goto(`${origin}/settings/importar-pacientes`);
    const fileName = `pacientes-${viewport.name}.csv`;
    await page.getByLabel('Archivo de pacientes (CSV o .xlsx)').setInputFiles({
      name: fileName,
      mimeType: 'text/csv',
      buffer: csvOf(1234),
    });
    await expect(page.getByText(`${fileName} · 1,234 filas`)).toBeVisible({ timeout: 30_000 });
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'importacion-sede-a', viewport.width);
  }

  const patient = await apiPost<{ id: string }>(request, at('A'), '/patients', {
    firstName: 'Documento',
    lastName: `Formato${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `G1BDOC${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const name = 'remision.pdf';
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${origin}/patients/${patient.id}?tab=documents`);
    const panel = page.locator('#tabpanel-documents');
    if (viewport.width === 1440) {
      await panel.getByLabel('Archivos para subir').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdfOfSize(1536) });
      const queued = panel.getByRole('list', { name: 'Archivos por subir' }).getByRole('listitem', { name });
      // 1536 bytes = 1,5 KB: con en-US, «1.5 KB».
      await expect(queued).toContainText('1.5 KB');
      await queued.getByRole('button', { name: `Subir ${name}` }).click();
      await expect(queued.getByText('Subido')).toBeVisible({ timeout: 30_000 });
      await page.reload();
    }
    // DataList: fila de tabla a 1440, tarjeta (listitem) a 390.
    const row = dataListRows(dataList(panel, /^Documentos$/)).filter({ hasText: name }).first();
    await expect(row).toContainText('1.5 KB', { timeout: 15_000 });
    await row.scrollIntoViewIfNeeded();
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'documento-sede-a', viewport.width);
  }
});

test('modal de sede: reloj bajo la vista previa; A pasa a 24 h y el panel lo pinta sin recargar', async ({ page, request }) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  test.setTimeout(150_000);
  const s = scenarios.A!;
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAt(page, 'A');
    await page.goto(`${origin}/settings/sedes`);
    await page.getByRole('button', { name: 'Nueva sede' }).click();
    const create = page.getByRole('dialog', { name: 'Nueva sede' });
    await expect(create).toBeVisible();
    await pickRegional(create.getByLabel('Zona horaria', { exact: true }), 'Europe/Berlin');
    await pickRegional(create.getByLabel('Formato regional', { exact: true }), 'de-DE');
    await create.getByRole('radio', { name: '12 h', exact: true }).check();
    // M7, en Chromium: un número de-DE exacto y la hora de 12 h del ejemplo.
    await expect(create.getByText(/^Vista previa: 12\.345,67 · \d{2}\.\d{2}\.\d{4}/)).toBeVisible();
    await expect(create.locator('[id$="-hourCycle-example"]')).toHaveText(/^(1[0-2]|[1-9]):[0-5]\d\s[ap]\.\s?m\.$/);
    // Grid: formato → vista previa → Reloj, cada uno a lo ancho, sin media fila vacía a 2 columnas.
    const preview = create.getByText(/^Vista previa:/);
    const clock = create.getByRole('radiogroup', { name: 'Reloj' });
    const format = create.getByLabel('Formato regional', { exact: true });
    const [fBox, pBox, cBox] = [await format.boundingBox(), await preview.boundingBox(), await clock.boundingBox()];
    expect(pBox!.y).toBeGreaterThan(fBox!.y);
    expect(cBox!.y).toBeGreaterThan(pBox!.y);
    if (viewport.width === 390) await expectDialogInsideViewport(page, create);
    await shoot(page, 'modal-nueva-sede-de-de', viewport.width);
    // A 390 el Reloj queda bajo el pliegue del diálogo: captura de las dos opciones.
    if (viewport.width === 390) {
      await clock.scrollIntoViewIfNeeded();
      await shoot(page, 'modal-nueva-sede-reloj', viewport.width);
    }
    await create.getByRole('button', { name: 'Cancelar' }).click();
    await expect(create).toBeHidden();
  }

  // El ADMIN pasa A a 24 h; el panel lo pinta en 24 h sin recargar.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/settings/sedes`);
  await page.getByRole('button', { name: `Editar ${SEDE_A.name}` }).click();
  const edit = page.getByRole('dialog', { name: 'Editar sede' });
  await expect(edit.getByRole('radio', { name: '12 h', exact: true })).toBeChecked();
  await shoot(page, 'modal-editar-sede-a', 1440);
  await markWindow(page);
  const saved = page.waitForRequest(
    (req) => req.method() === 'PATCH' && new URL(req.url()).pathname.endsWith(`/locations/${ids.A}`),
  );
  await edit.getByRole('radio', { name: '24 h', exact: true }).check();
  await edit.getByRole('button', { name: 'Guardar sede' }).click();
  expect((await saved).postDataJSON()).toMatchObject({ hourCycle: 'h23' });
  await expect(edit).toBeHidden({ timeout: 10_000 });
  await page.getByRole('link', { name: 'Agenda', exact: true }).locator('visible=true').first().click();
  await expect(page).toHaveURL(/\/agenda/);
  const panel = page.getByRole('region', { name: 'En clínica' });
  const h23 = regionalFormat({ locale: SEDE_A.locale, hourCycle: 'h23' });
  await expect(panel.locator('[data-appointment-id]').filter({ hasText: s.patient })).toContainText(
    `Cita ${h23.time(s.arrivedStart, SEDE_A.timeZone)}`,
    { timeout: 15_000 },
  );
  await expectSameWindow(page);
  await shoot(page, 'panel-sede-a-24h', 1440);
  const [a] = (await locationsOf(request, session)).filter((l) => l.id === ids.A);
  expect(a.hourCycle).toBe('h23');
});

// R1: con una zona de un solo país (la de la suite, America/Bogota → Colombia)
// el registro propone el país y su formato (es-CO) y el reloj sale de ese
// formato, no del navegador. Esta prueba mira el reloj del NAVEGADOR, así que
// abre el registro en una zona que no es de ningún país.
test.describe('registro con el reloj del navegador', () => {
  test.use({ timezoneId: 'Etc/UTC' });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} px: registro por la UI con el reloj que sugiere el navegador`, async ({ page, request }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const tag = `${suffix}${viewport.width}`;
      const email = `registro.g1b.${tag}@example.com`;
      const sub = `g1b-registro-${tag}`;
      const regOrigin = tenantOrigin(sub);

      await page.goto(`${regOrigin}/register`);
      await waitForHydratedForm(page);
      const browserCycle = await page.evaluate(() => {
        const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
        return hc === 'h11' || hc === 'h12' ? 'h12' : hc === 'h23' || hc === 'h24' ? 'h23' : null;
      });
      expect(browserCycle, 'el navegador de la prueba declara un reloj').not.toBeNull();
      const label = browserCycle === 'h12' ? '12 h' : '24 h';
      const clock = page.getByRole('radiogroup', { name: 'Reloj' });
      await expect(clock.getByRole('radio', { name: label, exact: true })).toBeChecked();
      await expect(clock).toContainText('Sugerido por tu navegador.');

      // Paso 1 (la clínica y su sede).
      await page.getByLabel('Nombre de la clínica').fill(`Clínica Registro ${tag}`);
      await page.getByLabel('Dirección web').fill(sub);
      // Sin `hourCycle`: se queda el que sugirió el navegador.
      await fillRegistrationLocation(page, { country: 'ES', currency: 'EUR', timeZone: 'Europe/Madrid', locale: 'es-ES' });
      await expect(clock.getByRole('radio', { name: label, exact: true })).toBeChecked();
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
      await clock.scrollIntoViewIfNeeded();
      await shoot(page, 'registro-reloj', viewport.width);
      await page.getByRole('button', { name: 'Continuar' }).click();
      // Paso 2 (la cuenta).
      await page.getByLabel('Nombre completo').fill('Lucía Registro');
      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByLabel('Contraseña', { exact: true }).fill(password);

      const sent = page.waitForRequest(
        (req) => req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/api/v1/auth/register'),
      );
      await page.getByRole('button', { name: 'Crear cuenta' }).click();
      expect((await sent).postDataJSON()).toMatchObject({ locationHourCycle: browserCycle });
      await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible({ timeout: 10_000 });

      const token = await registrationTokenFor(email);
      const verify = await request.post(`${API_URL}/auth/register/verify`, { data: { token, password } });
      expect(verify.ok(), await verify.text()).toBeTruthy();
      const [location] = await locationsOf(request, await apiLogin(request, regOrigin, email, password));
      expect(location.hourCycle).toBe(browserCycle);
      expect(location.regionalSettingsReviewedAt, 'la sede elegida en el registro nace revisada').not.toBeNull();
    });
  }
});

test('una sede con el reloj en NULL: el aviso de formato de sede en la importación y el 409 de la API en el panel, nunca otro reloj', async ({
  page,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  test.setTimeout(90_000);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // Fixture por la BD: la sede de una réplica anterior a G1-B, aún sin barrer.
    // El barrido (cada 5 min) la rellenaría: se pone justo antes de mirarla.
    psql(`UPDATE locations SET "hourCycle" = NULL WHERE id = '${ids.C}'`);
    await loginAt(page, 'C');
    // La web no tiene el reloj de la sede: SedeConfigError kind="locale" (nota
    // sobre la pantalla, que sigue sirviendo), con «Configurar sede» para ADMIN.
    await page.goto(`${origin}/settings/importar-pacientes`);
    const main = page.getByRole('main');
    await expect(main.getByRole('status').filter({ hasText: 'No se pudo saber el formato regional o el reloj de la sede.' })).toContainText(
      'No se pudo saber el formato regional o el reloj de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.',
      { timeout: 15_000 },
    );
    // «Configurar sede» abre esa sede, no la lista.
    await expect(main.getByRole('link', { name: 'Configurar sede' })).toHaveAttribute(
      'href',
      `/settings/sedes?sede=${encodeURIComponent(ids.C)}`,
    );
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'sede-sin-reloj-importacion', viewport.width);
    // El panel pide sus horas a la API, que responde 409 LOCATION_LOCALE_REQUIRED:
    // SedeConfigError en su variante de sección, con el texto de la API y la sede.
    const panel = await openInClinic(page);
    const sectionError = panel.getByRole('alert');
    await expect(sectionError).toContainText('Falta un dato de la sede', { timeout: 15_000 });
    await expect(sectionError).toContainText('Configura el formato regional y el reloj de la sede y vuelve a intentarlo.');
    await expect(sectionError).not.toContainText('No se pudo cargar');
    await expect(sectionError.getByRole('link', { name: 'Configurar sede' })).toHaveAttribute(
      'href',
      `/settings/sedes?sede=${encodeURIComponent(ids.C)}`,
    );
    await expect(panel.locator('[data-appointment-id]')).toHaveCount(0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'sede-sin-reloj-panel', viewport.width);
  }
  // La deja como el barrido: no hay que esperar al job para el resto de la suite.
  psql(`UPDATE locations SET "hourCycle" = 'h23' WHERE id = '${ids.C}' AND "hourCycle" IS NULL`);
});
