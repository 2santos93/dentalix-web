import { assertRuntimeConfig, legacyEnvWarnings } from './lib/api/api-base';

/**
 * Comprobación de arranque del servidor Node (la importa `instrumentation.ts`
 * solo con NEXT_RUNTIME=nodejs: `process.exit` no existe en el runtime edge y
 * Next lo avisaría al compilar instrumentation para edge).
 *
 * OPS-024 (DX-083): en producción, sin `API_URL` válida el proceso SALE con
 * código 1 (el orquestador ve el contenedor caído y el motivo en el log) en
 * vez de servir páginas que llaman a `localhost`. Un `throw` no basta: Next
 * lo registra y sigue escuchando, con 500 en cada página.
 */
export function checkRuntimeConfig(): void {
  // Las NEXT_PUBLIC_* se nombran literalmente: Next las incrusta al compilar.
  const env = {
    ...process.env,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_FILES_ORIGIN: process.env.NEXT_PUBLIC_FILES_ORIGIN,
  };
  for (const warning of legacyEnvWarnings(env)) console.warn(warning);
  try {
    assertRuntimeConfig(env);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
}
