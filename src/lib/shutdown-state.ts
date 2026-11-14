/**
 * DX-458: marca de «apagando» del proceso de la web. La pone
 * `scripts/docker/server-entry.cjs` al recibir SIGTERM (mismo símbolo, en
 * `globalThis`; Next standalone atiende en el mismo proceso) y la lee
 * `/api/health` para dar 503 mientras drena.
 */
export const SHUTTING_DOWN = Symbol.for('dentalix.web.shuttingDown');

export function isShuttingDown(): boolean {
  return (globalThis as Record<symbol, unknown>)[SHUTTING_DOWN] === true;
}
