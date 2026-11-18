import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage, apiErrorSaid } from '@/lib/api/error-message';
import type { HourCycle } from '@/lib/format/regional-format';
import { locationClock, type SedeClock } from '@/lib/locations/sede-clock';
import { addCivilDays, wallDay } from '@/lib/time/wall-clock';
import type {
  OnlineBookingMode,
  OnlinePatientKind,
  PublicBookingConfig,
  PublicBookingLocation,
  PublicBookingProvider,
  PublicBookingType,
  PublicSlot,
} from './online-booking-api';

/**
 * Lógica pura de la página pública /reservar (DX-016): qué se ofrece en cada
 * paso, en qué reloj se pinta y qué hacer con cada respuesta de error. La
 * vista (`public-booking-view.tsx`) solo pinta y guarda el estado del flujo.
 */

/** Días de huecos que se piden de una vez (la API admite hasta 14). */
export const SLOT_WINDOW_DAYS = 7;

/** Los tipos reservables en la sede. */
export function typesAt(config: PublicBookingConfig, locationId: string | null): PublicBookingType[] {
  if (!locationId) return [];
  return config.types.filter((t) => t.locationIds.includes(locationId));
}

/** Los profesionales que atienden ese tipo en esa sede. */
export function providersFor(
  config: PublicBookingConfig,
  locationId: string | null,
  typeId: string | null,
): PublicBookingProvider[] {
  const type = config.types.find((t) => t.id === typeId);
  if (!type || !locationId) return [];
  return config.providers.filter((p) => type.providerIds.includes(p.id) && p.locationIds.includes(locationId));
}

/** La duración del tipo para esa clase de paciente. */
export function durationOf(type: PublicBookingType, kind: OnlinePatientKind): number {
  return kind === 'NEW' ? type.durationNewMinutes : type.durationExistingMinutes;
}

/** El modo (solicitud o directa) que tocará a esa clase de paciente. */
export function modeOf(config: PublicBookingConfig, kind: OnlinePatientKind): OnlineBookingMode {
  return kind === 'NEW' ? config.newPatientMode : config.existingPatientMode;
}

/**
 * El reloj con que se pinta una hora de la sede: su zona y su formato (locale
 * y 12/24 h), los que manda la API. Sin formato, `null`: nunca la zona ni el
 * formato del navegador, ni uno fijo (DX-378); la página lo dice.
 */
export function bookingClock(location: {
  timeZone: string;
  locale?: string | null;
  hourCycle?: HourCycle | null;
}): SedeClock | null {
  return locationClock({
    timeZone: location.timeZone,
    locale: location.locale ?? null,
    hourCycle: location.hourCycle ?? null,
  });
}

export interface SlotDay {
  /** Día civil `YYYY-MM-DD` en la zona de la sede. */
  day: string;
  slots: PublicSlot[];
}

/**
 * Los días de la ventana (desde `from`, `days` días civiles) con sus huecos,
 * agrupados por el día de la SEDE de cada inicio. Un día sin huecos sale con
 * la lista vacía: el selector lo muestra desactivado.
 */
export function groupSlotsByDay(slots: readonly PublicSlot[], from: string, days: number, timeZone: string): SlotDay[] {
  const byDay = new Map<string, PublicSlot[]>();
  for (let i = 0; i < days; i++) byDay.set(addCivilDays(from, i), []);
  for (const slot of slots) {
    const day = wallDay(slot.start, timeZone);
    const list = byDay.get(day);
    if (list) list.push(slot);
  }
  return [...byDay.entries()].map(([day, list]) => ({
    day,
    slots: [...list].sort((a, b) => a.start.localeCompare(b.start)),
  }));
}

/**
 * Con «Cualquiera disponible» la API devuelve un hueco por profesional libre:
 * a la persona se le ofrece cada hora una vez (el primero que la tenga libre).
 */
