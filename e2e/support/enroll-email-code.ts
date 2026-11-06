import { expect, type Page } from '@playwright/test';
import { linkFromMail } from './mail';

/**
 * SEC-066: el alta forzada del MFA de un miembro de clínica pide, antes del
 * secreto, el código de 8 dígitos enviado a su correo (como el superadmin,
 * DX-021-bis). `since` es el `mailMark()` tomado antes de enviar la contraseña.
 */
export async function passEnrollEmailCode(page: Page, email: string, since: number) {
  const field = page.getByLabel('Código del correo');
  await expect(field).toBeVisible({ timeout: 15_000 });
  await field.fill(await linkFromMail(email, /Tu código es: (\d{8})/, { since }));
  await page.getByRole('button', { name: 'Continuar' }).click();
}
