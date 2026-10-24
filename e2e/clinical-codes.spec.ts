import { test, expect, type Page } from './support/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-212, DX-318, DX-320): códigos clínicos de la evolución.
 *
 * Una clínica nueva con un paciente y un procedimiento hecho hoy en el
 * odontograma. En la ficha:
 *   - «Nueva evolución» con diagnóstico principal K02.1 (buscando «caries») y
 *     relacionado K05.1 en el 36: la evolución los muestra con código y texto;
 *   - DX-318: no hay chip «RDA» ni la ficha pide datos del RDA a la API;
 *   - DX-320: el catálogo no tiene columna ni campo «Código CUPS»;
 *   - el REPS se sigue guardando en Ajustes › Sedes.
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

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
 for (const scheme of ['light', 'dark'] as const) {
  test(`evolución con CIE-10, sin chip RDA ni CUPS en el catálogo (${viewport.name}, ${scheme})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    const rdaRequests: string[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname.includes('/rda-readiness')) rdaRequests.push(req.url());
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: scheme });
    const tag = `${suffix}${viewport.width}${scheme[0]}`;
    const shots = process.env.DX232_QA_DIR;
    if (shots) mkdirSync(shots, { recursive: true });
    async function shot(name: string) {
      if (shots) await page.screenshot({ path: join(shots, `${viewport.width}-${scheme}-${name}.png`) });
    }
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-cie-${tag}`,
      clinicName: `Clinica CIE ${tag}`,
      fullName: 'Rosa Diagnóstico',
      email: `test.user.cie.${tag}@example.com`,
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
    const patient = await api<{ id: string }>('post', '/patients', {
      firstName: 'Lucía',
      lastName: `Cie${tag}`,
      docType: 'CC',
      docNumber: `CIE${tag}`.slice(0, 20),
      sex: 'F',
    });
    const procedures = await api<{ id: string }[]>('get', '/catalog/items?kind=PROCEDURE');
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

    // 2. La ficha muestra los diagnósticos y ningún chip RDA (DX-318).
    const diagnoses = page.getByRole('list', { name: /Diagnósticos de la evolución del/ }).locator('visible=true');
    await expect(diagnoses).toContainText('K02.1');
    await expect(diagnoses).toContainText('Caries de la dentina');
    await expect(diagnoses).toContainText('K05.1');
    await expect(diagnoses).toContainText('diente 36');
    await expect(page.getByText(/\bRDA\b/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot('ficha');

    // 3. DX-320: el catálogo no muestra ni pide código CUPS.
    await page.goto(`${origin}/catalog?item=${procedure.id}`);
    const edit = page.getByRole('dialog', { name: 'Editar ítem' });
    await expect(edit).toBeVisible({ timeout: 15_000 });
    await expect(edit.getByLabel(/CUPS/i)).toHaveCount(0);
    await expect(edit.getByText(/CUPS/i)).toHaveCount(0);
    await edit.getByRole('button', { name: 'Cancelar' }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByRole('columnheader', { name: /CUPS/i })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot('catalogo');

    // 4. REPS en Ajustes › Sedes (no cambia con DX-318).
    await page.goto(`${origin}/settings/sedes`);
    const reps = page.getByLabel(/Código de habilitación \(REPS\) · Sede principal/);
    await reps.fill('110010123401');
    await page.getByRole('button', { name: 'Guardar el código REPS de Sede principal' }).click();
    await expect(page.getByText('Guardado')).toBeVisible();
    await expectNoHorizontalScroll(page);

    expect(rdaRequests, 'la web ya no pide datos del RDA').toEqual([]);
    expect(consoleErrors, 'errores en la consola del navegador').toEqual([]);
  });
}

}
