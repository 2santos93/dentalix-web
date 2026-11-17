import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, linkFromMail, mailFor, mailMark } from './support/mail';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-568: el resumen semanal por email para el dueño.
 *
 * 1. El ADMIN abre Ajustes › Resumen semanal (390 y 1440 px), lo activa, elige
 *    viernes a las 18:00 y a sí mismo como destinatario, guarda, y al recargar
 *    sigue así.
 * 2. «Enviarme una prueba»: el email llega al buzón de la suite con «[Prueba]»
 *    en el asunto, sin nombres de pacientes, y su enlace de «Cobrado» abre
 *    Comparar sedes con esa misma semana.
 * 3. Recepción no ve la pantalla (ni en el índice de Ajustes).
 * 4. La página pública de baja con un token inventado dice que el enlace no
 *    existe o caducó, a 390 px y sin sesión.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `resumen-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Marta Dueña', email: `marta.rs.${suffix}@example.com` };
const reception = { fullName: 'Rosa Recepción', email: `rosa.rs.${suffix}@example.com` };
const patientLast = `Resumen${suffix}`.slice(0, 40);

let session: ApiSession;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

async function openSettings(page: Page): Promise<void> {
  await page.goto(`${origin}/settings/resumen-semanal`);
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen semanal' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Enviar el resumen semanal', { exact: true })).toBeVisible({ timeout: 15_000 });
}

test.describe('Resumen semanal por email (DX-568)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    session = await registerClinicViaApi(request, {
      subdomain,
      clinicName: `Clínica Resumen ${suffix}`,
      fullName: admin.fullName,
      email: admin.email,
      password,
    });
    await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
    // Un paciente con nombre reconocible: no puede salir en el email.
    await apiPost(request, session, '/patients', {
      firstName: 'Gabriela',
      lastName: patientLast,
      docType: 'NATIONAL_ID',
      docNumber: `RS${suffix}`.slice(0, 20),
      sex: 'F',
    });
  });

  test('ADMIN: activa el resumen, elige día, hora y destinatario, y se conserva al recargar (390 y 1440)', async ({
    page,
  }) => {
    await loginAs(page, origin, admin.email, password);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await openSettings(page);
      await expectNoHorizontalScroll(page);
    }

    await page.getByLabel('Enviar el resumen semanal', { exact: true }).check();
    await expect(page.getByTestId('weekly-digest-no-recipients')).toBeVisible();
    await page.getByLabel('Día', { exact: true }).selectOption('5');
    await page.getByLabel('Hora', { exact: true }).selectOption('18');
    await page.getByLabel(admin.fullName, { exact: true }).check();
    await expect(page.getByTestId('weekly-digest-no-recipients')).toHaveCount(0);
    await expect(page.getByTestId('weekly-digest-when')).toContainText('Llega cada viernes a las 18:00');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Resumen semanal guardado.')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByLabel('Enviar el resumen semanal', { exact: true })).toBeChecked({ timeout: 15_000 });
    await expect(page.getByLabel('Día', { exact: true })).toHaveValue('5');
    await expect(page.getByLabel('Hora', { exact: true })).toHaveValue('18');
    await expect(page.getByLabel(admin.fullName, { exact: true })).toBeChecked();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll(page);
    }
  });

  test('«Enviarme una prueba»: llega con «[Prueba]», sin pacientes, y su enlace abre Comparar sedes con esa semana', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, admin.email, password);
    await openSettings(page);
    const since = mailMark();
    await page.getByRole('button', { name: 'Enviarme una prueba' }).click();
    await expect(page.getByText(/^Te enviamos la prueba a .+\*\*\*@/)).toBeVisible({ timeout: 15_000 });

    const link = await linkFromMail(
      admin.email,
      /(https?:\/\/\S+\/reportes\?tab=comparar-sedes&periodo=custom&desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2})/,
      { since },
    );
    const email = await mailFor(admin.email, /comparar-sedes/, { since });
    expect(email.subject).toMatch(/^\[Prueba\] Resumen semanal de Clínica Resumen /);
    expect(email.text).toContain('Cobrado');
    expect(email.text).toContain('Citas atendidas');
    expect(email.text).not.toContain('Gabriela');
    expect(email.text).not.toContain(patientLast);
    // La prueba no lleva enlace de baja.
    expect(email.text).not.toContain('/resumen/baja/');
    expect(new URL(link).origin).toBe(origin);

    const url = new URL(link);
    const from = url.searchParams.get('desde')!;
    const to = url.searchParams.get('hasta')!;
    const report = page.waitForResponse(
      (res) =>
        res.url().includes('/reports/locations-comparison?') &&
        new URL(res.url()).searchParams.get('from') === from &&
        new URL(res.url()).searchParams.get('to') === to,
      { timeout: 20_000 },
    );
    await page.goto(link);
    expect((await report).ok()).toBeTruthy();
    await expect(page.getByLabel('Período', { exact: true })).toHaveValue('custom');
    await expect(page.getByRole('group', { name: 'Fechas' })).toBeVisible();
  });

  test('Recepción no ve el resumen semanal', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, reception.email, password);
    await page.goto(`${origin}/settings`);
    await expect(page.getByRole('link', { name: /^Mi perfil/ }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /^Resumen semanal/ })).toHaveCount(0);
    await page.goto(`${origin}/settings/resumen-semanal`);
    await expect(page.getByText('Solo administración gestiona el resumen semanal.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Enviar el resumen semanal', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enviarme una prueba' })).toHaveCount(0);
  });

  test('baja con un token inventado: «El enlace no existe o caducó» a 390 px, sin sesión', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(`${origin}/resumen/baja/${'x'.repeat(43)}`);
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.getByRole('heading', { level: 1, name: 'El enlace no existe o caducó' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Dejar de recibir el resumen' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});
