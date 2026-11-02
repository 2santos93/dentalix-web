import { expect, type Page } from '@playwright/test';
import { waitForHydratedForm } from './auth';
import { linkFromMail, mailMark } from './mail';
import { totpNow } from './totp';
import { WEB_PORT } from './urls';

export const apexUrl = () => `http://localhost:${WEB_PORT}/admin`;

/** Contraseña en el acceso de plataforma (apex). */
export async function apexPassword(page: Page, email: string, password: string) {
  await page.goto(apexUrl());
  await waitForHydratedForm(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/**
 * Alta forzada del superadmin (DX-021-bis): el código del correo, el de la app
 * y los códigos de recuperación, hasta entrar a plataforma. `onStep` deja mirar
 * cada paso (scroll a 390 px, capturas).
 */
export async function enrollPlatformAdmin(
  page: Page,
  email: string,
  password: string,
  onStep: (step: 'email' | 'secret' | 'codes') => Promise<void> = async () => {},
): Promise<{ secret: string; codes: string[] }> {
  const mark = mailMark();
  await apexPassword(page, email, password);
  const field = page.getByLabel('Código del correo');
  await expect(field).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/referencia [0-9A-F]{4}/)).toBeVisible();
  await onStep('email');
  await field.fill(await linkFromMail(email, /Tu código es: (\d{8})/, { since: mark }));
  await page.getByRole('button', { name: 'Continuar' }).click();

  const secretEl = page.getByTestId('mfa-secret');
  await expect(secretEl).toBeVisible();
  await onStep('secret');
  const secret = (await secretEl.innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel('Código de la app').fill(totpNow(secret));
  await page.getByRole('button', { name: 'Activar y entrar' }).click();

  const list = page.getByTestId('mfa-recovery-codes').getByRole('listitem');
  await expect(list).toHaveCount(10);
  await onStep('codes');
  const codes = await list.allInnerTexts();
  await expect(page.getByRole('button', { name: 'Entrar a Dentalix' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Entrar a Dentalix' }).click();
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible({
    timeout: 15_000,
  });
  return { secret, codes };
}