export function uniqueStarts(slots: readonly PublicSlot[]): PublicSlot[] {
  const seen = new Set<string>();
  const out: PublicSlot[] = [];
  for (const slot of slots) {
    const key = new Date(slot.start).toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

/** Último día que se puede pedir (hoy de la sede + antelación máxima). */
export function lastBookableDay(today: string, maxAdvanceDays: number): string {
  return addCivilDays(today, Math.max(0, maxAdvanceDays));
}

/** Qué hace la página con un error al reservar. */
export type BookingFailure =
  /** Otro ganó el hueco o ya no se ofrece: vuelta a elegir hora (lista recargada). */
  | { kind: 'slot'; text: string; sessionToken: string | null }
  /** La verificación caducó o ya se usó: vuelta a identificarse. */
  | { kind: 'session'; text: string }
  /** La política cambió o el formulario caducó: hay que recargar la página. */
  | { kind: 'reload'; text: string }
  /** La reserva online dejó de estar disponible. */
  | { kind: 'unavailable' }
  /** Cualquier otro: se queda en el paso con el mensaje (y puede reintentar). */
  | { kind: 'inline'; text: string };

export const bookingFailureCopy = {
  fallback: 'No pudimos enviar tu reserva. Revisa tu conexión e intenta de nuevo.',
  slotTaken: 'Ese hueco se acaba de ocupar. Elige otra hora: las demás siguen disponibles.',
  slotGone: 'Esa hora ya no está disponible. Elige otra de la lista actualizada.',
  patientBusy: 'Ya tienes otra cita a esa hora. Elige otra hora.',
  sessionExpired: 'Tu verificación caducó. Vuelve a identificarte para reservar.',
  outdatedPolicy:
    'La política de tratamiento de datos cambió mientras reservabas. Recarga la página para ver la versión vigente.',
  formExpired: 'El formulario caducó. Recarga la página y vuelve a elegir tu hora.',
};

const RELOAD_MESSAGES = new Set([bookingFailureCopy.outdatedPolicy, bookingFailureCopy.formExpired]);

/** Clasifica el error de `POST /public/booking`. */
export function classifyBookingError(err: unknown): BookingFailure {
  if (err instanceof ApiError) {
    const text = apiErrorMessage(err, bookingFailureCopy.fallback);
    if (err.status === 409) {
      switch (err.code) {
        case 'ONLINE_SLOT_TAKEN':
          return { kind: 'slot', text: text || bookingFailureCopy.slotTaken, sessionToken: err.sessionToken };
        case 'ONLINE_SLOT_GONE':
          return { kind: 'slot', text: text || bookingFailureCopy.slotGone, sessionToken: err.sessionToken };
        case 'ONLINE_PATIENT_BUSY':
          return { kind: 'slot', text: text || bookingFailureCopy.patientBusy, sessionToken: err.sessionToken };
        case 'ONLINE_SESSION_USED':
          return { kind: 'session', text: text };
        case 'PRIVACY_POLICY_OUTDATED':
          return { kind: 'reload', text: text || bookingFailureCopy.outdatedPolicy };
        default:
          return { kind: 'inline', text: text };
      }
    }
    if (err.status === 401) return { kind: 'session', text: text || bookingFailureCopy.sessionExpired };
    if (err.status === 400 && apiErrorSaid(err, (m) => RELOAD_MESSAGES.has(m))) {
      return { kind: 'reload', text: text };
    }
    // 404 de la reserva: o se desactivó, o la opción elegida ya no se ofrece.
    if (err.status === 404) {
      return apiErrorSaid(err, (m) => m.startsWith('Esa opción'))
        ? { kind: 'reload', text: text }
        : { kind: 'unavailable' };
    }
    return { kind: 'inline', text: text };
  }
  return { kind: 'inline', text: apiErrorMessage(err, bookingFailureCopy.fallback) };
}

/** Milisegundos que faltan para poder enviar (la API exige ≥ 4 s desde que se cargó el formulario). */
export function waitBeforeSubmit(loadedAt: number, now: number, minSeconds: number): number {
  return Math.max(0, loadedAt + minSeconds * 1000 + 250 - now);
}

/** Código de 6 cifras: se quitan espacios y guiones al pegarlo. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** Email con la forma mínima (la API valida de verdad). */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** Al menos 7 cifras: un teléfono que se pueda marcar. */
export function phoneDigitCount(text: string): number {
  return text.replace(/\D/g, '').length;
}

/** La sede por id, o la única si solo hay una. */
export function defaultLocation(config: PublicBookingConfig): PublicBookingLocation | null {
  return config.locations.length === 1 ? config.locations[0] : null;
}
