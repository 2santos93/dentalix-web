import { assertRuntimeConfig } from './lib/api/api-base';

/**
 * Se ejecuta una vez al arrancar el servidor de Next, antes de atender
 * peticiones. OPS-024 (DX-083): en producción, sin `API_URL` válida el
 * proceso SALE con código 1 (el orquestador ve el contenedor caído y el
 * motivo en el log) en vez de servir páginas que llaman a `localhost`. Un
 * `throw` no basta: Next lo registra y sigue escuchando, con 500 en cada
 * página. Durante `next build` no se comprueba (la URL es de runtime).
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  try {
    assertRuntimeConfig();
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
}
