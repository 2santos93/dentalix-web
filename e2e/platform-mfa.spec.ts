import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { registerClinicViaApi } from './support/api';
import { expectNoHorizontalScroll } from './support/layout';
import { apexPassword, enrollPlatformAdmin } from './support/platform-mfa';
import { shot } from './support/qa-shot';
import { totpNow } from './support/totp';

/**
 * DX-021-bis — el acceso de plataforma ya no entra solo con contraseña: alta
 * forzada con el código del correo, entrada con la app, código de recuperación
 * y renovación de los códigos en `/admin`, a 390 y 1440 px; cada paso se captura
 * en claro y oscuro (`shot`). El test hace de buzón y de app de autenticación.
 */
const PASSWORD = 'Password123!';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

for (const { width, height } of VIEWPORTS) {
  test(`plataforma: alta, entrada con código y recuperación a ${width} px`, async ({
    browser,
    request,
  }) => {
    const databaseUrl = process.env.E2E_DATABASE_URL;
    test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede otorgar el rol de superadmin');
    test.setTimeout(180_000);
    const suffix = randomUUID().slice(0, 8);
    const home = {
      subdomain: `plat-${suffix}`,
      clinicName: `Clínica ${suffix}`,
      fullName: 'Soporte Dentalix',
      email: `plat.${suffix}@example.com`,
      password: PASSWORD,
    };
    await registerClinicViaApi(request, home);
    execFileSync('psql', [
      databaseUrl!,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `UPDATE users SET "isPlatformAdmin" = true WHERE email = '${home.email}'`,
    ]);
    const open = async () => {
      const context = await browser.newContext({ viewport: { width, height } });
      return context.newPage();
    };
    
    // La contraseña sola no entra: alta con el código del correo.
    const page = await open();
    const { secret, codes } = await enrollPlatformAdmin(page, home.email, PASSWORD, async (step) => {
      await expectNoHorizontalScroll(page);
      await shot(page, `platform-${step}`, width);
    });
    await expect(page.getByText('Quedan 10')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, 'platform-panel', width);

    // Otra sesión: código malo, luego el bueno. Sin «recordar» en plataforma.
    const second = await open();
    await apexPassword(second, home.email, PASSWORD);
    const code = second.getByLabel('Código de verificación');
    await expect(code).toBeVisible();
    await expect(second.getByRole('checkbox')).toHaveCount(0);
    await expectNoHorizontalScroll(second);
    await shot(second, 'platform-code', width);
    await code.fill(totpNow(secret, -4));
    await second.getByRole('button', { name: 'Verificar' }).click();
    await expect(second.getByText(/no es correcto o ya se usó/)).toBeVisible();
    await shot(second, 'platform-code-error', width);
    await code.fill(totpNow(secret, 1));
    await second.getByRole('button', { name: 'Verificar' }).click();
    await expect(second.getByRole('heading', { name: 'Clínicas' })).toBeVisible();

    // Renovar los códigos: contraseña + código (el de recuperación vale).
    await second.getByRole('button', { name: 'Generar nuevos' }).click();
    await second.getByLabel('Contraseña actual').fill(PASSWORD);
    await second.getByRole('button', { name: 'Usar un código de recuperación' }).click();
    await second.getByLabel('Código de recuperación').fill(codes[0]);
    await expectNoHorizontalScroll(second);
    await shot(second, 'platform-regenerate', width);
    await second.getByRole('button', { name: 'Generar', exact: true }).click();
    const fresh = second.getByTestId('mfa-recovery-codes').getByRole('listitem');
    await expect(fresh).toHaveCount(10);
    const newCodes = await fresh.allInnerTexts();
    await second.getByRole('checkbox').check();
    await second.getByRole('button', { name: 'Listo' }).click();
    await expect(second.getByText('Quedan 10')).toBeVisible();

    // Un código anterior ya no vale; uno nuevo entra.
    const third = await open();
    await apexPassword(third, home.email, PASSWORD);
    await third.getByRole('button', { name: /código de recuperación/ }).click();
    await third.getByLabel('Código de recuperación').fill(codes[1]);
    await third.getByRole('button', { name: 'Verificar' }).click();
    await expect(third.getByRole('alert')).toBeVisible();
    await third.getByLabel('Código de recuperación').fill(newCodes[0]);
    await third.getByRole('button', { name: 'Verificar' }).click();
    await expect(third.getByRole('heading', { name: 'Clínicas' })).toBeVisible();
    await expect(third.getByText('Quedan 9')).toBeVisible();
  });
}
