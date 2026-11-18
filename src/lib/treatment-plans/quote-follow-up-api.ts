import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-561 · Seguimiento automático de presupuestos presentados: ajustes por
 * sede, pausa por presentación, el estado en «Presupuestos por seguir» y el
 * informe de Reportes › Presupuestos. Los tipos salen del contrato generado.
 */
export type LocationQuoteFollowUpSettings = components['schemas']['LocationQuoteFollowUpSettingsDto'];
export type UpdateQuoteFollowUpSettingsInput = components['schemas']['UpdateQuoteFollowUpSettingsDto'];
export type QuoteFollowUpPause = components['schemas']['QuoteFollowUpPauseDto'];
export type QuoteFollowUpState = components['schemas']['PendingFollowUpStateDto'];
export type QuoteFollowUpReason = components['schemas']['QuoteFollowUpReason'];
export type QuoteFollowUpReport = components['schemas']['QuoteFollowUpReportDto'];
export type QuoteFollowUpStepStats = components['schemas']['FollowUpStepStatsDto'];
export type QuoteFollowUpDefinition = components['schemas']['FollowUpReportDefinitionDto'];

/** Límites de la API (DTO y CHECK de la tabla). */
export const MAX_FOLLOW_UP_STEPS = 3;
export const MIN_FOLLOW_UP_DAY = 1;
export const MAX_FOLLOW_UP_DAY = 90;
/** Lo que trae una sede sin configurar (la API). */
export const DEFAULT_FOLLOW_UP_OFFSETS = [3, 10, 21] as const;
export const DEFAULT_SEND_FROM_HOUR = 9;
export const DEFAULT_SEND_UNTIL_HOUR = 19;
/** Días tras el envío en los que una aceptación cuenta para el aviso (D5). */
export const FOLLOW_UP_ACCEPTANCE_WINDOW_DAYS = 14;

