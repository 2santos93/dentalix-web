import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { waitForHydratedForm, loginAs } from './support/auth';
import { addStaffViaApi, registerClinicViaApi } from './support/api';
import { passEnrollEmailCode } from './support/enroll-email-code';
import { mailMark } from './support/mail';
import { expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { totpNow } from './support/totp';
import { tenantOrigin } from './support/urls';

/**
 * DX-021-bis — `/settings/seguridad` a 390 y 1440 px (capturas en claro y
 * oscuro con `shot`): exigir
 * la verificación a todo el equipo cierra las sesiones sin ella y fuerza el
 * alta; dispositivo de confianza; y otro ADMIN restablece la de un miembro.
 */
const PASSWORD = 'Password123!';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

type Page = import('@playwright/test').Page;

async function enrollFromProfile(page: Page, origin: string) {
  await page.goto(`${origin}/settings/profile`);
  await page.getByRole('button', { name: 'Activar' }).click();
  await page.getByLabel('Contraseña actual').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const secret = (await page.getByTestId('mfa-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de la app').fill(totpNow(secret));
  await page.getByRole('button', { name: 'Activar' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByText('Quedan 10')).toBeVisible();
  return secret;
}

async function password(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

for (const { width, height } of VIEWPORTS) {
  test(`seguridad: política, confianza y reseteo a ${width} px`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const suffix = randomUUID().slice(0, 8);
    const clinic = {
      subdomain: `seg-${suffix}`,
      clinicName: `Clínica ${suffix}`,
      fullName: 'Administración Caracas',
      email: `seg.${suffix}@example.com`,
      password: PASSWORD,
    };
    const session = await registerClinicViaApi(request, clinic);
    const dentist = {
      fullName: 'Dra. Rojas',
      email: `rojas.${suffix}@example.com`,
      role: 'DENTIST',
      password: PASSWORD,
    };
    await addStaffViaApi(request, session, dentist);
    const origin = tenantOrigin(clinic.subdomain);
    const open = async () => {
      const context = await browser.newContext({ viewport: { width, height } });
      return context.newPage();
    };
    
    // La miembro tiene una sesión abierta, sin verificación.
    const member = await open();
    await loginAs(member, origin, dentist.email, PASSWORD);

    // Exigirla sin tenerla propia: el error dice dónde activarla.
    const admin = await open();
    await loginAs(admin, origin, clinic.email, PASSWORD);
    await admin.goto(`${origin}/settings/seguridad`);
    const all = admin.getByRole('switch', { name: 'Exigirla a todo el equipo' });
    await expect(all).toBeVisible();
    await expectNoHorizontalScroll(admin);
    await shot(admin, 'security-policy-off', width);
    await all.click();
    await expect(admin.getByText(/Activa primero tu propia verificación/)).toBeVisible();
    await expect(all).not.toBeChecked();

    const adminSecret = await enrollFromProfile(admin, origin);
    await admin.goto(`${origin}/settings/seguridad`);
    await all.click();
    await expect(all).toBeChecked();
    await expect(
      admin.getByRole('switch', { name: /Exigir verificación en dos pasos a los administradores/ }),
    ).toBeDisabled();
    await expectNoHorizontalScroll(admin);
    await shot(admin, 'security-policy-all', width);

    // Su sesión se cerró: al renovar vuelve al login, y entrar pide el alta.
    await member.reload();
    await expect(member).toHaveURL(/\/login/);
    const forced = await open();
    const mark = mailMark();
    await password(forced, origin, dentist.email);
    await passEnrollEmailCode(forced, dentist.email, mark);
    const secretEl = forced.getByTestId('mfa-secret');
    await expect(secretEl).toBeVisible();
    await expectNoHorizontalScroll(forced);
    const secret = (await secretEl.innerText()).replace(/\s/g, '');
    await forced.getByLabel('Código de la app').fill(totpNow(secret));
    await forced.getByRole('button', { name: 'Activar y entrar' }).click();
    await forced.getByRole('checkbox').check();
    await forced.getByRole('button', { name: 'Entrar a Dentalix' }).click();
    await expect(forced).toHaveURL(/\/patients/);

    // Dispositivo de confianza: la segunda vez no pide el código.
    const device = await open();
    await password(device, origin, dentist.email);
    await device.getByLabel('Código de verificación').fill(totpNow(secret, 1));
    await device.getByRole('checkbox', { name: /durante 30 días/ }).check();
    await expectNoHorizontalScroll(device);
    await shot(device, 'security-remember', width);
    await device.getByRole('button', { name: 'Verificar' }).click();
    await expect(device).toHaveURL(/\/patients/);
    await device.context().clearCookies({ name: 'dentalix_rt' });
    await password(device, origin, dentist.email);
    await expect(device).toHaveURL(/\/patients/);
    await device.goto(`${origin}/settings/profile`);
    const revoke = device.getByRole('button', { name: /^Revocar / });
    await expect(revoke).toBeVisible();
    await revoke.scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(device);
    await shot(device, 'security-devices', width);
    await revoke.click();
    await expect(device.getByText('Ninguno')).toBeVisible();

    // Otro ADMIN la restablece, con motivo y su propio código.
    await admin.goto(`${origin}/staff`);
    await admin.getByText('Dra. Rojas').first().click();
    const reset = admin.getByRole('button', { name: 'Restablecer' });
    await expect(reset).toBeVisible();
    await expectNoHorizontalScroll(admin);
    await reset.click();
    const dialog = admin.getByRole('dialog', { name: 'Restablecer la verificación en dos pasos' });
    await dialog.getByLabel('Motivo').selectOption('LOST_DEVICE');
    await dialog.getByLabel('Contraseña actual').fill(PASSWORD);
    await dialog.getByLabel('Código de la app').fill(totpNow(adminSecret, 1));
    await expectNoHorizontalScroll(admin);
    await shot(admin, 'security-reset-dialog', width);
    await dialog.getByRole('button', { name: 'Restablecer' }).click();
    await expect(admin.getByText(/Verificación restablecida/)).toBeVisible();
    await expect(reset).toHaveCount(0);

    // Sin verificación y obligatoria: el próximo login vuelve al alta.
    // SEC-066: vuelve a pedir el código del correo. Sale uno por cuenta y
    // cliente cada 60 s: si el anterior es más reciente, la API responde 429 y
    // se reintenta pasado ese plazo.
    const after = await open();
    await expect(async () => {
      await password(after, origin, dentist.email);
      await expect(after.getByLabel('Código del correo')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000, intervals: [10_000] });
  });
}
