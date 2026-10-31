import type { components } from '@/lib/api/schema';

/**
 * `schema.d.ts`'s `AllergyDto`/`ConditionDto`/`MedicationDto` (and the
 * `habits`/`dentalHistory`/`surgeries`/`vitalSigns`/`safetyFlags` object
 * fields on `SaveMedicalHistoryDto`/`MedicalHistoryDto`) all generate as
 * `Record<string, never>` — the backend's nested DTO classes
 * (`save-medical-history.dto.ts`) are decorated only with class-validator
 * decorators, and `MedicalHistoryDto`'s object fields use
 * `@ApiProperty({ type: Object })`, so NestJS Swagger can't introspect any
 * of their properties. Same limitation already documented for
 * `MedicalHistory`/`Patient` in `clinical-api.ts`/`patients-api.ts` — hand
 * typed here to mirror `dentalix-api`'s
 * `src/modules/medical-history/domain/entities/medical-history.entity.ts`
 * (the DTOs are structurally identical to the domain entities by design,
 * per that file's own comments). Keep in sync if the backend shape changes.
 */
export type AllergyType = 'MEDICAMENTO' | 'MATERIAL' | 'ALIMENTO' | 'AMBIENTAL';
export type AllergySeverity = 'LEVE' | 'MODERADA' | 'ANAFILAXIA';
export type ConditionStatus = 'SI' | 'NO' | 'DESCONOCE';
/**
 * Respuesta tri-estado de hábitos y embarazo (la misma que las condiciones).
 * Ausente = «Sin responder», nunca «No». El API devuelve también las versiones
 * anteriores en esta forma (las leía con booleanos: true «Sí», false «No»).
 */
export type AnswerStatus = components['schemas']['AnamnesisAnswerStatus'];

