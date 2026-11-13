import type { ConfirmationAction, EarlierWindow } from '@/lib/appointments/confirmations-api';

/**
 * DX-497: catálogo de textos de la página pública `/confirmar/[token]`, por
 * CLAVE y por idioma (nunca `if (lang === 'en')` en el componente). La página
 * abre en el idioma del paciente de la cita (lo manda la API) si está aquí; si
 * no, en el de la clínica. El paciente puede cambiarlo en la página: no toca
 * su ficha.
 *
 * Las fechas, horas e importes NO son del catálogo: salen con el locale, la
 * zona y el reloj de la sede (DX-354, DX-315), sea cual sea el idioma.
 *
 * Añadir un idioma = añadir su entrada aquí; el tipo obliga a dar todas las
 * claves.
 */
export interface PublicConfirmationCopy {
  /** Nombre del idioma en sí mismo, para el selector. */
  languageName: string;
  languageLabel: string;
  documentTitle: string;
  loading: string;
  loadError: string;
  loadErrorTitle: string;
  retry: string;
  greeting: (name: string | null) => string;
  pendingLead: string;
  dayLabel: string;
  timeLabel: string;
  providerLabel: string;
  locationLabel: string;
  confirm: string;
  callMe: string;
  cancel: string;
  respondError: string;
  respondedTitle: string;
  responded: Record<ConfirmationAction, string>;
  expiredTitle: string;
  expiredMessage: string;
  invalidTitle: string;
  invalidMessage: string;
  fallbackClinic: string;
  policyTitle: string;
  policyNotice: (hours: number) => string;
  policyFee: (amount: string) => string;
  lateTitle: (hours: number) => string;
  lateMessage: string;
  acknowledge: string;
  noFormat: string;
  feeNeedsClinicTitle: string;
  feeNeedsClinicMessage: string;
  acknowledgeRequired: (hours: number) => string;
  earlierTitle: string;
  earlierLabel: string;
  earlierHint: string;
  earlierWindowLabel: string;
  earlierWindows: Record<EarlierWindow, string>;
  earlierSaved: (window: EarlierWindow) => string;
  earlierCleared: string;
  earlierError: string;
  calendarTitle: string;
  calendarIcs: string;
  calendarGoogle: string;
}

const es: PublicConfirmationCopy = {
  languageName: 'Español',
  languageLabel: 'Idioma',
  documentTitle: 'Confirma tu cita',
  loading: 'Cargando tu cita…',
  // Sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  loadError: 'No pudimos cargar tu cita. Revisa tu conexión.',
  loadErrorTitle: 'No se pudo cargar',
  retry: 'Reintentar',
  greeting: (name) => (name ? `Hola ${name},` : 'Hola,'),
  pendingLead: 'tienes esta cita. ¿Nos confirmas si vienes?',
  dayLabel: 'Fecha',
  timeLabel: 'Hora',
  providerLabel: 'Profesional',
  locationLabel: 'Sede',
  confirm: 'Confirmar asistencia',
  callMe: 'Quiero que me llamen',
  cancel: 'Cancelar cita',
  respondError: 'No pudimos enviar tu respuesta. Revisa tu conexión e intenta de nuevo.',
  respondedTitle: 'Ya respondiste',
  responded: {
    confirm: 'Confirmaste tu asistencia. ¡Te esperamos!',
    cancel: 'Cancelaste la cita. Si quieres otra fecha, comunícate con la clínica.',
    call_me: 'Te llamaremos pronto para coordinar tu cita.',
  },
  expiredTitle: 'Este enlace ya no es válido',
  expiredMessage:
    'Caducó o la cita cambió después de enviarlo. Si necesitas confirmar o cambiar tu cita, comunícate con la clínica.',
  invalidTitle: 'Enlace no válido',
  invalidMessage:
    'No encontramos este enlace. Revisa que esté completo o pide a la clínica que te lo envíe de nuevo.',
  fallbackClinic: 'Tu clínica',
  // DX-291: la política de cancelación de la sede.
  policyTitle: 'Política de cancelación',
  policyNotice: (hours) => `Si no puedes asistir, avísanos con al menos ${hours} h de antelación.`,
  policyFee: (amount) => `Cargo por inasistencia o cancelación tardía: ${amount}.`,
  lateTitle: (hours) => `Cancelación con menos de ${hours} h de aviso`,
  lateMessage:
    'Si cancelas ahora, cuenta como cancelación tardía según la política de la clínica. Si prefieres, pide que te llamemos para buscar otra hora.',
  acknowledge: 'He leído y acepto la política de cancelación de la clínica',
  // DX-354: la sede de la cita no tiene zona, formato o reloj: no hay quien lo configure, así que se manda a la clínica.
  noFormat: 'Llama a la clínica para confirmar la hora de tu cita.',
  // DX-354: con la sede sin formato no se puede escribir el cargo: nunca «—» en su lugar; se cancela por teléfono.
  feeNeedsClinicTitle: 'Para cancelar ahora, llama a la clínica',
  feeNeedsClinicMessage:
    'Cancelar con tan poco aviso tiene un cargo según la política de la clínica y aquí no podemos mostrártelo. Llama a la clínica para cancelar o para que te llamemos a ti.',
  acknowledgeRequired: (hours) =>
    `Para cancelar con menos de ${hours} h de aviso, marca que aceptas la política de cancelación.`,
  // DX-437: «Avisarme si se libera un hueco antes».
  earlierTitle: '¿Quieres venir antes?',
  earlierLabel: 'Si se libera un hueco antes, avísame',
  earlierHint: 'Tu cita de ahora se mantiene. Te avisaremos solo si queda un hueco que te sirva.',
  earlierWindowLabel: 'Franja',
  earlierWindows: {
    ANY: 'Cualquier hora',
    MORNING: 'Mañanas',
    AFTERNOON: 'Tardes',
  },
  earlierSaved: (window) =>
    window === 'ANY'
      ? 'Listo. Te avisaremos si se libera un hueco antes.'
      : `Listo. Te avisaremos si se libera un hueco antes (${es.earlierWindows[window].toLowerCase()}).`,
  earlierCleared: 'Listo. No te avisaremos de huecos anteriores.',
  earlierError: 'No pudimos guardar tu preferencia. Revisa tu conexión e intenta de nuevo.',
  // DX-469: «Añadir a mi calendario».
  calendarTitle: 'Añadir a mi calendario',
  calendarIcs: 'Apple, Outlook u otro (.ics)',
  calendarGoogle: 'Google Calendar',
};

