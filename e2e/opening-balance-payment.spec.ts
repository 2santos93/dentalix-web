import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { tenantOrigin } from './support/urls';
import { E2E_REGION } from './support/regional';
import { regionalFormat } from '../src/lib/format/regional-format';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { openPatientTab } from './support/patient-tabs';

/**
 * e2e (DX-262, correcciones de la revisión C1 e I2) en la demo, a 1440 y 390.
 *
 *   1. Importar un paciente nuevo con un saldo migrado de 100.000 COP.
 *   2. I2: volver a subir el mismo paciente (ya existe, nada que importar):
 *      el asistente deja seguir a «Saldos» y confirmar «Importar 1 saldo
 *      migrado» (25.000 COP).
 *   3. C1: «Registrar abono» ofrece el saldo migrado como destino con su
 *      pendiente; no deja pasarse; el abono de 40.000 deja «Abonado» y
 *      «Pendiente» en la línea y el saldo del resumen baja.
 *   4. Retirar los saldos del primer lote: 409 claro (tiene abonos vivos).
 *      Los del lote de I2 (sin abonos) sí se retiran.
 *
 * QA D1: la hoja de I2 vuelve a traer deuda en COP para un paciente que ya
 * tiene un saldo migrado en COP: el dry-run no lo crea hasta marcar «Añadir
 * aunque ya tenga saldo migrado».
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
  .padStart(6, '7');

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

/** Sube la hoja de pacientes y valida (paso 1 → 2 del asistente). */
async function validatePatients(page: Page, origin: string, fileName: string, csv: string): Promise<void> {
  await page.goto(`${origin}/settings/importar-pacientes`);
  await page.getByLabel('Archivo de pacientes (CSV o .xlsx)').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Validar archivo' }).click();
}

