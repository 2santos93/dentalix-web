import { ApiError } from './api-error';

/**
 * El ÚNICO sitio que convierte un error de la API (o de red) en texto para la
 * pantalla, siempre en español (DX-063). Ninguna pantalla lee `err.message`: lo
 * impide `no-restricted-syntax` en `eslint.config.mjs`.
 *
 * Orden de decisión:
 *
 * 1. Error de red / timeout (`fetch` rechaza; no hay status) → «sin conexión» o
 *    «tardó demasiado» (o `options.network` / `options.timeout`).
 * 2. 5xx → `byStatus[status]`, o el `fallback` de la pantalla, o el genérico de
 *    servidor. El texto del servidor NUNCA se enseña en un 5xx, aunque venga en
 *    español: no aporta nada a quien lo lee y puede llevar detalles internos.
 *    Tampoco el `requestId`: DESIGN.md no prevé un «código de soporte».
 * 3. 4xx cuyo texto del servidor es español «de persona» (las reglas de negocio:
 *    «No se puede rechazar un plan con abonos», «Solo puedes anular…») → ese
 *    texto. Es el más específico que hay, así que gana también al override. En
 *    un 400 con el array de class-validator se quedan solo los mensajes en
 *    español (deduplicados, como mucho tres).
 * 4. Override contextual de la pantalla para ese status (`byStatus`), p. ej.
 *    `{ 404: 'No se encontró el paciente.' }` o el 401 del login.
 * 5. El texto en español por status (400/422 validación, 401, 403, 404, 409,
 *    410, 413, 429 con `Retry-After`).
 * 6. `fallback` de la pantalla o el genérico.
 *
 * **Heurística de idioma** (`isHumanSpanish`): la API mezcla mensajes en inglés
 * técnico («Patient not found», class-validator) con reglas de dominio ya
 * redactadas en español, y no manda un `code` estable. Se puntúan las palabras:
 * vocabulario funcional español (artículos, preposiciones, verbos auxiliares,
 * «encontrado», «obligatorio»…), sufijos españoles (-ción, -dad, -ado/-ida…) y
 * tildes/ñ/¿¡ (+2) contra vocabulario técnico inglés (must, should, not, found,
 * invalid, required…). Español solo si gana con ventaja; el empate (p. ej.
 * «Tenant mismatch», «Conflict», un 0–0) cuenta como técnico. Además se descarta
 * todo lo que parezca un volcado interno (saltos de línea, trazas, SQL, JSON o
 * más de 240 caracteres). Los casos reales de la API están fijados en
 * `error-message.test.ts`; si la API añade un mensaje que la heurística
 * clasifique mal, se añade allí su caso.
 */

export const errorMessageCopy = {
  generic: 'Algo salió mal. Intenta de nuevo.',
  validation: 'Revisa los datos: hay campos con valores no válidos.',
  unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  forbidden: 'No tienes permiso para hacer esto. Si lo necesitas, pide acceso a un administrador.',
  notFound: 'No encontramos lo que buscas: puede que se haya eliminado.',
  conflict: 'Los datos cambiaron mientras trabajabas. Recarga y vuelve a intentarlo.',
  gone: 'Este enlace o recurso ya no está disponible.',
  tooLarge: 'El archivo o los datos son demasiado grandes.',
  tooManyRequests: 'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.',
  tooManyRequestsWait: (wait: string) =>
    `Demasiados intentos seguidos. Espera ${wait} y vuelve a intentarlo.`,
  server: 'El servidor tuvo un problema. Intenta de nuevo en unos minutos.',
  network: 'No hay conexión con el servidor. Revisa tu conexión a internet.',
  timeout: 'El servidor tardó demasiado en responder. Intenta de nuevo.',
};

export interface ApiErrorMessageOptions {
  /** Texto de la pantalla para 5xx, errores desconocidos y 4xx sin texto propio. */
  fallback?: string;
  /** Mensajes contextuales por status (sustituyen al texto técnico/genérico). */
  byStatus?: Partial<Record<number, string>>;
  /** Sustituye al texto de «sin conexión». */
  network?: string;
  /** Sustituye al texto de «tardó demasiado». */
  timeout?: string;
}

const MAX_HUMAN_LENGTH = 240;
const MAX_VALIDATION_MESSAGES = 3;

const SPANISH_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'de', 'del', 'al',
  'que', 'y', 'e', 'o', 'u', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre',
  'se', 'su', 'sus', 'tu', 'tus', 'ya', 'es', 'son', 'está', 'están', 'esta',
  'este', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'otra', 'otro', 'otras',
  'otros', 'solo', 'sólo', 'más', 'como', 'cuando', 'hay', 'debe', 'deben', 'puede',
  'pueden', 'puedes', 'ser', 'tiene', 'tienen', 'existe', 'existen', 'admite',
  'admiten', 'pudo', 'falta', 'faltan', 'encontrado', 'encontrada', 'obligatorio',
  'obligatoria', 'válido', 'válida', 'inválido', 'inválida', 'mucho', 'muchos',
  'texto', 'lista', 'número', 'entero', 'verdadero', 'falso', 'formato', 'fecha',
  'nombre', 'paciente', 'moneda', 'sede', 'clínica', 'cita', 'receta', 'abono',
  'abonos', 'motivo', 'opción', 'ninguna', 'ninguno', 'todavía', 'aún', 'hoy',
  'puedo', 'vuelve', 'intenta',
]);

