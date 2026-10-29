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
  execFileSync('psql', [
    E2E_DATABASE_URL,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE locations SET "regionalSettingsReviewedAt" = NULL WHERE id = '${locationId}'`,
  ]);
}
