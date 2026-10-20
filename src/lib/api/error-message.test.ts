import { ApiError, NetworkError } from './api-error';
import {
  apiErrorMessage,
  errorMessageCopy,
  isHumanSpanish,
  parseRetryAfter,
} from './error-message';

describe('isHumanSpanish — heurística de idioma', () => {
  it.each([
    'No se puede rechazar un plan con abonos',
    'Paciente no encontrado',
    'Examen periodontal no encontrado',
    'Otra opción ya aceptada',
    'Ya existe un insumo con ese nombre en esta sede.',
    'Solo puedes anular los abonos que registraste hoy.',
    'page debe ser un número entero.',
    'Moneda desconocida: XYZ',
    'La receta ya está anulada',
    'Zona horaria inválida: Mars/Base',
    'Esta cuenta da acceso a otra clínica: pide a la persona que espere unos minutos o que restablezca su contraseña',
    // SEC-041: precio por debajo del de catálogo (403 y 422 de los ítems del plan).
    'Precio por debajo del de catálogo: cuenta como descuento. Tu rol permite hasta un 10 % de descuento por ítem.',
    'Precio por debajo del de catálogo: cuenta como descuento y supera el 10 %. Indica el motivo del descuento.',
    // DX-233: 409 del modo estricto y 400 del solape entre sedes.
    'Fuera del horario del profesional en Sede Norte (jueves 22/10: 14:00–19:00). La clínica no permite citar fuera del horario del profesional.',
    'Fuera del horario del profesional: no trabaja en Sede Norte el jueves 22/10. La clínica no permite citar fuera del horario del profesional.',
  ])('reconoce como español: %s', (msg) => {
    expect(isHumanSpanish(msg)).toBe(true);
  });

  it.each([
    'Internal server error',
    'Patient not found',
    'Insufficient role',
    'Request failed (500)',
    'currency must be a real ISO 4217 currency code',
    'name should not be empty',
    'property foo should not exist',
    'Invalid credentials',
    'ThrottlerException: Too Many Requests',
    'Tenant mismatch',
    'Session is no longer valid',
    'Nope',
    '',
    'HTTP 500',
    'cityId does not belong to countryCode',
  ])('trata como técnico (inglés o sin señal): %s', (msg) => {
    expect(isHumanSpanish(msg)).toBe(false);
  });

  it('descarta lo que parece un volcado interno aunque tenga palabras en español', () => {
    expect(isHumanSpanish('Error en la consulta:\n    at PrismaClient.query (/app/x.js:1:1)')).toBe(false);
    expect(isHumanSpanish('Falló la consulta SELECT * FROM "patients" WHERE "id" = $1')).toBe(false);
    expect(isHumanSpanish(`No se pudo ${'guardar '.repeat(60)}`)).toBe(false);
  });
});