export interface Allergy {
  alergeno: string;
  tipo: AllergyType;
  reaccion?: string;
  severidad: AllergySeverity;
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
export interface Habits {
  tabaquismo?: { estado: AnswerStatus; porDia?: number; anios?: number };
  alcohol?: { estado: AnswerStatus; frecuencia?: string };
  sustancias?: AnswerStatus;
  bruxismo?: AnswerStatus;
  higieneOral?: {
    cepilladoPorDia?: number;
    hilo?: AnswerStatus;
    enjuague?: AnswerStatus;
    cremaConFluor?: AnswerStatus;
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

// `CreatePatientDto['medicalHistory']` == the generated `SaveMedicalHistoryDto`
// shape. The scalar leaf fields (`familyHistory`/`notes`/`pregnancy`/
// `semanasEmbarazo`) generate correctly and are kept from the schema; the
// nested array/object fields are swapped for the hand-typed shapes above
// (see file-level comment). `embarazo` (booleano deprecado del API, solo
// para clientes anteriores) se quita: la web manda `pregnancy`.
type GeneratedSaveMedicalHistoryDto = NonNullable<
  components['schemas']['CreatePatientDto']['medicalHistory']
>;
export type ClinicalHistoryValue = Omit<
  GeneratedSaveMedicalHistoryDto,
  'allergies' | 'conditions' | 'medications' | 'habits' | 'dentalHistory' | 'surgeries' | 'vitalSigns' | 'embarazo'
> & {
  allergies?: Allergy[];
  conditions?: Condition[];
  medications?: Medication[];
  habits?: Habits;
  dentalHistory?: DentalHistory;
  surgeries?: Surgery[];
  vitalSigns?: VitalSigns;
};

// `MedicalHistoryDto` (the read shape, `GET`/`PUT` response) — same swap as
// `ClinicalHistoryValue` above, plus `safetyFlags` (also `Object` on the
// backend `@ApiProperty`).
type GeneratedMedicalHistoryDto = components['schemas']['MedicalHistoryDto'];
export type MedicalHistory = Omit<
  GeneratedMedicalHistoryDto,
  | 'allergies'
  | 'conditions'
  | 'medications'
  | 'habits'
  | 'dentalHistory'
  | 'surgeries'
  | 'vitalSigns'
  | 'safetyFlags'
> & {
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  habits: Habits | null;
  dentalHistory: DentalHistory | null;
  surgeries: Surgery[];
  vitalSigns: VitalSigns | null;
  safetyFlags: SafetyFlags;
  /**
   * Procedencia de la versión. **No están en `MedicalHistoryDto`**: el
   * `@ApiProperty` del backend no los declara, así que `schema.d.ts` no los
   * genera — pero el runtime SÍ los devuelve
   * (`prisma-medical-history.repository.ts` → `mapToEntity` mapea `version`,
   * `createdById` y `createdAt`, y la entidad de dominio los declara).
   *
   * Se tipan aquí a mano, como el resto de este fichero, porque son lo único
   * que permite que «Versión 3» signifique algo: sin ellos el contador afirma
   * una inmutabilidad que la pantalla no puede sustentar. Si algún día el
   * backend documenta el DTO, esto se cae solo al regenerar.
   */
  version: number;
  createdById: string | null;
  createdAt: string;
};

export const ALLERGY_TYPE_LABELS: Record<AllergyType, string> = {
  MEDICAMENTO: 'Medicamento',
  MATERIAL: 'Material',
  ALIMENTO: 'Alimento',
  AMBIENTAL: 'Ambiental',
};
export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  LEVE: 'Leve',
  MODERADA: 'Moderada',
  ANAFILAXIA: 'Anafilaxia',
};
export const CONDITION_STATUS_LABELS: Record<ConditionStatus, string> = {
  SI: 'Sí',
  NO: 'No',
  DESCONOCE: 'No sabe',
};

/**
 * Una condición que la versión no recoge NO se preguntó (o no se contestó):
 * se muestra «Sin responder», nunca «No». Un hallazgo negativo que nadie
 * registró no puede aparecer en la HC (documento médico-legal).
 */
export const CONDITION_UNANSWERED_LABEL = 'Sin responder';

export interface ConditionSummary {
  si: number;
  no: number;
  desconoce: number;
  /** Condiciones del checklist estándar que la versión no contesta. */
  sinResponder: number;
}

/**
 * Cuenta las respuestas de una lista de condiciones frente al checklist
 * estándar. La ausencia cuenta como «sin responder», nunca como «No».
 * Las condiciones fuera del checklist se cuentan por su estado.
 */
export function summarizeConditions(conditions: readonly Condition[] | null | undefined): ConditionSummary {
  const byCode = new Map((conditions ?? []).map((c) => [c.codigo, c.estado]));
  const summary: ConditionSummary = { si: 0, no: 0, desconoce: 0, sinResponder: 0 };
  for (const { codigo } of STANDARD_CONDITIONS) {
    if (!byCode.has(codigo)) summary.sinResponder += 1;
  }
  for (const estado of byCode.values()) {
    if (estado === 'SI') summary.si += 1;
    else if (estado === 'NO') summary.no += 1;
    else summary.desconoce += 1;
  }
  return summary;
}

// Checklist estándar de condiciones. Los `codigo` marcados abajo alimentan
// `deriveSafetyFlags` en el backend (dentalix-api-clinhist/src/modules/
// medical-history/domain/safety-flags.ts) y DEBEN coincidir exactamente:
// - `DIABETES` -> safetyFlags.diabetes
// - `VALVULOPATIA` / `PROTESIS_VALVULAR` / `ENDOCARDITIS_PREVIA` /
//   `REEMPLAZO_ARTICULAR` / `INMUNOSUPRESION` -> safetyFlags.profilaxisAntibiotica
// El resto de condiciones (hipertensión, asma, etc.) son informativas para
// la ficha clínica y no participan en la derivación de banderas. La entrada
// de osteoporosis también es informativa: `bifosfonatos` se deriva de
// `medications` por palabra clave, no de esta condición.
export const STANDARD_CONDITIONS: { codigo: string; etiqueta: string }[] = [
  { codigo: 'HIPERTENSION', etiqueta: 'Hipertensión' },
  { codigo: 'CARDIOPATIA', etiqueta: 'Enfermedad cardíaca' },
  { codigo: 'VALVULOPATIA', etiqueta: 'Soplo / valvulopatía' },
  { codigo: 'PROTESIS_VALVULAR', etiqueta: 'Prótesis valvular cardíaca' },
  { codigo: 'ENDOCARDITIS_PREVIA', etiqueta: 'Endocarditis infecciosa previa' },
  { codigo: 'DIABETES', etiqueta: 'Diabetes' },
  { codigo: 'ASMA', etiqueta: 'Asma / respiratorio' },
  { codigo: 'HEPATITIS', etiqueta: 'Hepatitis / hígado' },
  { codigo: 'RENAL', etiqueta: 'Enfermedad renal' },
  { codigo: 'COAGULACION', etiqueta: 'Trastorno de coagulación / sangrado' },
  { codigo: 'INMUNOSUPRESION', etiqueta: 'Inmunosupresión' },
  { codigo: 'REEMPLAZO_ARTICULAR', etiqueta: 'Reemplazo articular / prótesis' },
  { codigo: 'EPILEPSIA', etiqueta: 'Epilepsia / convulsiones' },
  { codigo: 'CANCER', etiqueta: 'Cáncer / quimio-radioterapia' },
  { codigo: 'OSTEOPOROSIS', etiqueta: 'Osteoporosis / bifosfonatos' },
];
