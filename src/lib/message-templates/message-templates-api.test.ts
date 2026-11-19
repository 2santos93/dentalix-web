import {
  canManageMessageTemplates,
  listMessageTemplates,
  messageLength,
  messageTemplateErrorCopy,
  messageTemplateFailure,
  previewMessageTemplate,
  resetMessageTemplate,
  saveMessageTemplate,
  sendMessageTemplateTest,
} from './message-templates-api';
import { apiFetch } from '../api/client';
import { ApiError, NetworkError } from '../api/api-error';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const REMINDER = { key: 'appointment-reminder', channel: 'EMAIL', language: 'es' } as const;
const CONFIRMATION = { key: 'appointment-confirmation', channel: 'WHATSAPP', language: 'en' } as const;

describe('message-templates-api (DX-565)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue({} as never);
  });

  it('solo ADMIN gestiona los textos de los mensajes', () => {
    expect(canManageMessageTemplates('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canManageMessageTemplates(role)).toBe(false);
    }
  });

  it('lee el catálogo con sesión', async () => {
    await listMessageTemplates('tk');
    expect(mockedFetch).toHaveBeenCalledWith('/message-templates', { token: 'tk' });
  });

  it('guarda con PUT por clave, canal e idioma; el email lleva asunto', async () => {
    await saveMessageTemplate('tk', REMINDER, { subject: 'Tu cita en {clinica}', body: 'Hola {paciente}' });
    expect(mockedFetch).toHaveBeenCalledWith('/message-templates/appointment-reminder/EMAIL/es', {
      method: 'PUT',
      token: 'tk',
      body: { subject: 'Tu cita en {clinica}', body: 'Hola {paciente}' },
    });
  });

  it('WhatsApp nunca manda asunto, aunque el borrador traiga uno', async () => {
    await saveMessageTemplate('tk', CONFIRMATION, { subject: 'sobra', body: 'Hi {paciente}: {enlace}' });
    expect(mockedFetch).toHaveBeenCalledWith('/message-templates/appointment-confirmation/WHATSAPP/en', {
      method: 'PUT',
      token: 'tk',
      body: { subject: null, body: 'Hi {paciente}: {enlace}' },
    });
  });

  it('restablece con DELETE, previsualiza y prueba con POST', async () => {
    await resetMessageTemplate('tk', REMINDER);
    expect(mockedFetch).toHaveBeenLastCalledWith('/message-templates/appointment-reminder/EMAIL/es', {
      method: 'DELETE',
      token: 'tk',
    });
    await previewMessageTemplate('tk', REMINDER, { subject: 'A', body: 'B' });
    expect(mockedFetch).toHaveBeenLastCalledWith('/message-templates/appointment-reminder/EMAIL/es/preview', {
      method: 'POST',
      token: 'tk',
      body: { subject: 'A', body: 'B' },
    });
    await sendMessageTemplateTest('tk', REMINDER, { subject: 'A', body: 'B' });
    expect(mockedFetch).toHaveBeenLastCalledWith('/message-templates/appointment-reminder/EMAIL/es/test', {
      method: 'POST',
      token: 'tk',
      body: { subject: 'A', body: 'B' },
    });
    await sendMessageTemplateTest('tk', REMINDER);
    expect(mockedFetch).toHaveBeenLastCalledWith('/message-templates/appointment-reminder/EMAIL/es/test', {
      method: 'POST',
      token: 'tk',
    });
  });

  describe('messageTemplateFailure', () => {
    it('400 MESSAGE_TEMPLATE_INVALID: el texto de la API junto al campo que dice', () => {
      const err = new ApiError(400, '{importe} no se puede usar en el recordatorio: los mensajes al paciente no llevan importes ni datos clínicos.', {
        code: 'MESSAGE_TEMPLATE_INVALID',
        field: 'body',
      });
      expect(messageTemplateFailure(err, messageTemplateErrorCopy.save)).toEqual({
        field: 'body',
        message: '{importe} no se puede usar en el recordatorio: los mensajes al paciente no llevan importes ni datos clínicos.',
        retryAfterSeconds: null,
      });
      const subject = new ApiError(400, 'El asunto no puede pasar de 150 caracteres.', {
        code: 'MESSAGE_TEMPLATE_INVALID',
        field: 'subject',
      });
      expect(messageTemplateFailure(subject, messageTemplateErrorCopy.save).field).toBe('subject');
    });

    it('un campo desconocido va arriba del editor', () => {
      const err = new ApiError(400, 'Escribe el texto del mensaje.', { code: 'MESSAGE_TEMPLATE_INVALID', field: 'otro' });
      expect(messageTemplateFailure(err, messageTemplateErrorCopy.save).field).toBeNull();
    });

    it('409 EMAIL_NOT_VERIFIED: pide confirmar el correo', () => {
      const err = new ApiError(409, 'Confirma tu correo…', { code: 'EMAIL_NOT_VERIFIED' });
      expect(messageTemplateFailure(err, messageTemplateErrorCopy.test)).toEqual({
        field: null,
        message: messageTemplateErrorCopy.notVerified,
        retryAfterSeconds: null,
      });
    });

    it('429: el texto de la API y la espera', () => {
      const err = new ApiError(429, 'Ya te enviamos una prueba hace un momento. Espera 4 minutos para pedir otra.', {
        retryAfterSeconds: 240,
      });
      expect(messageTemplateFailure(err, messageTemplateErrorCopy.test)).toEqual({
        field: null,
        message: 'Ya te enviamos una prueba hace un momento. Espera 4 minutos para pedir otra.',
        retryAfterSeconds: 240,
      });
    });

    it('sin red: el texto de siempre, sin campo', () => {
      const failure = messageTemplateFailure(new NetworkError(new TypeError('Failed to fetch')), messageTemplateErrorCopy.save);
      expect(failure.field).toBeNull();
      expect(failure.message).toMatch(/conexión/i);
    });
  });

  it('cuenta caracteres como la API (puntos de código)', () => {
    expect(messageLength('Hola 😀')).toBe(6);
  });
});
