import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { registerClinicViaApi } from './support/api';

/**
 * DX-010: recuperar la contraseña por email.
 *
 *   1. Desde el login, «¿Olvidaste tu contraseña?» → `/olvide-contrasena`: se
 *      pide el enlace y la pantalla dice lo mismo exista o no la cuenta.
 *   2. El email (la API corre con MAIL_TRANSPORT=file en e2e: cada email queda
 *      como JSON en E2E_MAIL_DIR; ver scripts/e2e-ci.sh) trae el enlace al host
 *      de la clínica `/restablecer/<token>`.
 *   3. Se crea la contraseña nueva (validación en español), la web lleva al
 *      login con el aviso de éxito, la sesión abierta en otro dispositivo se
 *      cierra y la contraseña nueva sirve.
 *   4. El enlace es de un solo uso: al abrirlo otra vez lo explica y ofrece
 *      pedir otro.
 *
 * La clínica se crea por la API (no es lo que se prueba aquí).
 */
const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'Restablecida2026!';
const MAIL_DIR = process.env.E2E_MAIL_DIR;

interface SavedEmail {
  to: string;
  subject: string;
  text: string;
}

/** Último email de restablecimiento para `to` (espera a que el despachador lo deje). */
async function resetLinkFor(to: string, origin: string): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const files = (await readdir(MAIL_DIR!).catch(() => [] as string[])).sort();
        for (const file of files.reverse()) {
          const email = JSON.parse(await readFile(join(MAIL_DIR!, file), 'utf8')) as SavedEmail;
          if (email.to === to && email.subject === 'Restablece tu contraseña') {
            const match = new RegExp(`${origin}/restablecer/[A-Za-z0-9_-]{43}`).exec(email.text);
            link = match?.[0] ?? '';
            return link;
          }
        }
        return '';
      },
      { timeout: 20_000, message: 'no llegó el email de restablecimiento' },
    )
    .not.toBe('');
  return link;
}

test.describe('Recuperar la contraseña', () => {
  test.skip(
    !MAIL_DIR,
    'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)',
  );

  test('pedir el enlace desde el login, restablecer, cerrar las demás sesiones y no reutilizar el enlace', async ({
    page,
    browser,
    playwright,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const clinic = {
      subdomain: `restablece-${suffix}`,
      clinicName: `Clínica Restablece ${suffix}`,
      fullName: 'Dueña Restablece',
      email: `restablece.${suffix}@example.com`,
      password: PASSWORD,
    };
    const api = await playwright.request.newContext();
    const { origin } = await registerClinicViaApi(api, clinic);
    await api.dispose();

    // Otra sesión abierta (otro dispositivo) antes del restablecimiento.
    const otherDevice = await browser.newContext({
      locale: 'es-CO',
      timezoneId: 'America/Bogota',
    });
    try {
      const other = await otherDevice.newPage();
      await loginAs(other, origin, clinic.email, clinic.password);
      await expect(other.getByRole('heading', { name: 'Pacientes' })).toBeVisible({
        timeout: 15_000,
      });

      // --- 1. «¿Olvidaste tu contraseña?» ---
      await page.goto(`${origin}/login`);
      await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
      await expect(page).toHaveURL(`${origin}/olvide-contrasena`);
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      await expect(page.locator('p[role="alert"]')).toContainText(
        'Escribe un correo electrónico válido',
      );
      await page.getByLabel('Correo electrónico').fill(clinic.email);
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('status')).toContainText(
        'Si el correo pertenece a una cuenta de esta clínica',
      );

      // --- 2. El email trae el enlace al host de la clínica ---
      const link = await resetLinkFor(clinic.email, origin);

      // --- 3. Contraseña nueva ---
      await page.goto(link);
      await expect(page.getByText('Restablecer contraseña')).toBeVisible();
      await page.getByLabel('Contraseña nueva').fill('corta');
      await page.getByLabel('Repite la contraseña').fill('corta');
      await page.getByRole('button', { name: 'Guardar contraseña' }).click();
      await expect(page.locator('p[role="alert"]')).toContainText('al menos 8 caracteres');
      await page.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
      await page.getByLabel('Repite la contraseña').fill(NEW_PASSWORD);
      await page.getByRole('button', { name: 'Guardar contraseña' }).click();
      await expect(page).toHaveURL(`${origin}/login?restablecida=1`, {
        timeout: 15_000,
      });
      await expect(
        page.getByRole('status').filter({ hasText: 'tu contraseña se cambió' }),
      ).toBeVisible();

      // La sesión del otro dispositivo quedó cerrada: al recargar vuelve al login.
      await other.reload();
      await expect(other).toHaveURL(new RegExp(`${origin}/login`), {
        timeout: 15_000,
      });

      // La nueva sirve.
      await loginAs(page, origin, clinic.email, NEW_PASSWORD);
      await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({
        timeout: 15_000,
      });

      // --- 4. Un solo uso: lo explica y ofrece pedir otro ---
      await other.goto(link);
      await expect(other.getByRole('heading', { name: 'Este enlace ya se usó' })).toBeVisible({
        timeout: 15_000,
      });
      await other.getByRole('link', { name: 'Pedir un enlace nuevo' }).click();
      await expect(other).toHaveURL(`${origin}/olvide-contrasena`);
    } finally {
      await otherDevice.close();
    }
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`a ${viewport.width}px los formularios caben sin scroll horizontal`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const origin = `http://demo-${randomUUID().slice(0, 6)}.localhost:${process.env.E2E_WEB_PORT ?? '3001'}`;
      for (const path of ['/olvide-contrasena', `/restablecer/${'x'.repeat(43)}`]) {
        await page.goto(`${origin}${path}`);
        await expect(
          page
            .getByRole('button', { name: 'Enviar enlace' })
            .or(page.getByRole('heading', { name: 'Enlace no válido' })),
        ).toBeVisible({ timeout: 15_000 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      }
    });
  }
});
