import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-403): captura del periodontograma por teclado, a 1440 y 390 px.
 *
 *   1. Recorrido en S: cinco dígitos desde el 28 MB llenan el 28 vestibular y
 *      siguen por el 28 PALATINO (antes saltaba al 18); del 18 palatino baja
 *      al 48 lingual.
 *   2. Una «B» justo tras un dígito marca el sitio recién sondeado, no la
 *      celda a la que ya saltó el foco.
 *   3. El 18, ausente en el odontograma («Diente ausente» del catálogo
 *      semilla), sale omitido y el autoavance no le da el foco; «Incluir
 *      diente 18» lo devuelve.
 *   4. La ayuda lista todas las teclas y no hay scroll horizontal de página.
 *
 * Requiere API y web levantadas (ver playwright.config.ts y support/urls.ts).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

function api(request: APIRequestContext, origin: string, token: string) {
  const headers = { 'X-Tenant-Host': new URL(origin).host, Authorization: `Bearer ${token}` };
  return {
    async post<T>(path: string, data: object): Promise<T> {
      const res = await request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    async get<T>(path: string): Promise<T> {
      const res = await request.get(`${API_URL}${path}`, { headers });
      expect(res.ok(), `GET ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
  };
}

for (const viewport of VIEWPORTS) {
  test(`recorrido en S, marcas tras un dígito y ausentes omitidos (${viewport.width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const tag = `${viewport.width}${suffix}`.slice(0, 24);
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-perio-s-${tag}`,
      clinicName: `Clinica Perio S ${tag}`,
      fullName: 'Dra Sondaje',
      email: `test.user.perio.s.${tag}@example.com`,
      password,
    });
    const admin = api(page.request, origin, await accessTokenOf(page));
    const patient = await admin.post<{ id: string }>('/patients', {
      firstName: 'Rosa',
      lastName: `Sondaje${tag}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `PS${tag}`.slice(0, 20),
      sex: 'F',
    });
    // El 18 falta: «Diente ausente» (DX-AUSENTE) del catálogo semilla de la clínica.
    const catalog = await admin.get<{ id: string; code: string }[]>('/catalog/items');
    const absentItem = catalog.find((item) => item.code === 'DX-AUSENTE');
    expect(absentItem, 'el catálogo semilla trae «Diente ausente»').toBeTruthy();
    await admin.post(`/patients/${patient.id}/tooth-records`, {
      toothNumber: '18',
      surfaces: [],
      kind: 'DIAGNOSIS',
      catalogItemId: absentItem!.id,
      status: 'COMPLETED',
    });

    await page.goto(`${origin}/patients/${patient.id}?tab=perio`);
    const panel = page.locator('#tabpanel-perio');
    await panel.getByRole('button', { name: 'Nuevo examen' }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Nuevo examen periodontal' });
    await dialog.getByRole('button', { name: 'Crear examen' }).click();
    await expect(dialog).toBeHidden();
    const upper = panel.getByRole('table', { name: 'Arcada superior' });
    const lower = panel.getByRole('table', { name: 'Arcada inferior' });
    const cell = (table: typeof upper, name: string) => table.getByRole('textbox', { name, exact: true });

    // --- 3 (antes que nada: el resto del recorrido cuenta con él). El 18 sale omitido ---
    const include18 = upper.getByRole('button', { name: 'Incluir diente 18' });
    await expect(include18).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(panel.getByText(/Omitidos por estar ausentes en el odontograma: 18\./)).toBeVisible();

    // --- 1. Recorrido en S: 5 valores desde el 28 MB ---
    await cell(upper, 'Sondaje 28 MB').click();
    await page.keyboard.type('12345');
    await expect(cell(upper, 'Sondaje 28 MB')).toHaveValue('1');
    await expect(cell(upper, 'Sondaje 28 B')).toHaveValue('2');
    await expect(cell(upper, 'Sondaje 28 DB')).toHaveValue('3');
    await expect(cell(upper, 'Sondaje 28 DP')).toHaveValue('4');
    await expect(cell(upper, 'Sondaje 28 P')).toHaveValue('5');
    await expect(cell(upper, 'Sondaje 28 MP')).toBeFocused();
    await expect(cell(upper, 'Sondaje 18 MP')).toHaveValue('');

    // --- 3. El 18 ausente no recibe foco: del 17 palatino se baja al 48 lingual ---
    await cell(upper, 'Sondaje 17 MP').click();
    await page.keyboard.type('323');
    await expect(cell(lower, 'Sondaje 48 DL')).toBeFocused();
    for (const site of ['MP', 'P', 'DP']) {
      await expect(cell(upper, `Sondaje 18 ${site}`)).toHaveValue('');
    }

    // --- 2. «B» tras un dígito: el sitio recién sondeado ---
    await cell(upper, 'Sondaje 16 DB').click();
    await page.keyboard.type('5');
    await expect(cell(upper, 'Sondaje 16 B')).toBeFocused();
    await page.keyboard.press('b');
    await expect(upper.getByRole('button', { name: 'Sangrado 16 DB' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(upper.getByRole('button', { name: 'Sangrado 16 B' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(cell(upper, 'Sondaje 16 B')).toBeFocused();

    // Guardar y recargar: la omisión del 18 y las marcas quedan en el examen.
    await panel.getByRole('button', { name: 'Guardar' }).click();
    await expect(panel.getByText('Cambios guardados')).toBeVisible();
    await page.reload();
    await panel.getByRole('button', { name: /Abrir examen del/ }).click({ timeout: 15_000 });
    await expect(upper.getByRole('button', { name: 'Sangrado 16 DB' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(cell(upper, 'Sondaje 28 P')).toHaveValue('5');
    await expect(include18).toHaveAttribute('aria-pressed', 'true');

    // «Incluir diente 18» deshace la omisión: el recorrido vuelve a pasar por él.
    await include18.click();
    await expect(upper.getByRole('button', { name: 'Omitir diente 18' })).toBeVisible();
    await cell(upper, 'Sondaje 17 DP').click();
    await page.keyboard.type('2');
    await expect(cell(upper, 'Sondaje 18 MP')).toBeFocused();

    // --- 4. Ayuda completa y sin scroll horizontal de página ---
    const help = panel.getByRole('region', { name: 'Teclado' });
    await expect(help).toContainText('Cálculo.');
    await expect(help).toContainText('Recorrido en S');
    await expectNoHorizontalScroll(page);
  });
}
