import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { RegionalFormat } from '@/lib/format/regional-format';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';

// Registro de implantes (DX-191). Las formas salen del Swagger de la API.
export type PatientImplant = components['schemas']['PatientImplantDto'];
export type ImplantKind = PatientImplant['kind'];
export type RegisterImplantInput = components['schemas']['RegisterImplantDto'];
export type ImplantCard = components['schemas']['ImplantCardDto'];
export type ImplantCardItem = components['schemas']['ImplantCardItemDto'];
export type ImplantCatalogEntry = components['schemas']['ImplantCatalogEntryDto'];
export type ImplantLotMatch = components['schemas']['ImplantLotMatchDto'];

export const IMPLANT_KIND_LABELS: Record<ImplantKind, string> = {
  IMPLANT: 'Implante',
  ABUTMENT: 'Pilar',
  GRAFT: 'Injerto',
  MEMBRANE: 'Membrana',
  OTHER: 'Otro',
};

export const IMPLANT_KINDS = Object.keys(IMPLANT_KIND_LABELS) as ImplantKind[];

/** Registrar y anular: odontólogo y ADMIN (IMPLANT_WRITE_ROLES en la API). */
const IMPLANT_WRITE_ROLES: readonly ClinicRole[] = ['DENTIST', 'ADMIN'];

/** Ver la sección y la tarjeta: los cuatro roles (recepción la entrega). */
export function canReadImplants(role: ClinicRole | null): boolean {
  return role !== null;
}

export function canRegisterImplants(role: ClinicRole | null): boolean {
  return role !== null && IMPLANT_WRITE_ROLES.includes(role);
}

/** Búsqueda por lote y CSV: solo ADMIN. */
export function canSearchImplantLots(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * Anula quien lo registró o un ADMIN, y solo uno vivo. Solo decide qué se
 * PINTA: la API vuelve a comprobarlo (403/409).
 */
export function canVoidImplant(
  implant: { voidedAt: string | null; professionalId: string },
  actor: { role: ClinicRole | null; userId: string | null },
): boolean {
  if (implant.voidedAt !== null || !canRegisterImplants(actor.role)) return false;
  return actor.role === 'ADMIN' || implant.professionalId === actor.userId;
}

function patientPath(patientId: string, suffix: string): string {
  return `/patients/${encodeURIComponent(patientId)}/${suffix}`;
}

/** `GET /patients/:id/implants` — más reciente primero, anulados incluidos. */
export function listPatientImplants(token: string, patientId: string): Promise<PatientImplant[]> {
  return apiFetch<PatientImplant[]>(patientPath(patientId, 'implants'), { token });
}

/** `POST /patients/:id/implants` — 400 en español si falta algo o el diente no es FDI. */
export function registerImplant(
  token: string,
  patientId: string,
  input: RegisterImplantInput,
): Promise<PatientImplant> {
  return apiFetch<PatientImplant>(patientPath(patientId, 'implants'), {
    method: 'POST',
    body: input,
    token,
  });
}

/** `POST /implants/:id/void` — motivo obligatorio. */
export function voidImplant(token: string, id: string, reason: string): Promise<PatientImplant> {
  return apiFetch<PatientImplant>(`/implants/${encodeURIComponent(id)}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

/** `GET /patients/:id/implant-card?date=` — la tarjeta de la intervención de ese día. */
export function getImplantCard(token: string, patientId: string, date: string): Promise<ImplantCard> {
  return apiFetch<ImplantCard>(
    `${patientPath(patientId, 'implant-card')}?date=${encodeURIComponent(date)}`,
    { token },
  );
}

/** `POST /patients/:id/implant-card/print` — registra la entrega (la primera) y la devuelve. */
export function printImplantCard(
  token: string,
  patientId: string,
  date: string,
): Promise<ImplantCard> {
  return apiFetch<ImplantCard>(patientPath(patientId, 'implant-card/print'), {
    method: 'POST',
    body: { date },
    token,
  });
}

/** `GET /implants/catalog` — fabricantes y sistemas ya usados (autocompletar). */
export function getImplantCatalog(token: string): Promise<ImplantCatalogEntry[]> {
  return apiFetch<ImplantCatalogEntry[]>('/implants/catalog', { token });
}

export interface ImplantLotQuery {
  lot?: string;
  reference?: string;
}

function lotSearch(query: ImplantLotQuery): string {
  const search = new URLSearchParams();
  if (query.lot?.trim()) search.set('lot', query.lot.trim());
  if (query.reference?.trim()) search.set('reference', query.reference.trim());
  return search.toString();
}

/** `GET /implants/search` — «¿quién recibió este lote?». Solo ADMIN, auditado. */
export function searchImplantLots(token: string, query: ImplantLotQuery): Promise<ImplantLotMatch[]> {
  return apiFetch<ImplantLotMatch[]>(`/implants/search?${lotSearch(query)}`, { token });
}

/** `GET /implants/search.csv` — la misma búsqueda en CSV. Solo ADMIN, auditado. */
export function downloadImplantLotCsv(token: string, query: ImplantLotQuery): Promise<string> {
  return apiFetchText(`/implants/search.csv?${lotSearch(query)}`, { token });
}

/** Vista imprimible de la tarjeta de una intervención (se abre en otra pestaña). */
export function implantCardPrintHref(patientId: string, date: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/implant-card?date=${encodeURIComponent(date)}`;
}

/**
 * «4,1 × 10 mm», «Ø 4,1 mm», «10 mm» o null, con los separadores del formato
 * de la sede. Sin formato (cargando o sede sin configurar), «—» si hay medida.
 */
export function formatImplantSize(
  diameterMm: number | null,
  lengthMm: number | null,
  fmt: RegionalFormat | null,
): string | null {
  if (diameterMm === null && lengthMm === null) return null;
  if (!fmt) return NO_SEDE_FORMAT;
  const n = (v: number) => fmt.number(v, { max: 2 });
  if (diameterMm !== null && lengthMm !== null) return `${n(diameterMm)} × ${n(lengthMm)} mm`;
  if (diameterMm !== null) return `Ø ${n(diameterMm)} mm`;
  if (lengthMm !== null) return `${n(lengthMm)} mm`;
  return null;
}

export interface ImplantToothGroup {
  toothNumber: string;
  implants: PatientImplant[];
}

/**
 * La sección de la ficha se lee por diente (FDI ascendente); dentro de cada
 * diente, lo más reciente primero (el orden en que llega de la API).
 */
export function groupImplantsByTooth(implants: readonly PatientImplant[]): ImplantToothGroup[] {
  const byTooth = new Map<string, PatientImplant[]>();
  for (const implant of implants) {
    const list = byTooth.get(implant.toothNumber) ?? [];
    list.push(implant);
    byTooth.set(implant.toothNumber, list);
  }
  return [...byTooth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([toothNumber, list]) => ({ toothNumber, implants: list }));
}

/** CSV del navegador: nombre con el lote/REF buscado, sin caracteres raros. */
export function implantLotCsvFileName(query: ImplantLotQuery): string {
  const term = (query.lot?.trim() || query.reference?.trim() || 'busqueda')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .slice(0, 60);
  return `implantes-${term}.csv`;
}
