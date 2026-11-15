import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { accessTokenOf, loginAs, registerAndLogin } from './support/auth';
import { addStaffViaApi, registerClinicViaApi } from './support/api';
import { API_URL } from './support/urls';
import { openPatientTab } from './support/patient-tabs';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-408): Ajustes › Anestésicos, el catálogo de anestésicos de la
 * clínica (API de DX-307).
 *
 * - El ADMIN entra desde el índice de Ajustes; el catálogo vacío ofrece
 *   «Cargar sugeridos» (los 5 de la API), da de alta uno, lo edita (el modal
 *   avisa de que lo registrado no cambia) y lo desactiva.
 * - El desactivado no sale en el selector del modal de anestesia de una
 *   evolución; los activos sí.
 * - Un DENTIST no ve la entrada en Ajustes y, si abre la URL, solo un aviso.
 * A 1440 y 390 px, sin scroll horizontal.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

const NEW_NAME = 'Lidocaína 2 % sin vasoconstrictor';

/** Paciente con una evolución, por la API real, para abrir el modal de anestesia. */
async function seedEntry(page: Page, origin: string, tag: string) {
  const headers = {
    Authorization: `Bearer ${await accessTokenOf(page)}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await page.request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Elena',
    lastName: `Catalogo${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `AC${tag}`.slice(0, 20),
    sex: 'F',
    birthDate: '1990-05-10',
  });
  await post(`/patients/${patient.id}/clinical-entries`, {
    reason: 'Obturación',
    notes: `Obturación de 36 (${tag})`,
  });
  return patient.id;
}

for (const viewport of VIEWPORTS) {
  test(`ADMIN: carga sugeridos, da de alta, edita y desactiva un anestésico (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-anestesicos-${tag}`,
      clinicName: `Clinica Anestesicos ${tag}`,
      fullName: 'Ada Anestésicos',
      email: `test.user.anestesicos.${tag}@example.com`,
      password,
    });

    // Desde el índice de Ajustes, en «Historia clínica».
    await page.goto(`${origin}/settings`);
    const index = page.getByRole('main').getByRole('list', { name: 'Historia clínica' });
    await index.getByRole('link', { name: /^Anestésicos/ }).click();
    await expect(page).toHaveURL(`${origin}/settings/anestesicos`);
    await expect(page.getByRole('heading', { level: 1, name: 'Anestésicos' })).toBeVisible({ timeout: 15_000 });

    // Vacío: «Cargar sugeridos» crea los 5 de la API.
    await expect(page.getByText('Todavía no hay anestésicos en el catálogo.')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Cargar sugeridos' }).click();
    const list = page.getByRole('main').getByLabel('Anestésicos', { exact: true });
    await expect(list).toContainText('Articaína 4 % con epinefrina 1:100.000', { timeout: 15_000 });
    await expect(page.getByText('5 anestésicos')).toBeVisible();
    // Concentración, vasoconstrictor, carpule, mg/kg y tope absoluto a la vista.
    for (const text of ['Epinefrina 1:100.000', '1,8 ml', '7 mg/kg', '500 mg']) {
      await expect(list.getByText(text).first()).toBeVisible();
    }
    await expectNoHorizontalScroll(page);

    // Alta con validación en español.
    await page.getByRole('button', { name: 'Nuevo anestésico' }).click();
    let dialog = page.getByRole('dialog', { name: 'Nuevo anestésico' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Añadir anestésico' }).click();
    await expect(dialog.getByText('Escribe el nombre comercial o de presentación.')).toBeVisible();
    await dialog.getByLabel('Nombre', { exact: true }).fill(NEW_NAME);
    await dialog.getByLabel('Principio activo').fill('Lidocaína');
    await dialog.getByLabel('Concentración (%)').fill('2');
    await dialog.getByLabel('Volumen del carpule (ml)').fill('1,8');
    await dialog.getByLabel('Dosis máxima (mg/kg)').fill('25');
    await dialog.getByLabel('Tope absoluto (mg)').fill('300');
    await dialog.getByRole('button', { name: 'Añadir anestésico' }).click();
    await expect(dialog.getByText('Escribe un número entre 0,1 y 20, con hasta 2 decimales.')).toBeVisible();
    await dialog.getByLabel('Dosis máxima (mg/kg)').fill('4,4');
    await dialog.getByRole('button', { name: 'Añadir anestésico' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(list).toContainText(NEW_NAME);
    await expect(page.getByText('6 anestésicos')).toBeVisible();

    // Edición: el aviso de que lo registrado no cambia.
    await list.getByRole('button', { name: `Acciones de ${NEW_NAME}` }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    dialog = page.getByRole('dialog', { name: 'Editar anestésico' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/no cambia las anestesias ya registradas/)).toBeVisible();
    await dialog.getByLabel('Tope absoluto (mg)').fill('250');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(list).toContainText('250 mg');

    // Desactivar: queda «Inactivo» en la lista.
    await list.getByRole('button', { name: `Acciones de ${NEW_NAME}` }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await expect(list.getByText('Inactivo')).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);

    // El desactivado no sale en el modal de anestesia; los activos sí.
    const patientId = await seedEntry(page, origin, tag);
    await page.goto(`${origin}/patients/${patientId}`);
    await openPatientTab(page, 'Historia clínica');
    await page
      .getByRole('button', { name: /Anestesia de la evolución del/ })
      .locator('visible=true')
      .click();
    const anesthesia = page.getByRole('dialog', { name: 'Anestesia local' });
    const select = anesthesia.getByLabel('Anestésico');
    await expect(select).toBeVisible({ timeout: 15_000 });
    const options = await select.locator('option').allTextContents();
    expect(options.some((o) => o.startsWith('Articaína 4 %'))).toBe(true);
    expect(options.some((o) => o.startsWith(NEW_NAME))).toBe(false);
  });
}

test('DENTIST: no ve «Anestésicos» en Ajustes y la URL solo muestra un aviso', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const tag = `${suffix}d`;
  const dentist = { fullName: 'Odontóloga Catálogo', email: `anestesicos.odonto.${tag}@example.com` };
  const api = await playwright.request.newContext();
  let origin: string;
  try {
    const session = await registerClinicViaApi(api, {
      subdomain: `anestesicos-${tag}`,
      clinicName: `Clínica Catálogo ${tag}`,
      fullName: 'Dueña Catálogo',
      email: `anestesicos.admin.${tag}@example.com`,
      password,
    });
    origin = session.origin;
    await addStaffViaApi(api, session, { ...dentist, role: 'DENTIST', password });
  } finally {
    await api.dispose();
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (viewport.width === VIEWPORTS[0].width) await loginAs(page, origin, dentist.email, password);
    await page.goto(`${origin}/settings`);
    await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('main').getByRole('link', { name: /^Mi perfil/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Anestésicos/ })).toHaveCount(0);

    await page.goto(`${origin}/settings/anestesicos`);
    await expect(page.getByText('Solo administración gestiona el catálogo de anestésicos.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Nuevo anestésico' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }
});
