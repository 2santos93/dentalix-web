import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-565: Ajustes › Mensajes. Los textos que la clínica puede cambiar de los
 * mensajes al paciente (recordatorio, confirmación por WhatsApp, oferta de
 * hueco, seguimiento del presupuesto, serie de citas, solicitud de firma).
 * Sin texto guardado sale el de siempre; el esqueleto del email (saludo,
 * botón con el enlace, pie y baja) no se edita. Solo ADMIN (la API: 403).
 */
export type MessageTemplates = components['schemas']['MessageTemplatesDto'];
export type MessageEntry = components['schemas']['MessageDto'];
export type MessageKey = MessageEntry['key'];
export type MessageChannelEntry = components['schemas']['MessageChannelDto'];
export type MessageChannel = MessageChannelEntry['channel'];
export type MessageLanguageEntry = components['schemas']['MessageLanguageDto'];
export type MessageLanguage = MessageLanguageEntry['language'];
export type MessageVariable = components['schemas']['MessageVariableDto'];
export type MessageTemplate = components['schemas']['MessageTemplateDto'];
export type MessagePreview = components['schemas']['MessagePreviewDto'];
export type MessageTestResult = components['schemas']['MessageTestResultDto'];

/** El borrador que se guarda, se previsualiza o se prueba. */
export interface MessageDraft {
  /** Solo email; en WhatsApp va `null`. */
  subject: string | null;
  body: string;
}

/** Qué combinación se edita: `/:key/:channel/:language`. */
export interface MessageTarget {
  key: MessageKey;
  channel: MessageChannel;
  language: MessageLanguage;
}

/** 400 con el campo culpable (asunto o cuerpo): se pinta junto a él. */
export const MESSAGE_TEMPLATE_INVALID = 'MESSAGE_TEMPLATE_INVALID';
/** 409 de la prueba: quien la pide no confirmó su correo. */
export const MESSAGE_TEMPLATE_EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/** Solo ADMIN ve y cambia los textos (la API también lo exige). Solo decide qué se PINTA. */
export function canManageMessageTemplates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

function path({ key, channel, language }: MessageTarget): string {
  return `/message-templates/${encodeURIComponent(key)}/${encodeURIComponent(channel)}/${encodeURIComponent(language)}`;
}

/** El cuerpo que esperan PUT, preview y test: WhatsApp nunca lleva asunto. */
function bodyOf(channel: MessageChannel, draft: MessageDraft): { subject: string | null; body: string } {
  return { subject: channel === 'EMAIL' ? (draft.subject ?? '') : null, body: draft.body };
}

/** `GET /message-templates`: el catálogo, con el texto por defecto y el guardado por idioma. */
export function listMessageTemplates(token: string): Promise<MessageTemplates> {
  return apiFetch<MessageTemplates>('/message-templates', { token });
}

/** `PUT …/:key/:channel/:language`: guarda el texto de la clínica (auditado). */
export function saveMessageTemplate(token: string, target: MessageTarget, draft: MessageDraft): Promise<MessageTemplate> {
  return apiFetch<MessageTemplate>(path(target), { method: 'PUT', token, body: bodyOf(target.channel, draft) });
}

/** `DELETE …`: «Restablecer», vuelve al texto por defecto (`custom: null`). */
export function resetMessageTemplate(token: string, target: MessageTarget): Promise<MessageTemplate> {
  return apiFetch<MessageTemplate>(path(target), { method: 'DELETE', token });
}

/**
 * `POST …/preview`: el borrador con datos de ejemplo, sin guardar ni enviar.
 * Quien la pide descarta las respuestas viejas (el cliente no cancela).
 */
export function previewMessageTemplate(token: string, target: MessageTarget, draft: MessageDraft): Promise<MessagePreview> {
  return apiFetch<MessagePreview>(`${path(target)}/preview`, { method: 'POST', token, body: bodyOf(target.channel, draft) });
}

/**
 * `POST …/test`: manda el borrador (o, sin él, lo guardado) al correo de quien
 * lo pide, con «[Prueba]» y datos de ejemplo. Solo email. 409 sin correo
 * confirmado; 429 una cada 5 minutos por persona.
 */
export function sendMessageTemplateTest(
  token: string,
  target: MessageTarget,
  draft?: MessageDraft,
): Promise<MessageTestResult> {
  return apiFetch<MessageTestResult>(`${path(target)}/test`, {
    method: 'POST',
    token,
    ...(draft ? { body: bodyOf(target.channel, draft) } : {}),
  });
}

/** Qué dice un fallo al guardar, previsualizar o probar, y junto a qué campo. */
export interface MessageTemplateFailure {
  /** `subject`/`body`: junto al campo; `null`: arriba del editor. */
  field: 'subject' | 'body' | null;
  text: string;
  /** 429: cuántos segundos esperar antes de volver a pedir la prueba. */
  retryAfterSeconds: number | null;
}

export const messageTemplateErrorCopy = {
  notVerified: 'Confirma tu correo antes de pedir una prueba: solo se envía a correos confirmados.',
  save: 'No pudimos guardar el texto.',
  reset: 'No pudimos restablecer el texto.',
  test: 'No pudimos enviar la prueba.',
  preview: 'No pudimos cargar la vista previa.',
};

/**
 * El 400 `MESSAGE_TEMPLATE_INVALID` va junto al campo que diga la API; el 409
 * de correo sin confirmar, con su texto; el 429, con la espera. El texto
 * siempre pasa por `apiErrorMessage` (DX-063: nadie lee `err.message`).
 */
export function messageTemplateFailure(err: unknown, fallback: string): MessageTemplateFailure {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === MESSAGE_TEMPLATE_EMAIL_NOT_VERIFIED) {
      return { field: null, text: messageTemplateErrorCopy.notVerified, retryAfterSeconds: null };
    }
    if (err.status === 400 && err.code === MESSAGE_TEMPLATE_INVALID) {
      const field = err.field === 'subject' || err.field === 'body' ? err.field : null;
      return { field, text: apiErrorMessage(err, fallback), retryAfterSeconds: null };
    }
    if (err.status === 429) {
      return { field: null, text: apiErrorMessage(err, fallback), retryAfterSeconds: err.retryAfterSeconds ?? null };
    }
  }
  return { field: null, text: apiErrorMessage(err, fallback), retryAfterSeconds: null };
}

/** Caracteres como los cuenta la API: puntos de código (un emoji cuenta uno). */
export function messageLength(text: string): number {
  return [...text].length;
}
