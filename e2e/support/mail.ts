import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';

/**
 * Buzón de la suite e2e: la API corre con MAIL_TRANSPORT=file y cada email
 * queda como JSON en E2E_MAIL_DIR (ver scripts/e2e-ci.sh). Desde DX-029 los
 * enlaces de verificación del registro y de invitación SOLO viajan por email
 * (nadie más los recibe), así que la suite los lee de aquí, como la persona
 * desde su buzón.
 */
export const MAIL_DIR = process.env.E2E_MAIL_DIR;

interface SavedEmail {
  to: string;
  subject: string;
  text: string;
}

/** Primer grupo de `pattern` en el ÚLTIMO email a `to` que lo contenga. */
export async function linkFromMail(to: string, pattern: RegExp): Promise<string> {
  expect(MAIL_DIR, 'E2E_MAIL_DIR no definido: usa scripts/e2e-ci.sh').toBeTruthy();
  let found = '';
  await expect
    .poll(
      async () => {
        const files = (await readdir(MAIL_DIR!).catch(() => [] as string[])).sort().reverse();
        for (const file of files) {
          const email = JSON.parse(await readFile(join(MAIL_DIR!, file), 'utf8')) as SavedEmail;
          const match = email.to === to ? pattern.exec(email.text) : null;
          if (match) {
            found = match[1] ?? match[0];
            return found;
          }
        }
        return '';
      },
      { timeout: 20_000, message: `no llegó a ${to} un email que cumpla ${pattern}` },
    )
    .not.toBe('');
  return found;
}

/** Token del enlace de verificación del registro enviado a `to`. */
export function registrationTokenFor(to: string): Promise<string> {
  return linkFromMail(to, /\/register\/verificar\/([A-Za-z0-9_-]{43})/);
}

/** Enlace completo `<origen>/invitacion/<token>` del último email de invitación a `to`. */
export function invitationLinkFor(to: string): Promise<string> {
  return linkFromMail(to, /(https?:\/\/\S+\/invitacion\/[0-9a-f]{64})/);
}