const ENGLISH_WORDS = new Set([
  'the', 'an', 'is', 'are', 'be', 'been', 'was', 'were', 'must', 'should', 'not',
  'found', 'cannot', 'can', 'could', 'invalid', 'already', 'required', 'only', 'of',
  'to', 'in', 'for', 'with', 'missing', 'unknown', 'does', 'do', 'belong',
  'unsupported', 'you', 'your', 'last', 'empty', 'failed', 'internal', 'server',
  'request', 'requests', 'denied', 'forbidden', 'unauthorized', 'allowed',
  'exist', 'exists', 'property', 'value', 'valid', 'number', 'string', 'array',
  'greater', 'less', 'than', 'match', 'each', 'too', 'many', 'insufficient',
  'role', 'token', 'after', 'before', 'or', 'and', 'on', 'at', 'by', 'from',
  'this', 'that', 'has', 'have', 'longer', 'entity', 'large', 'expected',
  'missing', 'blank', 'least', 'characters', 'date', 'email', 'already',
]);

// Palabras compartidas (a, no, plan, error, total…) no puntúan para ninguno:
// se dejan fuera de los dos conjuntos. Sufijos típicamente españoles, para
// palabras que no están en el vocabulario («desconocida», «anulación»).
const SPANISH_SUFFIX = /(ción|sión|ciones|dad|dades|ado|ada|ados|adas|ido|ida|idos|idas|mente)$/;
const SPANISH_MARKS = /[áéíóúñü¿¡]/i;
// Cosas que nunca deben llegar a la pantalla: trazas, SQL, JSON, rutas internas.
const INTERNAL_DUMP =
  /\n|\bat\s+\S+\s*\(|\b(select|insert|update|delete)\b[\s\S]*\b(from|into|set|where)\b|[{}]|\$\d|prisma|exception:/i;

/** `true` si `message` es un texto en español escrito para personas. */
export function isHumanSpanish(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > MAX_HUMAN_LENGTH || INTERNAL_DUMP.test(text)) return false;
  let spanish = SPANISH_MARKS.test(text) ? 2 : 0;
  let english = 0;
  for (const word of text.toLowerCase().split(/[^a-záéíóúñü]+/)) {
    if (!word) continue;
    if (ENGLISH_WORDS.has(word)) english += 1;
    else if (SPANISH_WORDS.has(word) || (word.length > 4 && SPANISH_SUFFIX.test(word))) spanish += 1;
  }
  return spanish > english;
}

/**
 * Segundos de una cabecera `Retry-After` (segundos o fecha HTTP). `null` si no
 * hay o no se entiende.
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value);
  if (/^-/.test(value)) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function waitLabel(seconds: number): string {
  if (seconds >= 90) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }
  return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
}

function withPeriod(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** Los mensajes del servidor que se pueden enseñar tal cual (o `null`). */
function serverSpanish(err: ApiError): string | null {
  const human = [...new Set(err.messages.map((m) => m.trim()))].filter(isHumanSpanish);
  if (human.length === 0) return null;
  if (human.length === 1) return human[0];
  return human.slice(0, MAX_VALIDATION_MESSAGES).map(withPeriod).join(' ');
}

function statusMessage(err: ApiError): string | null {
  switch (err.status) {
    case 400:
    case 422:
      return errorMessageCopy.validation;
    case 401:
      return errorMessageCopy.unauthorized;
    case 403:
      return errorMessageCopy.forbidden;
    case 404:
      return errorMessageCopy.notFound;
    case 409:
      return errorMessageCopy.conflict;
    case 410:
      return errorMessageCopy.gone;
    case 413:
      return errorMessageCopy.tooLarge;
    case 429:
      return err.retryAfterSeconds !== null && err.retryAfterSeconds > 0
        ? errorMessageCopy.tooManyRequestsWait(waitLabel(err.retryAfterSeconds))
        : errorMessageCopy.tooManyRequests;
    default:
      return null;
  }
}

function errorName(err: unknown): string | null {
  return err !== null && typeof err === 'object' && 'name' in err && typeof err.name === 'string'
    ? err.name
    : null;
}

/**
 * Texto en español para enseñar ante un fallo de la API. `fallbackOrOptions`
 * es el mensaje contextual de la pantalla («No pudimos cargar el catálogo.») o
 * las opciones completas. Ver la cabecera del módulo para el orden de decisión.
 */
export function apiErrorMessage(
  err: unknown,
  fallbackOrOptions: string | ApiErrorMessageOptions = {},
): string {
  const options: ApiErrorMessageOptions =
    typeof fallbackOrOptions === 'string' ? { fallback: fallbackOrOptions } : fallbackOrOptions;
  const fallback = options.fallback ?? errorMessageCopy.generic;

  if (!(err instanceof ApiError)) {
    const name = errorName(err);
    if (name === 'TimeoutError') return options.timeout ?? errorMessageCopy.timeout;
    // `fetch` rechaza con TypeError cuando no hay red, DNS, CORS o el servidor
    // cierra la conexión: para la persona, todo es «no hay conexión».
    if (err instanceof TypeError) return options.network ?? errorMessageCopy.network;
    return fallback;
  }

  const override = options.byStatus?.[err.status];
  if (err.status >= 500) return override ?? options.fallback ?? errorMessageCopy.server;
  return serverSpanish(err) ?? override ?? statusMessage(err) ?? fallback;
}
