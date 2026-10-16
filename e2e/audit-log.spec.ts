import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-009): registro de auditoría para ADMIN.
 *
 * Registra una clínica (su dueño es ADMIN) y, por la API real, crea un
 * paciente, guarda su historia clínica (con una alergia), registra una
 * evolución y lee la historia: cada paso deja un evento. Después, en la web:
 *   - «Auditoría» en el menú de cuenta abre /settings/auditoria con la tabla
 *     (fecha y hora, usuario, rol, acción, recurso, paciente, origen) y sin
 *     contenido clínico;
 *   - filtrar por acción deja solo esa acción; un período sin eventos muestra
 *     el vacío; «Limpiar filtros» vuelve a la lista;
 *   - la ficha del paciente tiene la pestaña «Accesos» con los de esa ficha.
 * Además, un rol que no es ADMIN (dentista de la demo) no ve la entrada y, si
 * entra por URL, la pantalla le explica que es solo para administración.
 * En escritorio (1440px) y móvil (390px, sin scroll horizontal).
 *
 * Requiere la API con la demo sembrada y la web (ver `playwright.config.ts`).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const adminName = 'Ada Auditora';
const ALLERGY = 'Penicilina-E2E-DX009';
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';
const DENTIST_NAME = process.env.E2E_DEMO_DENTIST_NAME ?? 'Andrés Gómez Pérez';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

async function seed(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  lastName: string,
  tag: string,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function send<T>(method: 'post' | 'put' | 'get', path: string, data?: object): Promise<T> {
    const res = await request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  const patient = await send<{ id: string }>('post', '/patients', {
    firstName: 'Paula',
    lastName,
    docType: 'CC',
    docNumber: `AU${tag}`.slice(0, 20),
    sex: 'F',
  });
  await send('put', `/patients/${patient.id}/medical-history`, {
    allergies: [{ alergeno: ALLERGY, tipo: 'MEDICAMENTO', severidad: 'MODERADA', esAlerta: true }],
  });
  await send('post', `/patients/${patient.id}/clinical-entries`, {
    reason: 'Control',
    notes: 'Evolución de prueba',
  });
  await send('get', `/patients/${patient.id}/medical-history`);
  return patient.id;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

function accountButton(page: Page, width: number) {
  // Escritorio: tarjeta del pie del sidebar con el nombre; móvil: avatar del topbar.
  return width < 768
    ? page.getByRole('button', { name: 'Cuenta' })
    : page.getByRole('button', { name: new RegExp(adminName) });
}

for (const viewport of VIEWPORTS) {
  test(`ADMIN consulta la auditoría con filtros, vacío y la pestaña Accesos (${viewport.name})`, async ({
    page,
  }) => {
    // Recorre cuatro pantallas; en `next dev` la primera visita compila cada una.
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const lastName = `Auditada${tag}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-audit-${tag}`,
      clinicName: `Clinica Auditoria ${tag}`,
      fullName: adminName,
      email: `test.user.audit.${tag}@example.com`,
      password,
    });
    const patientId = await seed(page.request, origin, await accessTokenOf(page), lastName, tag);

    // Entrada del menú de cuenta, solo para ADMIN.
    await page.goto(`${origin}/patients`);
    await accountButton(page, viewport.width).click();
    await page.getByRole('menuitem', { name: 'Auditoría' }).click();
    await expect(page).toHaveURL(/\/settings\/auditoria$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();

    const table = page.getByRole('table', { name: 'Registro de auditoría' });
    await expect(table).toBeVisible({ timeout: 15_000 });
    await expect(table.getByText('Inicio de sesión').first()).toBeVisible();
    await expect(table.getByText('Historia clínica').first()).toBeVisible();
    await expect(table.getByRole('link', { name: `Paula ${lastName}` }).first()).toBeVisible();
    await expect(table.getByText('Administrador/a').first()).toBeVisible();
    // Nunca contenido clínico, solo quién, qué y cuándo.
    await expect(page.getByText(ALLERGY)).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // Filtrar por acción: solo altas.
    await page.getByLabel('Acción').selectOption({ label: 'Alta' });
    await expect(table.getByText('Consulta')).toHaveCount(0, { timeout: 10_000 });
    await expect(table.getByText('Alta').first()).toBeVisible();
    await expect(table.getByText('Evolución').first()).toBeVisible();

    // Un período sin eventos: vacío que enseña qué hacer.
    await page.getByLabel('Desde').fill('2020-01-01');
    await page.getByLabel('Hasta').fill('2020-01-02');
    await expect(page.getByText('No hay eventos con estos filtros.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(table).toBeVisible();
    await expect(table.getByText('Inicio de sesión').first()).toBeVisible();

    // Pestaña «Accesos» de la ficha: los de este paciente.
    await page.goto(`${origin}/patients/${patientId}?tab=access-log`);
    await expect(page.getByRole('tab', { name: 'Accesos' })).toHaveAttribute('aria-selected', 'true');
    const accesses = page.getByRole('table', { name: 'Accesos a la ficha' });
    await expect(accesses).toBeVisible({ timeout: 15_000 });
    await expect(accesses.getByText('Historia clínica').first()).toBeVisible();
    await expect(accesses.getByText('Ficha del paciente').first()).toBeVisible();
    await expect(accesses.getByText('Inicio de sesión')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
}

test('un rol que no es ADMIN no ve la auditoría (dentista de la demo)', async ({ page }) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Correo electrónico').fill(DENTIST_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/patients$/, { timeout: 15_000 });

  await page.getByRole('button', { name: new RegExp(DENTIST_NAME) }).click();
  await expect(page.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Auditoría' })).toHaveCount(0);

  await page.goto(`${origin}/settings/auditoria`);
  await expect(
    page.getByText('Solo la administración de la clínica puede ver la auditoría.'),
  ).toBeVisible({ timeout: 15_000 });
});
