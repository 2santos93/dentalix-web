/**
 * Se ejecuta una vez al arrancar el servidor de Next, antes de atender
 * peticiones. OPS-024 (DX-083): en producción la web no arranca sin `API_URL`
 * válida (ver `instrumentation-node.ts`). Durante `next build` no se comprueba
 * (la URL es de runtime). El código de Node se importa solo en el runtime
 * nodejs, como pide la guía de instrumentation de Next.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { checkRuntimeConfig } = await import('./instrumentation-node');
  checkRuntimeConfig();
}