describe('apiErrorMessage — por status', () => {
  it('400 con mensaje técnico → texto de validación en español', () => {
    expect(apiErrorMessage(new ApiError(400, 'date must match YYYY-MM-DD'))).toBe(
      errorMessageCopy.validation,
    );
  });

  it('400 con mensaje de negocio en español → se conserva', () => {
    expect(apiErrorMessage(new ApiError(400, 'El motivo de la anulación es obligatorio'))).toBe(
      'El motivo de la anulación es obligatorio',
    );
  });

  it('400 con array de class-validator: se quedan los mensajes en español', () => {
    const err = new ApiError(400, 'x', {
      messages: [
        'Las notas no pueden superar 2000 caracteres',
        'property foo should not exist',
        'Una receta admite como mucho 10 medicamentos',
      ],
    });
    expect(apiErrorMessage(err)).toBe(
      'Las notas no pueden superar 2000 caracteres. Una receta admite como mucho 10 medicamentos.',
    );
  });

  it('400 con array solo en inglés → texto de validación genérico', () => {
    const err = new ApiError(400, 'x', {
      messages: ['name should not be empty', 'email must be an email'],
    });
    expect(apiErrorMessage(err)).toBe(errorMessageCopy.validation);
  });

  it('400 con array: deduplica y limita a 3', () => {
    const err = new ApiError(400, 'x', {
      messages: [
        'El nombre es obligatorio.',
        'El nombre es obligatorio.',
        'La fecha debe tener el formato AAAA-MM-DD.',
        'Las notas deben ser texto.',
        'Los medicamentos deben ser una lista.',
      ],
    });
    expect(apiErrorMessage(err)).toBe(
      'El nombre es obligatorio. La fecha debe tener el formato AAAA-MM-DD. Las notas deben ser texto.',
    );
  });

  it('401 → sesión caducada', () => {
    expect(apiErrorMessage(new ApiError(401, 'Unauthorized'))).toBe(errorMessageCopy.unauthorized);
  });

  it('403 técnico («Insufficient role») → sin permiso', () => {
    expect(apiErrorMessage(new ApiError(403, 'Insufficient role'))).toBe(errorMessageCopy.forbidden);
  });

  it('403 con regla de negocio en español → se conserva', () => {
    const msg = 'Solo puedes anular los abonos que registraste hoy.';
    expect(apiErrorMessage(new ApiError(403, msg))).toBe(msg);
  });

  it('404 técnico → no encontrado', () => {
    expect(apiErrorMessage(new ApiError(404, 'Patient not found'))).toBe(errorMessageCopy.notFound);
  });

  it('409 de regla de dominio en español → se conserva', () => {
    const msg = 'No se puede rechazar un plan con abonos';
    expect(apiErrorMessage(new ApiError(409, msg))).toBe(msg);
  });

  it('409 técnico → conflicto', () => {
    expect(apiErrorMessage(new ApiError(409, 'Conflict'))).toBe(errorMessageCopy.conflict);
  });

  it('410 → ya no disponible', () => {
    expect(apiErrorMessage(new ApiError(410, 'Gone'))).toBe(errorMessageCopy.gone);
  });

  it('413 → demasiado grande', () => {
    expect(apiErrorMessage(new ApiError(413, 'request entity too large'))).toBe(
      errorMessageCopy.tooLarge,
    );
  });

  it('422 técnico → validación', () => {
    expect(apiErrorMessage(new ApiError(422, 'Unprocessable Entity'))).toBe(
      errorMessageCopy.validation,
    );
  });

  it('429 con Retry-After en segundos', () => {
    const err = new ApiError(429, 'ThrottlerException: Too Many Requests', { retryAfterSeconds: 30 });
    expect(apiErrorMessage(err)).toBe(
      'Demasiados intentos seguidos. Espera 30 segundos.',
    );
  });

  it('429 con Retry-After largo → minutos; 1 → singular', () => {
    expect(apiErrorMessage(new ApiError(429, 'x', { retryAfterSeconds: 300 }))).toBe(
      'Demasiados intentos seguidos. Espera 5 minutos.',
    );
    expect(apiErrorMessage(new ApiError(429, 'x', { retryAfterSeconds: 1 }))).toBe(
      'Demasiados intentos seguidos. Espera 1 segundo.',
    );
  });

  it('429 sin Retry-After', () => {
    expect(apiErrorMessage(new ApiError(429, 'x'))).toBe(errorMessageCopy.tooManyRequests);
  });

  it('5xx nunca muestra el texto del servidor (aunque sea español)', () => {
    expect(apiErrorMessage(new ApiError(500, 'Internal server error'))).toBe(errorMessageCopy.server);
    expect(apiErrorMessage(new ApiError(500, 'Ocurrió un error procesando la solicitud.'))).toBe(
      errorMessageCopy.server,
    );
    expect(apiErrorMessage(new ApiError(503, 'Service Unavailable'))).toBe(errorMessageCopy.server);
  });

  it('5xx usa el fallback de la pantalla si lo hay', () => {
    expect(apiErrorMessage(new ApiError(500, 'boom'), 'No pudimos cargar el catálogo.')).toBe(
      'No pudimos cargar el catálogo.',
    );
  });

  it('otro 4xx técnico sin texto propio → fallback o genérico', () => {
    expect(apiErrorMessage(new ApiError(418, "I'm a teapot"))).toBe(errorMessageCopy.generic);
    expect(apiErrorMessage(new ApiError(418, "I'm a teapot"), 'No se pudo.')).toBe('No se pudo.');
  });
});

