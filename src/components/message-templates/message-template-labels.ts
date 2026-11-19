import type { MessageChannel, MessageKey } from '@/lib/message-templates/message-templates-api';

/** Nombre del canal en pantalla. */
export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
};

/**
 * DX-565 (decisión 4 de la API): a quien responde por un menor le sale siempre
 * el texto estándar de estos emails; el editable habla de «tu cita».
 */
export const GUARDIAN_STANDARD_TEXT: ReadonlySet<MessageKey> = new Set([
  'appointment-reminder',
  'quote-follow-up',
  'appointment-series',
  'signature-request',
]);

export const messageStatusCopy = {
  isDefault: 'Por defecto',
  custom: 'Personalizado',
};
