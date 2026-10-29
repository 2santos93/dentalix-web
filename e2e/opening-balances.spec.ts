import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { openPatientTab } from './support/patient-tabs';

/**
 * e2e (DX-262): paso «Saldos» del asistente de importación en la demo, a 1440
 * y 390.
 *
 *   1. Pacientes (un nuevo) → validar → «Saldos (opcional)».
 *   2. Subir la hoja de saldos (dry-run): totales por moneda del archivo y
 *      de lo que se importa, una fila sumada y los errores en español; a 390
 *      ni la página ni `<main>` se desplazan de lado.
 *   3. Confirmar: avance con «Saldos migrados: 2 de 2».
 *   4. Estado de cuenta del importado: «Saldo migrado» con su fecha de corte
 *      («aprox.» la que no la traía); a 1440, la cartera lo lista.
 *   5. Deshacer el lote desde el historial.
 *
 * Requiere la API con worker (APP_ROLE=all) y la demo sembrada.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const QA_DIR = process.env.E2E_QA_DIR;

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^0-9]/g, '')
  .slice(-6)
  .padStart(6, '5');

async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(QA_DIR, `${name}-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function webLogin(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect.poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 }).toBe(true);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

/** Día civil en Bogotá desplazado `days` (la demo está en Colombia). */
function bogotaDay(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900, tag: '1' },
  { name: 'movil', width: 390, height: 844, tag: '2' },
]) {
  test(`legacy «Tipo Doc» CC: hoja de saldos: dry-run, importar, estado de cuenta y deshacer (${viewport.name})`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const doc = `62${viewport.tag}${suffix}1`;
    const lastName = `Migrado${viewport.tag}${suffix}`;
    const oldDay = bogotaDay(-75);

    await webLogin(page, origin);
    await page.goto(`${origin}/settings/importar-pacientes`);
    await page.getByLabel('Archivo de pacientes (CSV o .xlsx)').setInputFiles({
      name: `pacientes-saldos-${viewport.name}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(`Tipo Doc;Cédula;Nombre;Apellidos\nCC;${doc};Sara;${lastName}\n`, 'utf8'),
    });
    await page.getByRole('button', { name: 'Validar archivo' }).click();
    await page
      .getByRole('region', { name: 'Resultado de la validación' })
      .getByRole('button', { name: 'Continuar' })
      .click();
    await expect(page.getByRole('heading', { name: 'Saldos de los pacientes (opcional)' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');

    // Dry-run de la hoja de saldos.
    const sheet = [
      'numero_documento;importe;moneda;fecha_antiguedad;concepto',
      `${doc};150.000;COP;${ddmmyyyy(oldDay)};Ortodoncia (programa anterior)`,
      `${doc};50.000,50;COP;;`,
      `${doc};40;USD;;`,
      `99${suffix};100;COP;;`,
      `${doc};-5;COP;;`,
    ].join('\n');
    await page.getByLabel('Hoja de saldos (CSV o .xlsx)').setInputFiles({
      name: `saldos-${viewport.name}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(sheet, 'utf8'),
    });
    const totals = page.getByRole('table', { name: 'Totales por moneda' });
    await expect(totals).toBeVisible({ timeout: 30_000 });
    // QA D4: lo válido y, aparte, lo de las filas con error (el documento
    // inexistente: 100 COP; el importe negativo no suma en ninguna).
    await expect(totals.getByRole('columnheader', { name: 'Total de filas válidas' })).toHaveCount(1);
    await expect(totals.getByRole('row', { name: /COP/ })).toContainText('100,00');
    await expect(totals.getByRole('row', { name: /COP/ })).toContainText('200.000,50');
    await expect(totals.getByRole('row', { name: /USD/ })).toContainText('40,00');
    const issues = page.getByRole('table', { name: 'Errores y avisos de la hoja de saldos' });
    await expect(issues).toContainText('Sumada a otra fila');
    await expect(issues).toContainText(`No hay ningún paciente con el documento «99${suffix}»`);
    await expect(issues).toContainText('El importe debe ser mayor que 0.');
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx262-saldos-${viewport.name}`);

    // Confirmar.
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByText(/También se crearán 2 saldos migrados/)).toBeVisible();
    await page.getByRole('button', { name: 'Importar 1 paciente' }).click();
    await expect(page.getByText('Importado', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Saldos migrados: 2 de 2')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, `dx262-importado-${viewport.name}`);

    // Estado de cuenta del importado.
    await page.goto(`${origin}/patients?query=${doc}`);
    await page
      .getByRole('link', { name: new RegExp(lastName) })
      .first()
      .click();
    await openPatientTab(page, 'Estado de cuenta');
    const panel = page.locator('#tabpanel-account-statement');
    const openings = panel.getByRole('table', { name: 'Saldos migrados' });
    await expect(openings).toBeVisible({ timeout: 15_000 });
    await expect(openings).toContainText('Ortodoncia (programa anterior)');
    await expect(openings).toContainText(ddmmyyyy(oldDay));
    await expect(openings).toContainText(`${ddmmyyyy(bogotaDay(0))} (aprox.)`);
    await expect(panel.getByRole('region', { name: 'Resumen en COP' }).getByTestId('balance')).toContainText(
      '200.000,50',
    );
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx262-estado-cuenta-${viewport.name}`);

    if (viewport.width >= 1024) {
      // Cartera de toda la clínica: el importado sale como deudor.
      await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
      await page.goto(`${origin}/caja/cartera`);
      await expect(page.getByRole('row', { name: new RegExp(lastName) })).toBeVisible({ timeout: 15_000 });
    }

    // Deshacer el lote: el saldo se retira con él.
    await page.goto(`${origin}/settings/importar-pacientes`);
    const history = page.getByRole('list', { name: 'Importaciones de la clínica' });
    const row = history
      .getByRole('listitem')
      .filter({ hasText: `pacientes-saldos-${viewport.name}.csv` })
      .first();
    await row.getByRole('button', { name: /Deshacer el lote/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Deshacer lote' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText('Deshecho');
  });
}
