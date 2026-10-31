import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs, sessionCookie } from './support/auth';
import { registerClinicViaApi } from './support/api';
import { E2E_BROWSER_LOCALE } from './support/regional';

/**
 * DX-070 (TST-004): cambio de contraseña en /settings/profile.
 *
 *   1. Con dos sesiones abiertas (este navegador y "otro dispositivo"), se
 *      cambia la contraseña desde el perfil.
 *   2. La sesión que la cambió sigue viva (recibe un par nuevo), y la del otro
 *      dispositivo queda cerrada: la API revoca los refresh anteriores.
 *   3. Tras cerrar sesión, la contraseña vieja ya no entra y la nueva sí.
 */
const OLD_PASSWORD = 'Password123!';
const NEW_PASSWORD = 'NuevaClave2026!';

test('cambiar la contraseña en /settings/profile cierra las otras sesiones y el re-login va con la nueva', async ({
  page,
  browser,
  playwright,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const clinic = {
    subdomain: `clave-${suffix}`,
    clinicName: `Clínica Clave ${suffix}`,
    fullName: 'Dueño Clave',
    email: `clave.${suffix}@example.com`,
    password: OLD_PASSWORD,
  };
  const api = await playwright.request.newContext();
  const { origin } = await registerClinicViaApi(api, clinic);
  await api.dispose();

  await loginAs(page, origin, clinic.email, OLD_PASSWORD);

  // "Otro dispositivo" con la misma cuenta.
  const otherDevice = await browser.newContext({ locale: E2E_BROWSER_LOCALE, timezoneId: 'America/Bogota' });
  try {
    const other = await otherDevice.newPage();
    await loginAs(other, origin, clinic.email, OLD_PASSWORD);

    // --- 1. Cambiar la contraseña ---
    await page.goto(`${origin}/settings/profile`);
    // B6: «Cambiar contraseña» (secundario) abre el diálogo con los tres campos.
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar contraseña' });
    await dialog.getByLabel('Contraseña actual').fill(OLD_PASSWORD);
    await dialog.getByLabel('Nueva contraseña').fill(NEW_PASSWORD);
    await dialog.getByLabel('Confirmar contraseña').fill(NEW_PASSWORD);
    await dialog.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Tu contraseña fue actualizada.' })).toBeVisible({
      timeout: 10_000,
    });

    // --- 2. Esta sesión sigue (cookie nueva); la otra, no ---
    expect((await sessionCookie(page, origin))?.httpOnly).toBe(true);
    await page.goto(`${origin}/patients`);
    await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });

    await other.goto(`${origin}/patients`);
    await expect(other).toHaveURL(`${origin}/login`, { timeout: 15_000 });
  } finally {
    await otherDevice.close();
  }

  // --- 3. Cerrar sesión y volver a entrar ---
  await page.getByRole('button', { name: new RegExp(clinic.fullName, 'i') }).first().click();
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();
  await expect(page).toHaveURL(`${origin}/login`, { timeout: 10_000 });

  await page.getByLabel('Correo electrónico').fill(clinic.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(OLD_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('p[role="alert"]')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(`${origin}/login`);
  expect(await sessionCookie(page, origin)).toBeUndefined();

  await loginAs(page, origin, clinic.email, NEW_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
});
