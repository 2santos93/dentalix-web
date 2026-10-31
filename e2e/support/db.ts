import { execFileSync } from 'node:child_process';

/**
 * La base e2e por psql, como dueño (`E2E_DATABASE_URL`, que `scripts/e2e-ci.sh`
 * arma con `PG_HOST`, `PG_PORT`, `PG_SUPERUSER`, `PG_SUPERPASS` y
 * `E2E_DB_NAME`). Solo para fixtures que la API ya no deja crear.
 */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;

/**
 * Deja una sede «sin revisar» (`"regionalSettingsReviewedAt" = NULL`): el estado
 * de las sedes anteriores a G1 que rellenó la función D5. Desde DX-312 (R7) el
 * registro sin sede ya no existe, así que la API no puede crear una.
 */
export function markLocationUnreviewed(locationId: string): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  // El id va como variable de psql (`:'id'`, entre comillas y escapada), no
  // pegado al SQL. psql solo sustituye variables en lo que lee, no en `-c`:
  // por eso el SQL entra por stdin.
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${locationId}`], {
    input: `UPDATE locations SET "regionalSettingsReviewedAt" = NULL WHERE id = :'id';`,
  });
}

/**
 * DX-380: el reintento del abono lleva `hours` horas pendiente (como si se
 * hubiera cobrado sin tasa ayer). La API no deja fechar el alta del reintento:
 * la pone la BD.
 */
export function ageRateBacklog(paymentId: string, hours: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${paymentId}`, '-v', `hours=${Math.trunc(hours)}`],
    {
      input: `UPDATE payment_base_retries SET "createdAt" = timezone('UTC', now()) - make_interval(hours => :hours) WHERE "paymentId" = :'id';`,
    },
  );
}

/**
 * DX-402: deja el reintento del abono en el backoff que tendría tras más de
 * 24 h sin tasa (varios intentos y el siguiente a `hours` vista), como en la
 * QA de DX-380: registrar la tasa tiene que adelantarlo, no esperar.
 */
export function postponeRateRetry(paymentId: string, hours: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${paymentId}`, '-v', `hours=${Math.trunc(hours)}`],
    {
      input: `UPDATE payment_base_retries SET "attempts" = 5, "lastReason" = 'NO_RATE', "nextAttemptAt" = timezone('UTC', now()) + make_interval(hours => :hours) WHERE "paymentId" = :'id';`,
    },
  );
}

/**
 * Lleva la última rotación de la familia del refresh `refreshToken` (claim
 * `sid`) fuera de la gracia de la API (JWT_REFRESH_REUSE_GRACE_SECONDS, ≤ 60
 * s): desde ahí, reusar el token anterior es reuso (401 y sesión revocada).
 */
export function ageRefreshRotation(refreshToken: string): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  const claims = JSON.parse(Buffer.from(refreshToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    sid?: string;
  };
  if (!claims.sid) throw new Error('el refresh no tiene familia (sid)');
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `sid=${claims.sid}`], {
    input: `UPDATE refresh_sessions SET "rotatedAt" = "rotatedAt" - interval '5 minutes' WHERE id = :'sid'::uuid;`,
  });
}
