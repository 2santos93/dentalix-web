import { randomUUID } from 'node:crypto';
import { test, expect, type Locator, type Page } from './support/test';
import { addStaffViaApi, registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, mailFor, mailMark } from './support/mail';
import { shot } from './support/qa-shot';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-565: Ajustes › Mensajes, los textos de los mensajes al paciente.
 *
 * 1. El ADMIN abre la lista (390 y 1440 px, claro y oscuro, axe): el
 *    recordatorio sale «Por defecto».
 * 2. Edita el recordatorio en español (asunto y cuerpo con {paciente} y
 *    {fecha}), ve la vista previa con los datos de ejemplo y guarda: queda
 *    «Personalizado».
 * 3. «Enviarme una prueba»: el email llega al buzón de la suite con «[Prueba]»
 *    y el texto nuevo.
 * 4. Una variable que no existe en el recordatorio ({importe}) muestra el
 *    motivo junto al texto y no guarda.
 * 5. Cerrar con cambios sin guardar pregunta antes de descartarlos.
 * 6. «Restablecer» (con confirmación) vuelve a «Por defecto».
 * 7. Recepción no ve la pantalla (ni en el índice de Ajustes).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `mensajes-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const clinicName = `Clínica Mensajes ${suffix}`.slice(0, 60);
const admin = { fullName: 'Marta Dueña', email: `marta.msg.${suffix}@example.com` };
const reception = { fullName: 'Rosa Recepción', email: `rosa.msg.${suffix}@example.com` };

const SUBJECT = '{paciente}, tu cita en {clinica}';
const BODY = 'Te esperamos con una sonrisa el {fecha}.\n\nSi no puedes venir, avísanos con tiempo.';
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

async function openList(page: Page): Promise<Locator> {
  await page.goto(`${origin}/settings/mensajes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Mensajes' })).toBeVisible({ timeout: 15_000 });
  const list = page.getByTestId('message-templates-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  return list;
}

async function openReminder(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Editar «Recordatorio de cita»' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recordatorio de cita' });
  await expect(dialog.getByLabel('Texto del mensaje', { exact: true })).toBeVisible();
  return dialog;
}

async function expectNoViolations(page: Page, scope: Locator, name: string) {
  const violations = await axeInBothThemes(page, scope);
  expect.soft(violations.light, `${name} claro`).toEqual([]);
  expect.soft(violations.dark, `${name} oscuro`).toEqual([]);
}

test.describe('Ajustes › Mensajes (DX-565)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    const session = await registerClinicViaApi(request, {
      subdomain,
      clinicName,
      fullName: admin.fullName,
      email: admin.email,
      password,
    });
    await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  });

  test('ADMIN: la lista y el editor a 390 y 1440 px, en claro y oscuro, sin violaciones de axe', async ({ page }) => {
    await loginAs(page, origin, admin.email, password);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const list = await openList(page);
      await expect(page.getByTestId('message-status-appointment-reminder')).toContainText('Por defecto');
      await expectNoHorizontalScroll(page);
      await shot(page, 'mensajes-lista', viewport.width);
      await expectNoViolations(page, page.getByRole('main'), `lista ${viewport.width}`);
      await expect(list.getByRole('button', { name: /^Editar «/ })).toHaveCount(6);

      const dialog = await openReminder(page);
      await expectDialogInsideViewport(page, dialog);
      await expect(dialog.getByTitle('Vista previa del email')).toBeVisible({ timeout: 15_000 });
      await shot(page, 'mensajes-editor', viewport.width);
      await expectNoViolations(page, dialog, `editor ${viewport.width}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });

  test('ADMIN edita el recordatorio en español, ve la vista previa, guarda, se prueba, una variable inválida no guarda y «Restablecer» vuelve al de por defecto', async ({
    page,
  }) => {
    test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, admin.email, password);
    await openList(page);
    const dialog = await openReminder(page);

    const subject = dialog.getByLabel('Asunto', { exact: true });
    const body = dialog.getByLabel('Texto del mensaje', { exact: true });
    await subject.fill(SUBJECT);
    await body.fill(BODY);

    // Vista previa de la API con los datos de ejemplo: «Ana» y el nombre real de la clínica.
    await expect(dialog.getByTestId('message-preview-subject')).toHaveText(`Asunto: Ana, tu cita en ${clinicName}`, {
      timeout: 15_000,
    });
    const frame = dialog.frameLocator('iframe[title="Vista previa del email"]');
    await expect(frame.locator('body')).toContainText('Te esperamos con una sonrisa el', { timeout: 15_000 });
    await expect(frame.locator('body')).not.toContainText('{fecha}');

    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText('Texto guardado.')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId('message-template-status')).toHaveText('Personalizado');
    await shot(page, 'mensajes-guardado', 1440);

    // La prueba: al correo de quien la pide, con «[Prueba]» y el texto nuevo.
    const since = mailMark();
    await dialog.getByRole('button', { name: 'Enviarme una prueba' }).click();
    await expect(dialog.getByText(/^Te enviamos la prueba a .+\*\*\*@/)).toBeVisible({ timeout: 15_000 });
    const email = await mailFor(admin.email, /Te esperamos con una sonrisa/, { since });
    expect(email.subject).toBe(`[Prueba] Ana, tu cita en ${clinicName}`);
    expect(email.text).toContain('Si no puedes venir, avísanos con tiempo.');
    expect(email.text).not.toContain('{fecha}');

    // {importe} no se puede usar: el motivo junto al texto y nada se guarda.
    await body.fill('Tu saldo es {importe}.');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText(/\{importe\} no se puede usar en el recordatorio/)).toBeVisible({ timeout: 15_000 });
    await expect(body).toHaveAttribute('aria-invalid', 'true');
    await shot(page, 'mensajes-invalido', 1440);
    // Cerrar con el borrador sin guardar pregunta antes de descartarlo.
    await page.keyboard.press('Escape');
    const discard = page.getByRole('dialog', { name: 'Descartar los cambios sin guardar' });
    await expect(discard).toBeVisible();
    await expectNoViolations(page, discard, 'descartar');
    await discard.getByRole('button', { name: 'Descartar y cerrar' }).click();
    await expect(dialog).toHaveCount(0);

    await page.reload();
    await openList(page);
    await expect(page.getByTestId('message-status-appointment-reminder')).toContainText('Personalizado');
    const reopened = await openReminder(page);
    await expect(reopened.getByLabel('Texto del mensaje', { exact: true })).toHaveValue(BODY);
    await expect(reopened.getByLabel('Asunto', { exact: true })).toHaveValue(SUBJECT);

    await reopened.getByRole('button', { name: 'Restablecer' }).click();
    const confirm = page.getByRole('dialog', { name: 'Restablecer el texto por defecto' });
    await confirm.getByRole('button', { name: 'Restablecer' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(reopened.getByTestId('message-template-status')).toHaveText('Por defecto', { timeout: 15_000 });
    await expect(reopened.getByLabel('Asunto', { exact: true })).not.toHaveValue(SUBJECT);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('message-status-appointment-reminder')).not.toContainText('Personalizado');
  });

  test('Recepción no ve los mensajes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, reception.email, password);
    await page.goto(`${origin}/settings`);
    await expect(page.getByRole('link', { name: /^Mi perfil/ }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /^Mensajes/ })).toHaveCount(0);
    await page.goto(`${origin}/settings/mensajes`);
    await expect(page.getByText('Solo administración cambia los textos de los mensajes.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /^Editar «/ })).toHaveCount(0);
  });
});
