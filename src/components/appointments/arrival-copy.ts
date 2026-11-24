import type { PageLanguage } from './public-confirmation-copy';

/**
 * DX-265: textos de «Ya llegué» en la página del enlace de la cita y en la del
 * QR de la sede. Tuteo, como el resto del enlace. Nunca dicen QUÉ está
 * pendiente (anamnesis, consentimiento, saldo…): solo «pasa por recepción».
 */
export interface ArrivalCopy {
  heading: string;
  lead: (location: string) => string;
  button: string;
  tooEarly: (time: string | null) => string;
  tooLate: string;
  takeSeatTitle: (name: string | null) => string;
  takeSeat: string;
  seeReceptionTitle: (name: string | null) => string;
  seeReception: string;
  arrivedNoResult: string;
  turn: (n: number) => string;
  appointmentAt: (time: string, location: string) => string;
  error: string;
  // Página del QR
  qrTitle: string;
  qrLead: (location: string) => string;
  documentLabel: string;
  documentHint: string;
  documentRequired: string;
  birthDateLabel: string;
  birthDateHint: string;
  birthDateRequired: string;
  qrSubmit: string;
  noMatch: string;
  noMatchHelp: string;
  lockedTitle: string;
  lockedWait: (minutes: number) => string;
  inactiveTitle: string;
  inactiveMessage: string;
  loadErrorTitle: string;
  loadError: string;
  retry: string;
  again: string;
}

const es: ArrivalCopy = {
  heading: '¿Ya estás en la clínica?',
  lead: (location) => `Avísanos al llegar a ${location} y no hará falta que hagas fila en recepción.`,
  button: 'Ya llegué',
  tooEarly: (time) =>
    time ? `Podrás avisar de tu llegada desde las ${time}.` : 'Aún es pronto para avisar de tu llegada.',
  tooLate: 'Ya no se puede avisar de la llegada desde aquí. Pasa por recepción, por favor.',
  takeSeatTitle: (name) => (name ? `Listo, ${name}` : 'Listo'),
  takeSeat: 'Toma asiento: te llamaremos cuando sea tu turno.',
  seeReceptionTitle: (name) => (name ? `Gracias, ${name}` : 'Gracias'),
  seeReception: 'Antes de sentarte, pasa por recepción: tenemos algo pendiente contigo.',
  arrivedNoResult: 'Ya consta tu llegada.',
  turn: (n) => `Tu turno: ${n}`,
  appointmentAt: (time, location) => `Tu cita: ${time} · ${location}`,
  error: 'No pudimos avisar de tu llegada. Intenta de nuevo o pasa por recepción.',
  qrTitle: 'Avisa de tu llegada',
  qrLead: (location) => `Escribe tus datos para marcar tu llegada a tu cita de hoy en ${location}.`,
  documentLabel: 'Número de documento',
  documentHint: 'El de tu ficha en la clínica, por ejemplo V-12345678.',
  documentRequired: 'Escribe tu número de documento.',
  birthDateLabel: 'Fecha de nacimiento',
  birthDateHint: 'Día, mes y año, como en tu documento.',
  birthDateRequired: 'Escribe tu fecha de nacimiento completa.',
  qrSubmit: 'Ya llegué',
  noMatch: 'No encontramos una cita para hoy en esta sede con esos datos. Revisa el documento y la fecha de nacimiento.',
  noMatchHelp: 'Si tu cita es en otra sede u otro día, o tus datos cambiaron, recepción te ayuda.',
  lockedTitle: 'Demasiados intentos',
  lockedWait: (m) => (m === 1 ? 'Vuelve a intentarlo en 1 minuto.' : `Vuelve a intentarlo en ${m} minutos.`),
  inactiveTitle: 'Este código ya no está activo',
  inactiveMessage: 'Pasa por recepción para avisar de tu llegada.',
  loadErrorTitle: 'No pudimos cargar la página',
  loadError: 'Revisa tu conexión e intenta de nuevo.',
  retry: 'Reintentar',
  again: 'Marcar otra llegada',
};

const en: ArrivalCopy = {
  heading: 'Are you at the clinic?',
  lead: (location) => `Let us know when you arrive at ${location} and you won't need to queue at the front desk.`,
  button: "I'm here",
  tooEarly: (time) => (time ? `You can check in from ${time}.` : "It's too early to check in."),
  tooLate: 'You can no longer check in from here. Please go to the front desk.',
  takeSeatTitle: (name) => (name ? `All set, ${name}` : 'All set'),
  takeSeat: "Please take a seat: we'll call you when it's your turn.",
  seeReceptionTitle: (name) => (name ? `Thank you, ${name}` : 'Thank you'),
  seeReception: 'Before taking a seat, please stop by the front desk: there is something pending.',
  arrivedNoResult: 'Your arrival is recorded.',
  turn: (n) => `Your number: ${n}`,
  appointmentAt: (time, location) => `Your appointment: ${time} · ${location}`,
  error: "We couldn't record your arrival. Try again or go to the front desk.",
  qrTitle: 'Check in',
  qrLead: (location) => `Enter your details to check in for today's appointment at ${location}.`,
  documentLabel: 'ID number',
  documentHint: 'The one on your clinic record, for example V-12345678.',
  documentRequired: 'Enter your ID number.',
  birthDateLabel: 'Date of birth',
  birthDateHint: 'Day, month and year, as on your ID.',
  birthDateRequired: 'Enter your full date of birth.',
  qrSubmit: "I'm here",
  noMatch: "We couldn't find an appointment today at this location with those details. Check your ID number and date of birth.",
  noMatchHelp: 'If your appointment is at another location or on another day, the front desk can help.',
  lockedTitle: 'Too many attempts',
  lockedWait: (m) => (m === 1 ? 'Try again in 1 minute.' : `Try again in ${m} minutes.`),
  inactiveTitle: 'This code is no longer active',
  inactiveMessage: 'Please check in at the front desk.',
  loadErrorTitle: "We couldn't load the page",
  loadError: 'Check your connection and try again.',
  retry: 'Retry',
  again: 'Check in someone else',
};

export const ARRIVAL_COPY: Record<PageLanguage, ArrivalCopy> = { es, en };
