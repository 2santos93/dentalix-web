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
  /**
   * Campo del cuerpo al que se refiere un 400 de regla de negocio, cuando la
   * API lo dice (p. ej. `currency` en el alta de sede, G1): sirve para poner
   * el mensaje junto a ese campo.
   */
  public readonly field: string | null;
  /**
   * La sede a la que le falta un dato, cuando la API la nombra (p. ej. el 409
   * `LOCATION_LOCALE_REQUIRED`, G1-B §10): «Configurar sede» abre esa sede.
   */
  public readonly locationId: string | null;
  /**
   * El festivo que ya ocupa ese día, en el 409 `HOLIDAY_ALREADY_EXISTS` del
   * calendario de la sede (DX-316): la pantalla puede llevar a él.
   */
  public readonly holidayId: string | null;
  /**
   * La forma de pago (desde 0) de un cobro dividido a la que se refiere el
   * 409 de referencia repetida (DX-390): el motivo se pide en esa línea.
   */
  public readonly line: number | null;

  constructor(
    public readonly status: number,
    message: string,
    details: {
      messages?: readonly string[];
      retryAfterSeconds?: number | null;
      code?: string | null;
      field?: string | null;
      locationId?: string | null;
      holidayId?: string | null;
      line?: number | null;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.messages = details.messages ?? (message ? [message] : []);
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
    this.code = details.code ?? null;
    this.field = details.field ?? null;
    this.locationId = details.locationId ?? null;
    this.holidayId = details.holidayId ?? null;
    this.line = details.line ?? null;
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
