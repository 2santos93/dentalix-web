import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs, waitForHydratedForm } from './support/auth';
import { registerClinicViaApi } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';
import { totpNow } from './support/totp';
import { tenantOrigin } from './support/urls';

/**
 * DX-021 — verificación en dos pasos desde Mi perfil y login con código
 * generado en el test (el test hace de app de autenticación). También a
 * 390 px, sin scroll horizontal.
 */
const PASSWORD = 'Password123!';

async function enroll(page: import('@playwright/test').Page) {
  await page.goto(`${page.url().split('/').slice(0, 3).join('/')}/settings/profile`);
  await page.getByRole('button', { name: 'Activar' }).click();
  await page.getByLabel('Contraseña actual').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const secret = (await page.getByTestId('mfa-secret').innerText()).replace(/\s/g, '');
  await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
  await page.getByLabel('Código de la app').fill(totpNow(secret));
  await page.getByRole('button', { name: 'Activar' }).click();
  const list = page.getByTestId('mfa-recovery-codes');
  await expect(list.getByRole('listitem')).toHaveCount(10);
  const codes = await list.getByRole('listitem').allInnerTexts();
  await expect(page.getByRole('button', { name: 'Listo' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByText('Quedan 10')).toBeVisible();
  return { secret, codes };
}

async function passwordStep(
  page: import('@playwright/test').Page,
  origin: string,
  email: string,
) {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByLabel('Código de verificación')).toBeVisible();
}

test('activa con QR, entra con código, rechaza uno malo y un código de recuperación vale una vez', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const data = {
    subdomain: `mfa-${suffix}`,
    clinicName: `Clínica ${suffix}`,
    fullName: 'Persona Dos Pasos',
    email: `mfa.${suffix}@example.com`,
    password: PASSWORD,
  };
  await registerClinicViaApi(request, data);
  const origin = tenantOrigin(data.subdomain);
  await loginAs(page, origin, data.email, PASSWORD);
  const { secret, codes } = await enroll(page);

  const fresh = await (await browser.newContext()).newPage();
  await passwordStep(fresh, origin, data.email);
  // Incorrecto: no entra. (El código de hace dos minutos, fuera de la ventana.)
  await fresh.getByLabel('Código de verificación').fill(totpNow(secret, -4));
  await fresh.getByRole('button', { name: 'Verificar' }).click();
  await expect(fresh.getByText(/no es correcto o ya se usó/)).toBeVisible();
  await expect(fresh).toHaveURL(/\/login/);
  // El paso del alta ya gastó el código vigente: vale el siguiente (+30 s).
  await fresh.getByLabel('Código de verificación').fill(totpNow(secret, 1));
  await fresh.getByRole('button', { name: 'Verificar' }).click();
  await expect(fresh).toHaveURL(/\/patients/);

  // Código de recuperación, a 390 px.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await passwordStep(phone, origin, data.email);
  await expectNoHorizontalScroll(phone);
  await phone.getByRole('button', { name: /código de recuperación/ }).click();
  await phone.getByLabel('Código de recuperación').fill(codes[0]);
  await phone.getByRole('button', { name: 'Verificar' }).click();
  await expect(phone).toHaveURL(/\/patients/);

  // El mismo código, otra vez: no.
  const again = await (await browser.newContext()).newPage();
  await passwordStep(again, origin, data.email);
  await again.getByRole('button', { name: /código de recuperación/ }).click();
  await again.getByLabel('Código de recuperación').fill(codes[0]);
  await again.getByRole('button', { name: 'Verificar' }).click();
  await expect(again.getByRole('alert')).toBeVisible();
  await expect(again).toHaveURL(/\/login/);
});

test('la clínica exige el MFA: el ADMIN sin él pasa por el alta forzada al entrar, a 390 px', async ({
  page,
  request,
}) => {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede encender la política sin un ADMIN con MFA');
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const data = {
    subdomain: `mfaf-${suffix}`,
    clinicName: `Clínica ${suffix}`,
    fullName: 'Persona Alta Forzada',
    email: `mfaf.${suffix}@example.com`,
    password: PASSWORD,
  };
  await registerClinicViaApi(request, data);
  execFileSync('psql', [
    databaseUrl!,
    '-c',
    `UPDATE tenants SET "requireAdminMfa" = true WHERE subdomain = '${data.subdomain}'`,
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  const origin = tenantOrigin(data.subdomain);
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(data.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const secretEl = page.getByTestId('mfa-secret');
  await expect(secretEl).toBeVisible();
  await expectNoHorizontalScroll(page);
  const secret = (await secretEl.innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de la app').fill(totpNow(secret));
  await page.getByRole('button', { name: 'Activar y entrar' }).click();
  await expect(page.getByTestId('mfa-recovery-codes').getByRole('listitem')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Entrar a Dentalix' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Entrar a Dentalix' }).click();
  await expect(page).toHaveURL(/\/patients/);
});
