import { test, expect, type Page } from './support/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-212): códigos para el Resumen Digital de Atención.
 *
 * Una clínica nueva (sede principal en Colombia) con un paciente con
 * documento, el registro profesional del ADMIN y un procedimiento hecho hoy en
 * el odontograma con un ítem del catálogo SIN CUPS. En la ficha:
 *   - «Nueva evolución» con diagnóstico principal K02.1 (buscando «caries») y
 *     relacionado K05.1 en el 36: la evolución los muestra con código y texto;
 *   - el chip dice «RDA: falta 1 dato» y su lista enlaza a completarlo;
 *   - el CUPS se completa en el catálogo desde «Completar» (DX-319: la sede
 *     ya no tiene REPS);
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
 for (const scheme of ['light', 'dark'] as const) {
  test(`evolución con CIE-10 → «RDA: listo» tras completar el CUPS (${viewport.name}, ${scheme})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: scheme });
    const tag = `${suffix}${viewport.width}${scheme[0]}`;
    const shots = process.env.DX232_QA_DIR;
    if (shots) mkdirSync(shots, { recursive: true });
    async function shot(name: string) {
      if (shots) await page.screenshot({ path: join(shots, `${viewport.width}-${scheme}-${name}.png`) });
    }
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
    const chip = page.getByRole('button', { name: 'RDA: falta 1 dato' }).locator('visible=true');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();
    const missing = page.getByRole('list', { name: 'Datos que faltan para el RDA' }).locator('visible=true');
    await expect(missing).toContainText(`Código CUPS de «${procedure.labelEs}»`);
    await expect(page.getByText('NIT de la clínica: pendiente de DX-019.').locator('visible=true')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot('faltan');

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

    // 4. Abrir40 evoluciones produce un único lote y conserva carga/error/retry.
    for (let i = 0; i < 39; i++) {
      await api('post', `/patients/${patient.id}/clinical-entries`, { notes: `Control QA ${i}`, diagnoses: [{ icd10Code: 'K02.1', kind: 'PRINCIPAL' }] });
    }
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let count = 0;
    const batchPattern = '**/patients/*/clinical-entries/rda-readiness?*';
    await page.route(batchPattern, async (route) => {
      count++;
      expect(new URL(route.request().url()).searchParams.get('ids')!.split(',')).toHaveLength(40);
      await held;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA temporal' }) });
    });
    await page.goto(`${origin}/patients/${patient.id}?tab=clinical-history`);
    await expect(page.getByRole('status', { name: 'Comprobando datos del RDA' }).locator('visible=true').first()).toBeVisible();
    await page.getByRole('status', { name: 'Comprobando datos del RDA' }).locator('visible=true').first().scrollIntoViewIfNeeded();
    await shot('carga');
    release();
    await expect(page.getByText('RDA no disponible').locator('visible=true').first()).toBeVisible();
    await page.getByText('RDA no disponible').locator('visible=true').first().scrollIntoViewIfNeeded();
    await shot('error');
    expect(count).toBe(1);
    await page.unroute(batchPattern);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).locator('visible=true').first().click();
    await expect(page.getByText('RDA: listo').locator('visible=true').first()).toBeVisible();
    // Nueva apertura,40 evoluciones listas en una única petición real.
    const requests: string[] = [];
    page.on('request', (req) => { if (req.url().includes('/rda-readiness')) requests.push(req.url()); });
    await page.reload();
    await expect(page.getByText('RDA: listo').locator('visible=true').first()).toBeVisible({ timeout: 15_000 });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]).searchParams.get('ids')!.split(',')).toHaveLength(40);
    await expectNoHorizontalScroll(page);
    await page.getByText('RDA: listo').locator('visible=true').first().scrollIntoViewIfNeeded();
    await shot('listo');

    // El503 es intencional; ningún error JS ni otro fallo de consola.
    expect(consoleErrors.filter((error) => !error.includes('503')), 'errores en la consola del navegador').toEqual([]);
  });
}

}