describe('apiErrorMessage — red y errores que no son de la API', () => {
  it('fallo de red (NetworkError del cliente) → sin conexión', () => {
    expect(apiErrorMessage(new NetworkError(new TypeError('Failed to fetch')))).toBe(
      errorMessageCopy.network,
    );
  });

  // Revisión D-2: un TypeError de programación (p. ej. al procesar la respuesta)
  // no es «sin conexión»: va al texto de la pantalla.
  it('un TypeError cualquiera NO se presenta como falta de conexión', () => {
    expect(apiErrorMessage(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(
      errorMessageCopy.generic,
    );
    expect(apiErrorMessage(new TypeError('Failed to fetch'), 'No pudimos cargar.')).toBe(
      'No pudimos cargar.',
    );
  });

  it('timeout → tardó demasiado', () => {
    const err = new Error('signal timed out');
    err.name = 'TimeoutError';
    expect(apiErrorMessage(err)).toBe(errorMessageCopy.timeout);
  });

  it('cualquier otro error → fallback o genérico, nunca su `message`', () => {
    expect(apiErrorMessage(new Error('Cannot read properties of undefined'))).toBe(
      errorMessageCopy.generic,
    );
    expect(apiErrorMessage('x', 'No pudimos guardar.')).toBe('No pudimos guardar.');
    expect(apiErrorMessage(undefined)).toBe(errorMessageCopy.generic);
  });
});

describe('apiErrorMessage — overrides por pantalla', () => {
  it('el override contextual sustituye al texto técnico', () => {
    expect(
      apiErrorMessage(new ApiError(404, 'Patient not found'), {
        byStatus: { 404: 'No se encontró el paciente.' },
      }),
    ).toBe('No se encontró el paciente.');
  });

  it('el override también aplica a 401 (p. ej. credenciales en el login)', () => {
    expect(
      apiErrorMessage(new ApiError(401, 'Invalid credentials'), {
        byStatus: { 401: 'Correo o contraseña incorrectos.' },
      }),
    ).toBe('Correo o contraseña incorrectos.');
  });

  it('un mensaje de negocio en español del servidor gana al override', () => {
    expect(
      apiErrorMessage(new ApiError(409, 'Otra opción ya aceptada'), {
        byStatus: { 409: 'No pudimos aceptar el plan.' },
      }),
    ).toBe('Otra opción ya aceptada');
  });

  it('override de 5xx y de red', () => {
    expect(
      apiErrorMessage(new ApiError(502, 'Bad Gateway'), { byStatus: { 502: 'Pasarela caída.' } }),
    ).toBe('Pasarela caída.');
    expect(apiErrorMessage(new NetworkError(new TypeError('x')), { network: 'Sin red.' })).toBe('Sin red.');
  });

  it('fallback dentro de las opciones', () => {
    expect(apiErrorMessage(new ApiError(500, 'x'), { fallback: 'No pudimos cargar.' })).toBe(
      'No pudimos cargar.',
    );
  });
});

describe('parseRetryAfter', () => {
  it('segundos', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });
  it('fecha HTTP', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    expect(parseRetryAfter('Fri, 16 Oct 2026 12:00:45 GMT', now)).toBe(45);
  });
  it('ausente o inválido', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('mañana')).toBeNull();
    expect(parseRetryAfter('-5')).toBeNull();
  });
});

describe('apiErrorMessage — correcciones tras la revisión', () => {
  // D-1: un mensaje de dominio largo (la alerta de alergia con sus alérgenos)
  // se conserva cuando la pantalla sube el límite.
  it('maxLength permite conservar un mensaje en español de más de 240 caracteres', () => {
    const detail = Array.from({ length: 6 }, (_, i) => `Alérgeno de nombre largo número ${i + 1} (principio activo)`).join(', ');
    const msg = `Alerta de alergia: el paciente tiene registrada alergia a ${detail}. Confirma que prescribes igualmente.`;
    expect(msg.length).toBeGreaterThan(240);
    expect(apiErrorMessage(new ApiError(409, msg))).toBe(errorMessageCopy.conflict);
    expect(apiErrorMessage(new ApiError(409, msg), { maxLength: 2000 })).toBe(msg);
  });

  // M-5: unas llaves sueltas no son un volcado; un objeto JSON sí.
  it('conserva mensajes con {{variables}} y descarta los que llevan JSON', () => {
    expect(isHumanSpanish('Variables desconocidas en el texto: {{nombre}}')).toBe(true);
    expect(isHumanSpanish('Falló la validación de la petición: {"campo": "valor"}')).toBe(false);
  });

  // M-1: el genérico del 409 no presupone concurrencia.
  it('el 409 genérico no habla de cambios concurrentes', () => {
    expect(errorMessageCopy.conflict).not.toMatch(/mientras/i);
  });

  // M-7 (Way-Out Rule): los textos que acaban en superficies con Reintentar no
  // repiten «Intenta de nuevo».
  it.each(['generic', 'server', 'timeout', 'conflict', 'tooManyRequests', 'network'] as const)(
    'el texto %s no dice «intenta de nuevo»',
    (key) => {
      expect(errorMessageCopy[key]).not.toMatch(/intenta de nuevo|vuelve a intentarlo/i);
    },
  );
});
