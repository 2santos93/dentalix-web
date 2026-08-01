import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type CreateClinicalEntryInput = components['schemas']['CreateClinicalEntryDto'];

/* ── Anamnesis (historia clínica estructurada) ─────────────────────────────
 * Espejo de `dentalix-api`'s
 * `src/modules/medical-history/domain/entities/medical-history.entity.ts`.
 *
 * A mano, NO desde `components['schemas']`: las clases anidadas del
 * `SaveMedicalHistoryDto` no llevan `@ApiProperty`, así que el OpenAPI las
 * publica como esquemas vacíos y `openapi-typescript` las emite como
 * `Record<string, never>` — inservible para tipar el formulario. Mantener en
 * sync si cambia la entidad del backend.
 */

export type AllergyType = 'MEDICAMENTO' | 'MATERIAL' | 'ALIMENTO' | 'AMBIENTAL';
export type AllergySeverity = 'LEVE' | 'MODERADA' | 'ANAFILAXIA';
export type ConditionStatus = 'SI' | 'NO' | 'DESCONOCE';

export interface Allergy {
  alergeno: string;
  tipo: AllergyType;
  reaccion?: string;
  severidad: AllergySeverity;
  /** Marca de alerta clínica: la fila se destaca y alimenta `safetyFlags`. */
  esAlerta: boolean;
}

export interface Condition {
  codigo: string;
  etiqueta: string;
  estado: ConditionStatus;
  esAlerta: boolean;
  nota?: string;
}

export interface Medication {
  nombre: string;
  dosis?: string;
  frecuencia?: string;
  motivo?: string;
  esAlerta: boolean;
}

/** Secciones que el backend acepta como JSON libre; la UI de Fase 1 aún no las edita, pero se preservan al guardar una versión nueva. */
export interface Habits {
  tabaquismo?: { activo: boolean; porDia?: number; anios?: number };
  alcohol?: { activo: boolean; frecuencia?: string };
  sustancias?: boolean;
  bruxismo?: boolean;
  higieneOral?: {
    cepilladoPorDia?: number;
    hilo?: boolean;
    enjuague?: boolean;
    cremaConFluor?: boolean;
  };
  dieta?: string;
}

export interface DentalHistory {
  motivoConsulta?: string;
  ultimaVisita?: string;
  tratamientosPrevios?: string[];
  malasExperiencias?: string;
  sangradoEncias?: boolean;
  sensibilidad?: boolean;
  atm?: boolean;
  ortodonciaPrevia?: boolean;
  enfPeriodontal?: boolean;
}

export interface Surgery {
  descripcion: string;
  fecha?: string;
}

export interface VitalSigns {
  sistolica?: number;
  diastolica?: number;
  fc?: number;
  fr?: number;
  temp?: number;
  spo2?: number;
  peso?: number;
  talla?: number;
  glucometria?: number;
}

/** DERIVADO por el backend (`deriveSafetyFlags`) — nunca se envía desde el cliente. */
export interface SafetyFlags {
  embarazo: boolean;
  semanasEmbarazo?: number;
  anticoagulantes: boolean;
  bifosfonatos: boolean;
  diabetes: boolean;
  profilaxisAntibiotica: boolean;
  alergiaAnestesico: boolean;
  alergiaPenicilina: boolean;
  alergiaLatex: boolean;
}

/** Cuerpo del `PUT` — todo opcional: una anamnesis puede quedar parcial. */
export interface SaveMedicalHistoryInput {
  allergies?: Allergy[];
  conditions?: Condition[];
  medications?: Medication[];
  habits?: Habits;
  dentalHistory?: DentalHistory;
  surgeries?: Surgery[];
  vitalSigns?: VitalSigns;
  familyHistory?: string;
  notes?: string;
  embarazo?: boolean;
  semanasEmbarazo?: number;
}

/**
 * `GET /patients/:id/medical-history` (and `PUT`) return a plain TS
 * interface on the backend (`MedicalHistory`), not a class decorated with
 * `@ApiProperty()` — same situation as `Patient` in `patients-api.ts` — so
 * the generated `schema.d.ts` has no body shape for these routes
 * (`content?: never`). Hand-written to mirror `dentalix-api`'s
 * `src/modules/medical-history/domain/entities/medical-history.entity.ts` —
 * keep in sync if that changes.
 *
 * This is APPEND-ONLY: "the current anamnesis" = the row with the highest
 * `version` for a patient. Saving never updates a previous row.
 */
export interface MedicalHistory {
  id: string;
  tenantId: string;
  patientId: string;
  version: number;
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  habits: Habits | null;
  dentalHistory: DentalHistory | null;
  surgeries: Surgery[];
  vitalSigns: VitalSigns | null;
  familyHistory: string | null;
  notes: string | null;
  /** Derivados por el backend a partir de alergias/condiciones/medicamentos. */
  safetyFlags: SafetyFlags;
  hasCriticalAlert: boolean;
  createdById: string | null;
  createdAt: string;
}

/**
 * `GET /patients/:id/clinical-entries` (and `POST`) — same situation as
 * `MedicalHistory` above. Mirrors
 * `src/modules/clinical-entries/domain/entities/clinical-entry.entity.ts`.
 *
 * This is IMMUTABLE: once created, an entry is never updated or deleted —
 * there is no update/delete endpoint at all. A correction is always a new
 * entry.
 */
export interface ClinicalEntry {
  id: string;
  tenantId: string;
  patientId: string;
  entryDate: string;
  reason: string | null;
  notes: string;
  performedById: string | null;
  createdAt: string;
}

/**
 * Returns the latest anamnesis version, or `null` when the patient doesn't
 * have one yet.
 *
 * CRITICAL: the backend returns `200` with an EMPTY body (content-length 0)
 * for "no history yet" — NOT a JSON `null`. `apiFetch`'s `res.json()` would
 * THROW on that empty body, so this uses `apiFetchOrNull`, which reads the
 * response as text first and only `JSON.parse`s when non-empty.
 */
export async function getMedicalHistory(
  token: string,
  patientId: string,
): Promise<MedicalHistory | null> {
  return apiFetchOrNull<MedicalHistory>(`/patients/${patientId}/medical-history`, {
    token,
  });
}

// Always creates a NEW version (append-only) — never updates the previous
// one, per the backend contract.
export async function saveMedicalHistory(
  token: string,
  patientId: string,
  input: SaveMedicalHistoryInput,
): Promise<MedicalHistory> {
  return apiFetch<MedicalHistory>(`/patients/${patientId}/medical-history`, {
    method: 'PUT',
    body: input,
    token,
  });
}

// Returned DESC by `entryDate` (backend contract).
export async function listClinicalEntries(
  token: string,
  patientId: string,
): Promise<ClinicalEntry[]> {
  return apiFetch<ClinicalEntry[]>(`/patients/${patientId}/clinical-entries`, {
    token,
  });
}

export async function createClinicalEntry(
  token: string,
  patientId: string,
  input: CreateClinicalEntryInput,
): Promise<ClinicalEntry> {
  return apiFetch<ClinicalEntry>(`/patients/${patientId}/clinical-entries`, {
    method: 'POST',
    body: input,
    token,
  });
}
