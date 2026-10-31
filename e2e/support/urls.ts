/**
 * Puertos/URLs de la suite e2e. Por defecto los de siempre (web :3001, API
 * :3000); se pueden cambiar por entorno para correr la suite contra otra
 * pareja de servidores (p. ej. un worktree con su propia API), sin tocar los
 * specs:
 *
 *   E2E_WEB_PORT=3101 E2E_API_URL=http://localhost:3100/api/v1 \
 *   API_URL=http://localhost:3100/api/v1 npm run test:e2e
 */
export const WEB_PORT = process.env.E2E_WEB_PORT ?? '3001';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';

/** Origen de la web en el host de una clínica (`*.localhost` resuelve a 127.0.0.1). */
export function tenantOrigin(subdomain: string): string {
  return `http://${subdomain}.localhost:${WEB_PORT}`;
}
