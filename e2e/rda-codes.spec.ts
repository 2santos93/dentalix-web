import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-212): códigos para el Resumen Digital de Atención.
 *
 * Una clínica nueva (sede principal en Colombia, sin REPS) con un paciente con
 * documento, el registro profesional del ADMIN y un procedimiento hecho hoy en
 * el odontograma con un ítem del catálogo SIN CUPS. En la ficha:
 *   - «Nueva evolución» con diagnóstico principal K02.1 (buscando «caries») y
 *     relacionado K05.1 en el 36: la evolución los muestra con código y texto;
 *   - el chip dice «RDA: faltan 2 datos» y su lista enlaza a completarlos;
 *   - el CUPS se completa en el catálogo desde «Completar» y el REPS en
 *     Ajustes › Sedes;
 *   - de vuelta en la ficha, el chip dice «RDA: listo».
 * En escritorio (1440px) y móvil (390px), sin scroll horizontal ni errores en
 * la consola del navegador.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

interface CatalogItem {
  id: string;
  labelEs: string;
}

function subOf(token: string): string {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return (JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { sub: string }).sub;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
  test(`evolución con CIE-10 → «RDA: listo» tras completar CUPS y REPS (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-rda-${tag}`,
      clinicName: `Clinica RDA ${tag}`,
      fullName: 'Rosa Diagnóstico',
      email: `test.user.rda.${tag}@example.com`,
      password,
    });
    const token = await accessTokenOf(page);
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Host': new URL(origin).host };
    async function api<T>(method: 'get' | 'post' | 'patch', path: string, data?: object): Promise<T> {
      const res = await page.request[method](`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    }

    // Datos de partida por la API real.
    await api('patch', `/staff/${subOf(token)}`, { professionalLicense: 'TP 52-1234-19' });
    const patient = await api<{ id: string }>('post', '/patients', {
      firstName: 'Lucía',
      lastName: `Rda${tag}`,
      docType: 'CC',
      docNumber: `RDA${tag}`.slice(0, 20),
      sex: 'F',
    });
    const procedures = await api<CatalogItem[]>('get', '/catalog/items?kind=PROCEDURE');
    const procedure = procedures[0];
    await api('post', `/patients/${patient.id}/tooth-records`, {
      toothNumber: '36',
      surfaces: ['OCCLUSAL'],
      kind: 'PROCEDURE',
      catalogItemId: procedure.id,
      status: 'COMPLETED',
    });

    // 1. «Nueva evolución» con diagnóstico principal y relacionado.
    await page.goto(`${origin}/patients/${patient.id}?tab=clinical-history`);
    await page.getByRole('button', { name: 'Nueva evolución' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva evolución' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Texto de la evolución' }).fill('Resina oclusal en 36.');
    const principal = dialog.getByRole('combobox', { name: 'Diagnóstico principal (CIE-10)' });
    await principal.fill('caries');
    await dialog.getByRole('option', { name: /K02\.1 Caries de la dentina/ }).click();
    await expect(dialog.getByText('Caries de la dentina')).toBeVisible();
    await dialog.getByRole('button', { name: 'Añadir relacionado' }).click();
    const related = dialog.getByRole('combobox', { name: 'Diagnóstico relacionado 1' });
    await related.fill('zzzz');
    await expect(dialog.getByText('Sin coincidencias')).toBeVisible();
    await related.fill('K05');
    // Con el teclado: flechas e Intro.
    await expect(dialog.getByRole('option', { name: /K05\.1 Gingivitis crónica/ })).toBeVisible();
    await related.press('ArrowDown');
    await related.press('ArrowDown');
    await related.press('Enter');
    await expect(dialog.getByText('Gingivitis crónica')).toBeVisible();
    await dialog.getByRole('textbox', { name: /Diente \(FDI\) · Diagnóstico relacionado 1/ }).fill('36');
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Guardar evolución' }).click();
    await expect(dialog).toBeHidden();

    // 2. La ficha muestra los diagnósticos y el chip con lo que falta.
    const diagnoses = page.getByRole('list', { name: /Diagnósticos de la evolución del/ }).locator('visible=true');
    await expect(diagnoses).toContainText('K02.1');
    await expect(diagnoses).toContainText('Caries de la dentina');
    await expect(diagnoses).toContainText('K05.1');
    await expect(diagnoses).toContainText('diente 36');
    const chip = page.getByRole('button', { name: 'RDA: faltan 2 datos' }).locator('visible=true');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();
    const missing = page.getByRole('list', { name: 'Datos que faltan para el RDA' }).locator('visible=true');
    await expect(missing).toContainText(`Código CUPS de «${procedure.labelEs}»`);
    await expect(missing).toContainText('Código de habilitación (REPS) de «Sede principal»');
    await expect(page.getByText('NIT de la clínica: pendiente de DX-019.').locator('visible=true')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // 3. CUPS desde «Completar» (abre el ítem en el catálogo).
    await missing.getByRole('link', { name: `Completar: Código CUPS de «${procedure.labelEs}»` }).click();
    const edit = page.getByRole('dialog', { name: 'Editar ítem' });
    await expect(edit).toBeVisible({ timeout: 15_000 });
    await edit.getByLabel('Código CUPS').fill('89-20');
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(edit.getByText(/6 caracteres alfanuméricos/).first()).toBeVisible();
    await edit.getByLabel('Código CUPS').fill('232101');
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByText('232101').locator('visible=true').first()).toBeVisible();

    // 4. REPS en Ajustes › Sedes.
    await page.goto(`${origin}/settings/sedes`);
    const reps = page.getByLabel(/Código de habilitación \(REPS\) · Sede principal/);
    await reps.fill('110010123401');
    await page.getByRole('button', { name: 'Guardar el código REPS de Sede principal' }).click();
    await expect(page.getByText('Guardado')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // 5. De vuelta en la ficha: «RDA: listo».
    await page.goto(`${origin}/patients/${patient.id}?tab=clinical-history`);
    await expect(page.getByText('RDA: listo').locator('visible=true')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);

    expect(consoleErrors, 'errores en la consola del navegador').toEqual([]);
  });
}
