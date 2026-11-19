import type { MessageChannel, MessageLanguageEntry } from '@/lib/message-templates/message-templates-api';

/** Nombre del canal en pantalla. */
export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
};

export const messageStatusCopy = {
  isDefault: 'Por defecto',
  custom: 'Personalizado',
  invalid: 'No válido',
  invalidNotice: (reason: string) =>
    `Este texto ya no es válido: ${reason.trim().replace(/[.\s]+$/, '')}. Se está usando el texto por defecto.`,
};

export type MessageStatus = 'default' | 'custom' | 'invalid';

/**
 * Qué sale en este idioma: el texto por defecto, el de la clínica, o el de la
 * clínica guardado pero ya no válido (DX-565: la API dice el motivo y envía el
 * de por defecto).
 */
export function messageStatus(entry: MessageLanguageEntry): MessageStatus {
  if (!entry.custom) return 'default';
  return entry.custom.invalid ? 'invalid' : 'custom';
}

export const MESSAGE_STATUS_BADGE: Record<MessageStatus, { label: string; variant: 'neutral' | 'info' | 'warning' }> = {
  default: { label: messageStatusCopy.isDefault, variant: 'neutral' },
  custom: { label: messageStatusCopy.custom, variant: 'info' },
  invalid: { label: messageStatusCopy.invalid, variant: 'warning' },
};
