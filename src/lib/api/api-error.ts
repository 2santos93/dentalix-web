/**
 * Error de una respuesta no-2xx de la API.
 *
 * `message` es para logs y depuración, NUNCA para la pantalla: puede venir en
 * inglés técnico («Insufficient role», «Patient not found»). Lo que se enseña a
 * la persona sale siempre de `apiErrorMessage()` (`./error-message.ts`), que
 * lee `status`, `messages` y `retryAfterSeconds`. La regla `no-restricted-syntax`
 * de `eslint.config.mjs` impide leer `.message` de un error fuera de ese helper.
 */
export class ApiError extends Error {
  /**
   * Los mensajes que dio el servidor, tal cual: uno, varios (el array de
   * class-validator en un 400) o ninguno (respuesta sin cuerpo JSON).
   */
  public readonly messages: readonly string[];
  /** Segundos de `Retry-After` en un 429/503, si el servidor lo mandó. */
  public readonly retryAfterSeconds: number | null;

  constructor(
    public readonly status: number,
    message: string,
    details: { messages?: readonly string[]; retryAfterSeconds?: number | null } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.messages = details.messages ?? (message ? [message] : []);
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
  }
}
