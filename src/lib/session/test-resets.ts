/**
 * Registro de «olvidar estado de módulo» para jest. Sin dependencias a
 * propósito: `jest.setup.ts` lo importa para vaciar, tras cada test, las
 * cachés en memoria de la sesión (`session-store.ts`) sin cargar el store —y
 * con él `locations-api`/`me-api`— antes de que cada test los mockee.
 *
 * En la app no se usa: la caché de sesión se vacía al cerrar sesión o al
 * cambiar de sesión, nunca por esto.
 */
const resets = new Set<() => void>();

export function registerTestReset(reset: () => void): void {
  resets.add(reset);
}

export function runTestResets(): void {
  for (const reset of resets) reset();
}