async function uploadBalances(page: Page, fileName: string, sheet: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Saldos de los pacientes (opcional)' })).toBeVisible();
  await page.getByLabel('Hoja de saldos (CSV o .xlsx)').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(sheet, 'utf8'),
  });
  await expect(page.getByRole('table', { name: 'Totales por moneda' })).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900, tag: '1' },
  { name: 'movil', width: 390, height: 844, tag: '2' },
]) {
  test(`legacy «Tipo Doc» CC: abono contra el saldo migrado y solo saldos sin pacientes nuevos (${viewport.name})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const doc = `63${viewport.tag}${suffix}1`;
    const lastName = `Abono${viewport.tag}${suffix}`;
    const patientsCsv = `Tipo Doc;Cédula;Nombre;Apellidos\nCC;${doc};Tomás;${lastName}\n`;
    const firstFile = `pacientes-abono-${viewport.name}-${suffix}.csv`;
    const onlyBalancesFile = `pacientes-solo-saldos-${viewport.name}-${suffix}.csv`;

    await webLogin(page, origin);

    // 1. Paciente nuevo con su saldo migrado.
    await validatePatients(page, origin, firstFile, patientsCsv);
    await page
      .getByRole('region', { name: 'Resultado de la validación' })
      .getByRole('button', { name: 'Continuar' })
      .click();
    await uploadBalances(
      page,
      `saldos-abono-${viewport.name}.csv`,
      `numero_documento;importe;moneda;fecha_antiguedad;concepto\n${doc};100.000;COP;;Cartera anterior\n`,
    );
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Importar 1 paciente' }).click();
    await expect(page.getByText('Saldos migrados: 1 de 1')).toBeVisible({ timeout: 30_000 });

    // 2. I2: saldos de pacientes que ya existen, en un lote validado y vigente.
    //    En escritorio, el mismo archivo otra vez (el paciente sale como «Ya
    //    existe»); en móvil, un archivo sin ninguna fila importable
    //    (preparedRows = 0), que antes no dejaba pasar de la validación.
    const secondCsv =
      viewport.width >= 1024 ? patientsCsv : `Tipo Doc;Cédula;Nombre;Apellidos\nCC;${doc}9;;\n`;
    await validatePatients(page, origin, onlyBalancesFile, secondCsv);
    const result = page.getByRole('region', { name: 'Resultado de la validación' });
    await expect(result.getByRole('button', { name: 'Continuar' })).toBeVisible({ timeout: 30_000 });
    await expect(result).not.toContainText('No hay filas que importar');
    if (viewport.width < 1024) {
      await expect(result).toContainText(
        'No hay pacientes nuevos: puedes importar solo sus saldos en el paso siguiente.',
      );
    }
    await result.getByRole('button', { name: 'Continuar' }).click();
    await uploadBalances(
      page,
      `saldos-ajuste-${viewport.name}.csv`,
      `numero_documento;importe;moneda;fecha_antiguedad;concepto\n${doc};25.000;COP;;Ajuste de cartera\n`,
    );
    // QA D1: ya tiene un saldo migrado en COP del primer lote: por defecto no
    // se crea otro, y la fila dice cuál. Es otra deuda: se marca la casilla y
    // la misma hoja se vuelve a validar.
    const balanceIssues = page.getByRole('table', { name: 'Errores y avisos de la hoja de saldos' });
    await expect(balanceIssues).toContainText(
      // G1-B (DX-350): el importe con el formato de la sede de la demo (el mismo helper que la API).
      new RegExp(`ya tiene un saldo migrado vivo de ${escapeRegExp(regionalFormat(E2E_REGION).money(100_000, 'COP'))} \\(lote «${firstFile.replace(/[.]/g, '\\.')}» del \\d{2}/\\d{2}/\\d{4}`),
    );
    await expect(balanceIssues).toContainText('no se crea otro');
    await page.getByRole('checkbox', { name: 'Añadir aunque ya tenga saldo migrado' }).check();
    await expect(balanceIssues).toContainText('se añadirá otro', { timeout: 30_000 });
    await expect(balanceIssues).toContainText('Ya tenía saldo migrado');
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    const confirmOnlyBalances = page.getByRole('button', { name: 'Importar 1 saldo migrado' });
    await expect(confirmOnlyBalances).toBeVisible();
    await shoot(page, `dx262-solo-saldos-${viewport.name}`);
    await confirmOnlyBalances.click();
    await expect(page.getByText('Saldos migrados: 1 de 1')).toBeVisible({ timeout: 30_000 });

    // 3. C1: abono contra el saldo migrado desde el estado de cuenta.
    await page.goto(`${origin}/patients?query=${doc}`);
    await page
      .getByRole('link', { name: new RegExp(lastName) })
      .first()
      .click();
    await openPatientTab(page, 'Estado de cuenta');
    const panel = page.locator('#tabpanel-account-statement');
    const openings = panel.getByRole('table', { name: 'Saldos migrados' });
    await expect(openings).toBeVisible({ timeout: 15_000 });
    await expect(openings.getByRole('row')).toHaveCount(3);
    const summary = panel.getByRole('region', { name: 'Resumen en COP' });
    await expect(summary.getByTestId('balance')).toContainText('125.000,00');

    await panel.getByRole('button', { name: 'Registrar abono' }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
    await expect(dialog).toBeVisible();
    const target = dialog.getByLabel('Abonar a');
    await expect(target).toBeVisible({ timeout: 10_000 });
    const option = target.locator('option', { hasText: 'Cartera anterior' });
    await expect(option).toHaveText(/^Saldo migrado · Cartera anterior · pendiente COP\s100\.000,00/);
    await target.selectOption((await option.getAttribute('value')) ?? '');
    await expect(dialog.getByLabel('Moneda')).toBeDisabled();
    await expect(dialog).toContainText(/Pendiente: COP\s100\.000,00/);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // Pasarse de lo pendiente: no se registra y se dice en español.
    const submit = dialog.getByRole('button', { name: 'Registrar abono' });
    await dialog.getByLabel('Importe').fill('100000,01');
    await submit.click();
    await expect(dialog).toContainText(/El abono supera lo pendiente del saldo migrado: quedan COP\s100\.000,00/);

    await dialog.getByLabel('Importe').fill('40000');
    await dialog.getByLabel('Método').selectOption('CASH');
    await submit.click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Abono registrado' })).toBeVisible();

    const paidRow = openings.getByRole('row').filter({ hasText: 'Cartera anterior' });
    await expect(paidRow).toContainText('40.000,00', { timeout: 10_000 });
    await expect(paidRow).toContainText('60.000,00');
    await expect(summary.getByTestId('balance')).toContainText('85.000,00');
    const movements = panel.getByRole('table', { name: 'Movimientos (abonos)' });
    await expect(movements.getByRole('row').filter({ hasText: 'Saldo migrado · Cartera anterior' })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx262-abono-saldo-${viewport.name}`);

    // 4. Retirar saldos: el lote con abonos vivos se niega con un 409 claro…
    await page.goto(`${origin}/settings/importar-pacientes`);
    const history = page.getByRole('list', { name: 'Importaciones de la clínica' });
    const firstRow = history.getByRole('listitem').filter({ hasText: firstFile }).first();
    await firstRow.getByRole('button', { name: `Retirar los saldos migrados de ${firstFile}` }).click();
    const undoDialog = page.getByRole('dialog');
    await undoDialog.getByRole('button', { name: 'Retirar saldos' }).click();
    await expect(undoDialog).toContainText(
      'No se puede deshacer: 1 saldo migrado de este lote ya tiene abonos. Anula esos abonos antes de deshacer.',
    );
    await page.keyboard.press('Escape');
    await expect(undoDialog).toBeHidden();

    // …y el de I2, sin abonos, se retira (el paciente no se toca).
    const secondRow = history.getByRole('listitem').filter({ hasText: onlyBalancesFile }).first();
    await secondRow.getByRole('button', { name: `Retirar los saldos migrados de ${onlyBalancesFile}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Retirar saldos' }).click();
    await expect(page.getByText('Saldos migrados retirados.')).toBeVisible();
    await expect(secondRow.getByRole('button', { name: /Retirar los saldos migrados/ })).toHaveCount(0);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s');
}
