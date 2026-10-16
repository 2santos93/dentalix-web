/**
 * Registro de los errores que capturan los `error.tsx` (DX-061, FE-026).
 *
 * En producción el mensaje y el stack pueden llevar datos del paciente (p. ej.
 * el valor que rompió un `Intl.NumberFormat`), así que solo se registran `name`
 * y `digest` (el `digest` permite cruzarlo con los logs del servidor). En
 * desarrollo se registra el error completo para depurar. Cuando exista un
 * reporter con scrubbing, este es el único punto a cambiar.
 */
export function reportBoundaryError(error: Error & { digest?: string }): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('Error de render', { name: error.name, digest: error.digest });
    return;
  }
  console.error(error);
}
