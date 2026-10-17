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
  /**
   * Código estable del servidor cuando lo hay (p. ej. `BREAK_GLASS_REQUIRED`
   * en el login de soporte, SEC-008). Sirve para decidir el PASO siguiente,
   * nunca como texto de pantalla.
   */
  public readonly code: string | null;

  constructor(
    public readonly status: number,
    message: string,
    details: {
      messages?: readonly string[];
      retryAfterSeconds?: number | null;
      code?: string | null;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.messages = details.messages ?? (message ? [message] : []);
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
    this.code = details.code ?? null;
  }
}

/**
 * `fetch` no llegó a tener respuesta: sin red, DNS, CORS o conexión cortada
 * (revisión D-2). Lo lanza SOLO `client.ts`, envolviendo el rechazo de `fetch`,
 * para que «No hay conexión» no se diga ante cualquier `TypeError` de
 * programación. `cause` guarda el error original para depurar.
 */
export class NetworkError extends Error {
  constructor(public readonly cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
  }
}
