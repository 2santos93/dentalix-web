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
          // El FileMailer puede estar escribiéndolo: a medias, se relee en la siguiente vuelta.
          const email = await readFile(join(MAIL_DIR!, file), 'utf8')
            .then((raw) => JSON.parse(raw) as SavedEmail)
            .catch(() => null);
          if (!email) continue;
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

/**
 * Enlace completo `<origen>/invitacion/<token>` del último email de invitación a `to`.
 *
 * Con `origin` solo vale el enlace de ESA clínica: la API escribe el email
 * después de responder al `POST /staff/invitations`, así que si la misma
 * persona ya tenía la invitación de otra clínica en el buzón, sin filtrar se
 * leería ese enlace viejo (ya aceptado → 404) en vez de esperar al nuevo.
 */
export function invitationLinkFor(to: string, origin?: string): Promise<string> {
  const prefix = origin ? origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : 'https?:\\/\\/\\S+';
  return linkFromMail(to, new RegExp(`(${prefix}\\/invitacion\\/[0-9a-f]{64})`));
}