/** Configurar el seguimiento: solo ADMIN (la API responde 403 a los demás, también al leer). */
export function canManageQuoteFollowUp(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Pausar y reanudar: los roles de «Presupuestos por seguir» (ADMIN y RECEPTION). */
export function canPauseQuoteFollowUp(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** `GET /quote-follow-up-settings`: una fila por sede viva (sin fila = apagado, 3/10/21, de 9 a 19). */
export function listQuoteFollowUpSettings(token: string): Promise<LocationQuoteFollowUpSettings[]> {
  return apiFetch<LocationQuoteFollowUpSettings[]>('/quote-follow-up-settings', { token });
}

/** `PUT /quote-follow-up-settings/:locationId`: reemplaza los ajustes de una sede. */
export function updateQuoteFollowUpSettings(
  token: string,
  locationId: string,
  input: UpdateQuoteFollowUpSettingsInput,
): Promise<LocationQuoteFollowUpSettings> {
  return apiFetch<LocationQuoteFollowUpSettings>(
    `/quote-follow-up-settings/${encodeURIComponent(locationId)}`,
    { method: 'PUT', body: input, token },
  );
}

/** `POST /treatment-plans/:id/follow-up/pause`: vale para todas las opciones del grupo. */
export function pauseQuoteFollowUp(token: string, planId: string): Promise<QuoteFollowUpPause> {
  return apiFetch<QuoteFollowUpPause>(`/treatment-plans/${encodeURIComponent(planId)}/follow-up/pause`, {
    method: 'POST',
    token,
  });
}

/** `POST /treatment-plans/:id/follow-up/resume`. */
export function resumeQuoteFollowUp(token: string, planId: string): Promise<QuoteFollowUpPause> {
  return apiFetch<QuoteFollowUpPause>(`/treatment-plans/${encodeURIComponent(planId)}/follow-up/resume`, {
    method: 'POST',
    token,
  });
}

export interface QuoteFollowUpReportFilters {
  /** Días civiles de la sede de la presentación, AAAA-MM-DD. */
  from: string;
  to: string;
  locationId?: string;
}

/** `GET /reports/quote-follow-up`: enviados, abiertos y aceptados en 14 días por aviso. */
export function getQuoteFollowUpReport(
  token: string,
  filters: QuoteFollowUpReportFilters,
): Promise<QuoteFollowUpReport> {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) p.set('locationId', filters.locationId);
  return apiFetch<QuoteFollowUpReport>(`/reports/quote-follow-up?${p.toString()}`, { token });
}

/** «Aviso 2». */
export function followUpStepLabel(step: number): string {
  return `Aviso ${step}`;
}

/** Las paradas: la secuencia ya no sigue (no es un aviso que «no salió»). */
const STOP_REASONS: ReadonlySet<QuoteFollowUpReason> = new Set([
  'STOPPED_ACCEPTED',
  'STOPPED_REJECTED',
  'STOPPED_SCHEDULED',
  'EXPIRED',
]);

export function isFollowUpStop(reason: QuoteFollowUpReason): boolean {
  return STOP_REASONS.has(reason);
}

/**
 * Por qué un aviso no salió o la secuencia se detuvo: `short` cabe en una
 * celda («Aviso 2 no salió: sin email»); `long` lo explica (tooltip, informe).
 */
export const FOLLOW_UP_REASON_LABELS: Record<QuoteFollowUpReason, { short: string; long: string }> = {
  SUPERSEDED: {
    short: 'reemplazado por el siguiente',
    long: 'Cuando tocaba, ya había vencido también el aviso siguiente: solo sale el último, para no mandar varios a la vez.',
  },
  TOO_LATE: {
    short: 'fuera de plazo',
    long: 'El aviso llevaba más de 7 días vencido sin poder salir (por ejemplo, el seguimiento estaba apagado): ya no se envía.',
  },
  STOPPED_ACCEPTED: {
    short: 'presupuesto aceptado',
    long: 'El paciente aceptó una opción: no sale ningún aviso más.',
  },
  STOPPED_REJECTED: {
    short: 'presupuesto rechazado',
    long: 'Todas las opciones se marcaron como rechazadas: no sale ningún aviso más.',
  },
  STOPPED_SCHEDULED: {
    short: 'tiene cita',
    long: 'El paciente tiene una cita agendada: no sale ningún aviso más.',
  },
  EXPIRED: {
    short: 'presupuesto vencido',
    long: 'Los precios del presupuesto ya no valen: no sale ningún aviso más. Para seguir, actualiza el presupuesto y preséntalo de nuevo.',
  },
  OPTED_OUT: {
    short: 'se dio de baja',
    long: 'El paciente se dio de baja de los avisos automáticos con el enlace de un email.',
  },
  CHANNEL_NONE: {
    short: 'no quiere avisos',
    long: 'El paciente no quiere avisos automáticos (canal: ninguno). Si hay que hablarle, llámalo.',
  },
  CHANNEL_WHATSAPP: {
    short: 'su canal es WhatsApp',
    long: 'El canal del paciente es WhatsApp y el aviso automático solo sale por email: escríbele con «WhatsApp».',
  },
  NO_EMAIL: {
    short: 'sin email',
    long: 'El paciente no tiene email en su ficha (en un menor, su responsable). Añádelo para que le lleguen los avisos.',
  },
  NO_CONSENT: {
    short: 'sin consentimiento de datos',
    long: 'El paciente revocó su consentimiento para el tratamiento de sus datos: no se le escribe.',
  },
  NO_LINK_HOST: {
    short: 'la clínica no tiene dirección web',
    long: 'La clínica no tiene una dirección web para los enlaces: configúrala en Ajustes › Dominios.',
  },
  NO_PROFESSIONAL: {
    short: 'sin profesional',
    long: 'Ningún odontólogo o administrador activo elaboró el presupuesto, y la aceptación por el enlace tiene que quedar a nombre de alguien.',
  },
};

export type FollowUpStatusTone = 'neutral' | 'info' | 'warning' | 'success';

/** Lo que dice la columna «Último aviso» de una fila. */
export interface FollowUpStatusText {
  text: string;
  /** La explicación (tooltip y lectores de pantalla); `null` si el texto basta. */
  hint: string | null;
  tone: FollowUpStatusTone;
  /** El instante del último aviso enviado (la vista lo pinta con el reloj de la sede). */
  lastSentAt: string | null;
}

const statusCopy = {
  paused: 'En pausa',
  pausedHint: 'No sale ningún aviso automático hasta que se reanude.',
  none: 'Sin avisos',
  noneHint:
    'Aún no salió ningún aviso automático (o el seguimiento está apagado en la sede de la presentación).',
  sentHint:
    'Email con el nombre de la clínica y un enlace para ver y aceptar el presupuesto, sin importes ni tratamientos.',
  skipped: (step: number, why: string) => `${followUpStepLabel(step)} no salió: ${why}`,
  stopped: (why: string) => `Detenido: ${why}`,
};

/**
 * El estado del seguimiento de una presentación, en palabras: «En pausa»,
 * «Sin avisos», «Aviso 2» (con su fecha) o la razón de la última omisión o
 * parada. La pausa manda: aunque haya avisos registrados, no sale ninguno.
 */
export function followUpStatus(state: QuoteFollowUpState): FollowUpStatusText {
  const { lastStep, lastStatus, lastSentAt } = state;
  if (state.paused) return { text: statusCopy.paused, hint: statusCopy.pausedHint, tone: 'warning', lastSentAt };
  if (lastStep === null || lastStatus === null) {
    return { text: statusCopy.none, hint: statusCopy.noneHint, tone: 'neutral', lastSentAt: null };
  }
  if (lastStatus === 'SENT') {
    return { text: followUpStepLabel(lastStep), hint: statusCopy.sentHint, tone: 'info', lastSentAt };
  }
  const reason = state.lastReason as QuoteFollowUpReason | null;
  const label = reason ? FOLLOW_UP_REASON_LABELS[reason] : undefined;
  if (!reason || !label) {
    return { text: statusCopy.skipped(lastStep, 'sin motivo'), hint: null, tone: 'neutral', lastSentAt };
  }
  return {
    text: isFollowUpStop(reason) ? statusCopy.stopped(label.short) : statusCopy.skipped(lastStep, label.short),
    hint: label.long,
    tone: isFollowUpStop(reason) ? 'neutral' : 'warning',
    lastSentAt,
  };
}

/** Lo que propone la sede al configurarse por primera vez. */
export function defaultFollowUpDraft(): string[] {
  return DEFAULT_FOLLOW_UP_OFFSETS.map(String);
}

export const followUpValidationCopy = {
  noOffsets: `Elige de 1 a ${MAX_FOLLOW_UP_STEPS} avisos.`,
  invalidOffset: `Cada aviso sale de ${MIN_FOLLOW_UP_DAY} a ${MAX_FOLLOW_UP_DAY} días después de presentar el presupuesto.`,
  notIncreasing: 'Los días de los avisos van de menor a mayor y sin repetirse (por ejemplo, 3, 10 y 21).',
  invalidWindow: 'La franja horaria debe terminar después de empezar (por ejemplo, de 9 a 19).',
};

export type FollowUpFieldErrors = Partial<Record<'offsets' | 'window', string>>;

/**
 * Valida lo tecleado como la API (mismos textos): de 1 a 3 avisos, cada uno
 * entero de 1 a 90, estrictamente crecientes, y la franja con «hasta» > «de».
 * Devuelve los errores por campo o los días a guardar.
 */
export function parseFollowUpDraft(
  offsets: readonly string[],
  sendFromHour: number,
  sendUntilHour: number,
): { errors: FollowUpFieldErrors } | { offsetsDays: number[] } {
  const errors: FollowUpFieldErrors = {};
  const filled = offsets.map((v) => v.trim()).filter((v) => v !== '');
  const days = filled.map((v) => (/^\d{1,3}$/.test(v) ? Number(v) : Number.NaN));
  if (days.length === 0 || days.length > MAX_FOLLOW_UP_STEPS) errors.offsets = followUpValidationCopy.noOffsets;
  else if (days.some((d) => !Number.isInteger(d) || d < MIN_FOLLOW_UP_DAY || d > MAX_FOLLOW_UP_DAY)) {
    errors.offsets = followUpValidationCopy.invalidOffset;
  } else if (days.some((d, i) => i > 0 && d <= days[i - 1])) errors.offsets = followUpValidationCopy.notIncreasing;
  if (!(sendUntilHour > sendFromHour)) errors.window = followUpValidationCopy.invalidWindow;
  return Object.keys(errors).length > 0 ? { errors } : { offsetsDays: days };
}

/**
 * Un 400 de la API → el campo al que pertenece (por su texto, que es el
 * contrato). `null` si no es de un campo (va arriba del formulario).
 */
export function followUpErrorField(message: string): keyof FollowUpFieldErrors | null {
  if (/aviso/i.test(message)) return 'offsets';
  if (/franja/i.test(message)) return 'window';
  return null;
}

/** «3, 10 y 21 días». */
export function offsetsLabel(offsets: readonly number[]): string {
  if (offsets.length === 0) return 'Sin avisos';
  const parts = offsets.map(String);
  const head = parts.slice(0, -1).join(', ');
  const last = parts[parts.length - 1];
  const unit = offsets.length === 1 && offsets[0] === 1 ? 'día' : 'días';
  return `${head ? `${head} y ` : ''}${last} ${unit}`;
}