const en: PublicConfirmationCopy = {
  languageName: 'English',
  languageLabel: 'Language',
  documentTitle: 'Confirm your appointment',
  loading: 'Loading your appointment…',
  loadError: 'We could not load your appointment. Check your connection.',
  loadErrorTitle: 'Could not load',
  retry: 'Try again',
  greeting: (name) => (name ? `Hello ${name},` : 'Hello,'),
  pendingLead: 'you have this appointment. Can you confirm you are coming?',
  dayLabel: 'Date',
  timeLabel: 'Time',
  providerLabel: 'Provider',
  locationLabel: 'Location',
  confirm: 'Confirm attendance',
  callMe: 'Please call me',
  cancel: 'Cancel appointment',
  respondError: 'We could not send your answer. Check your connection and try again.',
  respondedTitle: 'You already answered',
  responded: {
    confirm: 'You confirmed your attendance. See you soon!',
    cancel: 'You cancelled the appointment. If you would like another date, please contact the clinic.',
    call_me: 'We will call you soon to arrange your appointment.',
  },
  expiredTitle: 'This link is no longer valid',
  expiredMessage:
    'It expired or the appointment changed after it was sent. To confirm or change your appointment, please contact the clinic.',
  invalidTitle: 'Invalid link',
  invalidMessage:
    'We could not find this link. Check that it is complete or ask the clinic to send it again.',
  fallbackClinic: 'Your clinic',
  policyTitle: 'Cancellation policy',
  policyNotice: (hours) => `If you cannot make it, please let us know at least ${hours} h in advance.`,
  policyFee: (amount) => `Fee for a missed appointment or late cancellation: ${amount}.`,
  lateTitle: (hours) => `Cancellation with less than ${hours} h notice`,
  lateMessage:
    'If you cancel now, it counts as a late cancellation under the clinic’s policy. If you prefer, ask us to call you to find another time.',
  acknowledge: 'I have read and accept the clinic’s cancellation policy',
  noFormat: 'Please call the clinic to confirm the time of your appointment.',
  feeNeedsClinicTitle: 'To cancel now, please call the clinic',
  feeNeedsClinicMessage:
    'Cancelling with such short notice has a fee under the clinic’s policy and we cannot show it here. Call the clinic to cancel or to have them call you.',
  acknowledgeRequired: (hours) =>
    `To cancel with less than ${hours} h notice, tick that you accept the cancellation policy.`,
  earlierTitle: 'Would you like to come earlier?',
  earlierLabel: 'Let me know if an earlier slot opens up',
  earlierHint: 'Your current appointment stays as it is. We will only let you know if a slot that suits you opens up.',
  earlierWindowLabel: 'Time of day',
  earlierWindows: {
    ANY: 'Any time',
    MORNING: 'Mornings',
    AFTERNOON: 'Afternoons',
  },
  earlierSaved: (window) =>
    window === 'ANY'
      ? 'Done. We will let you know if an earlier slot opens up.'
      : `Done. We will let you know if an earlier slot opens up (${en.earlierWindows[window].toLowerCase()}).`,
  earlierCleared: 'Done. We will not let you know about earlier slots.',
  earlierError: 'We could not save your preference. Check your connection and try again.',
  calendarTitle: 'Add to my calendar',
  calendarIcs: 'Apple, Outlook or other (.ics)',
  calendarGoogle: 'Google Calendar',
};

export const PUBLIC_CONFIRMATION_COPY = { es, en } as const;
export type PageLanguage = keyof typeof PUBLIC_CONFIRMATION_COPY;
export const PAGE_LANGUAGES = Object.keys(PUBLIC_CONFIRMATION_COPY) as PageLanguage[];
/** El idioma de la clínica: el de la página sin preferencia o sin traducción. */
export const CLINIC_PAGE_LANGUAGE: PageLanguage = 'es';

function isPageLanguage(tag: string): tag is PageLanguage {
  return (PAGE_LANGUAGES as string[]).includes(tag);
}

/**
 * El idioma del catálogo para la etiqueta del paciente: la exacta, si no su
 * idioma base (`en-GB` → `en`), si no el de la clínica (p. ej. `ca`).
 */
export function resolvePageLanguage(tag: string | null | undefined): PageLanguage {
  if (!tag) return CLINIC_PAGE_LANGUAGE;
  if (isPageLanguage(tag)) return tag;
  const base = tag.split('-')[0];
  return isPageLanguage(base) ? base : CLINIC_PAGE_LANGUAGE;
}
