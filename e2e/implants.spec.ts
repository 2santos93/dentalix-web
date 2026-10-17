import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-191): registro de implantes, tarjeta imprimible y búsqueda por lote.
 *
 *   1. Odontograma → diente 36 → «Registrar implante»: el formulario abre con
 *      el diente puesto; se registra el implante y, desde la sección, el pilar.
 *   2. «Tarjeta de implante» abre la vista imprimible: nombre y documento del
 *      paciente, centro y los dos componentes; «Imprimir» registra la entrega;
 *      el PDF sale en UNA hoja en A4 y en carta.
 *   3. Ajustes → Implantes: el lote devuelve los dos pacientes que lo
 *      recibieron y se exporta a CSV.
 *   4. A 390 px no hay scroll horizontal (sección, formulario, tarjeta y
 *      búsqueda).
 *
 * Requiere API y web levantadas (ver playwright.config.ts y support/urls.ts).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-impl-${suffix}`;
const email = `test.user.impl.${suffix}@example.com`;
const password = 'Password123!';
const LOT = `LOT-${suffix}`.slice(0, 40).toUpperCase();

function api(request: APIRequestContext, origin: string, token: string) {
  const headers = { 'X-Tenant-Host': new URL(origin).host, Authorization: `Bearer ${token}` };
  return {
    async post<T>(path: string, data: object): Promise<T> {
      const res = await request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
  };
}

test('registrar desde el odontograma, imprimir la tarjeta y buscar por lote (1440 y 390)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Implantes ${suffix}`,
    fullName: 'Dra Implantes',
    email,
    password,
  });
  const admin = api(page.request, origin, await accessTokenOf(page));
  const newPatient = (firstName: string, doc: string) =>
    admin.post<{ id: string }>('/patients', {
      firstName,
      lastName: `Implante${suffix}`.slice(0, 40),
      docType: 'CC',
      docNumber: `${doc}${suffix}`.slice(0, 20),
      sex: 'F',
    });
  const patient = await newPatient('Lucía', 'IM1');
  const other = await newPatient('Mario', 'IM2');

  // --- 1. Desde el odontograma, con el diente puesto ---
  await page.goto(`${origin}/patients/${patient.id}?tab=odontogram&tooth=36`);
  await page.getByRole('link', { name: 'Registrar implante en el diente 36' }).click({
    timeout: 15_000,
  });
  const dialog = page.getByRole('dialog', { name: 'Registrar implante' });
  await expect(dialog.getByLabel('Diente (FDI)')).toHaveValue('36');
  await dialog.getByLabel('Fabricante').fill('Straumann');
  await dialog.getByLabel('Marca o sistema').fill('BLT');
  await dialog.getByLabel('Referencia (REF)').fill('021.5310');
  await dialog.getByLabel('Lote').fill(LOT);
  await dialog.getByLabel('Diámetro (mm)').fill('4,1');
  await dialog.getByLabel('Longitud (mm)').fill('10');
  await dialog.getByRole('button', { name: 'Registrar implante' }).click();
  await expect(dialog).toBeHidden();

  const panel = page.locator('#tabpanel-implants');
  const tooth36 = panel.getByRole('list', { name: 'Implantes del diente 36' });
  await expect(tooth36).toContainText('021.5310');
  await expect(tooth36).toContainText(LOT);

  // El pilar, desde la propia sección.
  await panel.getByRole('button', { name: 'Registrar implante' }).click();
  await dialog.getByLabel('Diente (FDI)').fill('36');
  await dialog.getByLabel('Tipo de componente').selectOption('ABUTMENT');
  await dialog.getByLabel('Fabricante').fill('Straumann');
  await dialog.getByLabel('Referencia (REF)').fill('RC-ABUT-4');
  await dialog.getByLabel('Lote').fill('LOT-PILAR-7');
  await dialog.getByRole('button', { name: 'Registrar implante' }).click();
  await expect(dialog).toBeHidden();
  await expect(tooth36.getByRole('listitem')).toHaveCount(2);

  // --- 2. Tarjeta imprimible: una hoja en A4 y en carta ---
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  const [cardPage] = await Promise.all([
    page.context().waitForEvent('page'),
    tooth36.getByRole('link', { name: /Tarjeta de implante/ }).first().click(),
  ]);
  const card = cardPage.getByRole('article');
  await expect(cardPage.getByRole('heading', { name: 'Tarjeta de implante' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(card).toContainText(`Lucía Implante${suffix}`.slice(0, 46));
  await expect(card).toContainText(`CC IM1${suffix}`.slice(0, 23));
  await expect(card).toContainText(`Clinica Implantes ${suffix}`);
  await expect(card).toContainText('021.5310');
  await expect(card).toContainText('RC-ABUT-4');
  await cardPage.getByRole('button', { name: 'Imprimir y registrar la entrega' }).click();
  await expect(card).toContainText('Tarjeta entregada al paciente el');
  await cardPage.emulateMedia({ media: 'print' });
  await expect(cardPage.getByRole('toolbar', { name: /tarjeta de implante/i })).toBeHidden();
  for (const format of ['A4', 'Letter'] as const) {
    const pdf = (await cardPage.pdf({ format })).toString('latin1');
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length, `páginas en ${format}`).toBe(1);
  }
  await cardPage.emulateMedia({ media: 'screen' });
  await cardPage.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(cardPage);
  await cardPage.close();

  // --- 3. Ajustes → Implantes: dos pacientes con el mismo lote ---
  await admin.post(`/patients/${other.id}/implants`, {
    toothNumber: '46',
    kind: 'IMPLANT',
    manufacturer: 'Straumann',
    reference: '021.5310',
    lot: LOT,
  });
  await page.goto(`${origin}/settings/implantes`);
  await page.getByLabel('Lote').fill(LOT);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByTestId('implant-lot-row')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByText('2 implantes encontrados')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`implantes-${LOT}.csv`);

  // --- 4. Móvil 390 px ---
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.goto(`${origin}/patients/${patient.id}?tab=implants`);
  await expect(panel.getByRole('list', { name: 'Implantes del diente 36' })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoHorizontalScroll(page);
  await panel.getByRole('button', { name: 'Registrar implante' }).click();
  await expect(dialog).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
});
