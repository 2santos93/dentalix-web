import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs, waitForHydratedForm } from './support/auth';
import { registerClinicViaApi } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';
import { totpNow } from './support/totp';
import { WEB_PORT, tenantOrigin } from './support/urls';

/**
 * SEC-008 — acceso de soporte (break-glass) del superadmin a una clínica.
 *
 * 1. El superadmin activa la verificación en dos pasos en el área de
 *    plataforma (apex, /admin): el test hace de app de autenticación con la
 *    clave que enseña el modal.
 * 2. En el login de una clínica de la que NO es miembro, tras la contraseña la
 *    web pide el código y el motivo; entra a la clínica.
 * 3. El ADMIN de la clínica ve el acceso en Ajustes → «Accesos de soporte»
 *    (también a 390 px, sin scroll horizontal).
 *
 * Ser superadmin solo se otorga en la BD: hace falta E2E_DATABASE_URL (psql).
 */

const PASSWORD = 'Password123!';
const REASON = 'Ticket e2e: revisar el cierre de caja';

function clinic(tag: string) {
  const suffix = `${tag}${randomUUID().slice(0, 8)}`;
  return {
    subdomain: `bg-${suffix}`,
    clinicName: `Soporte ${suffix}`,
    fullName: `Persona ${tag}`,
    email: `bg.${suffix}@example.com`,
    password: PASSWORD,
  };
}

test('el superadmin enrola el MFA, entra a una clínica con código y motivo, y la clínica lo ve', async ({
  page,
  browser,
}) => {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede otorgar el rol de superadmin');
  test.setTimeout(120_000);

  // La clínica a la que se entra como soporte, y otra cuyo dueño será el
  // superadmin (así tiene contraseña), sin membresía en la primera.
  const target = clinic('dest');
  const home = clinic('sup');
  await registerClinicViaApi(page.request, target);
  await registerClinicViaApi(page.request, home);
  execFileSync('psql', [
    databaseUrl as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE users SET "isPlatformAdmin" = true WHERE email = '${home.email}'`,
  ]);

  // --- 1. Alta del MFA en el área de plataforma (apex) ---------------------
  await page.goto(`http://localhost:${WEB_PORT}/admin`);
  await waitForHydratedForm(page);
  await page.getByLabel('Email').fill(home.email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Activar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Activar la verificación en dos pasos' });
  const secret = ((await dialog.getByTestId('mfa-secret').textContent()) ?? '').replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await dialog.getByLabel('Código de la app').fill(totpNow(secret));
  await dialog.getByRole('button', { name: 'Activar' }).click();
  await expect(page.getByText('Verificación en dos pasos activada.')).toBeVisible();

  // --- 2. Login de soporte en la clínica ----------------------------------
  const origin = tenantOrigin(target.subdomain);
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(home.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const code = page.getByLabel('Código de verificación');
  await expect(code).toBeVisible();
  await expect(page.getByText(/la clínica verá este acceso/i)).toBeVisible();
  // El paso del enrolado ya se usó: el siguiente (la API acepta +1).
  await code.fill(totpNow(secret, 1));
  await page.getByLabel('Motivo del acceso').fill(REASON);
  await page.getByRole('button', { name: 'Entrar como soporte' }).click();
  await expect(page).toHaveURL(/\/patients$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();

  // --- 3. El ADMIN de la clínica ve el acceso -----------------------------
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const adminPage = await context.newPage();
    await loginAs(adminPage, origin, target.email, PASSWORD);
    await adminPage.goto(`${origin}/settings/accesos-de-soporte`);
    await expect(adminPage.getByRole('heading', { name: 'Accesos de soporte' })).toBeVisible();
    const table = adminPage.getByRole('table', { name: 'Accesos de soporte a la clínica' });
    await expect(table).toContainText(REASON, { timeout: 15_000 });
    await expect(table).toContainText(home.email);
    if (viewport.width === 390) await expectNoHorizontalScroll(adminPage);
    await context.close();
  }
});

test('sin MFA el superadmin no puede entrar a una clínica (mensaje claro)', async ({ page }) => {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede otorgar el rol de superadmin');
  const target = clinic('sinmfa');
  const home = clinic('supsin');
  await registerClinicViaApi(page.request, target);
  await registerClinicViaApi(page.request, home);
  execFileSync('psql', [
    databaseUrl as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE users SET "isPlatformAdmin" = true WHERE email = '${home.email}'`,
  ]);

  await page.goto(`${tenantOrigin(target.subdomain)}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(home.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(
    'activa la verificación en dos pasos en el área de plataforma',
  );
  await expect(page).toHaveURL(/\/login$/);
});
