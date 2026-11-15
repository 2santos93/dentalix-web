import { test, expect, type Page } from './support/test';
import { fillDate } from './support/dates';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { addCivilDays, wallDay, wallInstant } from '../src/lib/time/wall-clock';
import { SEDE_TODAY_TZ } from './support/clock';

/**
 * e2e DX-263: citas futuras con la hoja de citas del importador, a 1440 y
 * 390 px, en una clínica nueva (Venezuela, USD).
 *
 *  1. Sube el archivo de pacientes (un paciente nuevo por pantalla), sigue
 *     sin saldos y sube la hoja de citas: una cita válida y otra que pisa al
 *     mismo profesional a la vez (fila 3) y una con un email que no es del
 *     equipo (fila 4). La vista previa enseña «Citas a crear» 1 y los
 *     motivos de las filas rechazadas, en español.
 *  2. Confirma: la importación termina con «Citas: 1 de 1».
 *  3. La agenda (Día · Lista) de la sede, ese día, enseña la cita importada
 *     del paciente nuevo a su hora de la sede.
 *
 * Capturas en E2E_QA_DIR si está definido. Requiere la API con worker.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `citas-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.citas.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;

const SEDE = {
  country: 'VE',
  currency: 'USD',
  timeZone: SEDE_TODAY_TZ,
  locale: 'es-VE',
  hourCycle: 'h12',
} satisfies RegionalSettings;
const fmt = regionalFormat({ locale: SEDE.locale, hourCycle: SEDE.hourCycle });

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900, tag: '1' },
  { name: '390', width: 390, height: 844, tag: '2' },
] as const;

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
/** Día de la sede de las citas (dentro de tres días). */
const day = addCivilDays(wallDay(new Date(), SEDE.timeZone), 3);
const ddmmyyyy = day.split('-').reverse().join('/');

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(300);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Citas ${suffix}`,
    fullName: 'Ana Titular',
    email: adminEmail,
    password,
    location: SEDE,
  });
  // Sin horario de atención: se agenda a cualquier hora.
  const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  // Un paciente que ya existía (su cita importada no choca con nada).
  await apiPost(request, session, '/patients', {
    firstName: 'Previa',
    lastName: `Existente${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `EX${suffix}`.slice(0, 20),
    sex: 'F',
  });
});

for (const viewport of VIEWPORTS) {
  test(`hoja de citas: vista previa con conflictos, confirmar y verla en la agenda (${viewport.name})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const doc = `CI${viewport.tag}${suffix}`.slice(0, 20);
    const lastName = `Citada${viewport.tag}${suffix}`.slice(0, 40);
    // Cada pantalla, su hora (la otra corrida no debe pisarla).
    const hour = viewport.tag === '1' ? 9 : 11;
    const hh = String(hour).padStart(2, '0');
    const start = wallInstant(day, hour * 60, SEDE.timeZone);
    const range = `${fmt.time(start, SEDE.timeZone)} – ${fmt.time(new Date(start.getTime() + 30 * 60_000), SEDE.timeZone)}`;

    await loginAs(page, origin, adminEmail, password);
    await page.goto(`${origin}/settings/importar-pacientes`);
    await page.getByLabel('Archivo de pacientes (CSV o .xlsx)').setInputFiles({
      name: `pacientes-citas-${viewport.name}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(`tipo_documento;numero_documento;nombres;apellidos\nPASSPORT;${doc};Luisa;${lastName}\n`, 'utf8'),
    });
    await page.getByRole('button', { name: 'Validar archivo' }).click();
    await page
      .getByRole('region', { name: 'Resultado de la validación' })
      .getByRole('button', { name: 'Continuar' })
      .click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar sin saldos' }).click();

    // Hoja de citas: una válida, una que pisa al mismo profesional y una de alguien que no es del equipo.
    await expect(page.getByRole('heading', { name: 'Citas futuras (opcional)' })).toBeVisible();
    await page.getByLabel('Hoja de citas (CSV o .xlsx)').setInputFiles({
      name: `citas-${viewport.name}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(
        [
          'numero_documento;fecha;hora;duracion_min;email_profesional;sede;tipo_cita;motivo',
          `${doc};${ddmmyyyy};${hh}:00;30;${adminEmail};;;Control importado`,
          `EX${suffix}`.slice(0, 20) + `;${ddmmyyyy};${hh}:15;30;${adminEmail};;;`,
          `${doc};${ddmmyyyy};${hh}:45;30;nadie.${suffix}@example.com;;;`,
        ].join('\n') + '\n',
        'utf8',
      ),
    });
    const issues = page.getByRole('table', { name: 'Errores y avisos de la hoja de citas' });
    await expect(issues).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(`citas-${viewport.name}.csv · 3 filas`)).toBeVisible();
    await expect(issues).toContainText('Se solapa con la cita de la fila 2 del archivo: el profesional ya tiene una cita a esa hora.');
    await expect(issues).toContainText('la cita no se asigna a otro profesional');
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, 'dx263-hoja-citas', viewport.width);

    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByText(/También se creará 1 cita futura/)).toBeVisible();
    await shoot(page, 'dx263-confirmar', viewport.width);
    await page.getByRole('button', { name: 'Importar 1 paciente' }).click();
    const progress = page.getByRole('region', { name: `Importación de pacientes-citas-${viewport.name}.csv` });
    await expect(progress.getByText('Citas: 1 de 1')).toBeVisible({ timeout: 60_000 });
    await expect(progress.getByText('Importado', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(progress.getByText(/no reciben recordatorios automáticos/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, 'dx263-importado', viewport.width);

    // La agenda de la sede, ese día: la cita del paciente nuevo, a su hora.
    await page.goto(`${origin}/agenda`);
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    await fillDate(page, 'Fecha', day);
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    const item = page.getByText(range).filter({ visible: true }).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(new RegExp(lastName)).filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, 'dx263-agenda', viewport.width);
  });
}
