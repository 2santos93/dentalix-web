import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-266: «Posibles duplicados» y fusión segura de dos pacientes. Todo solo
// ADMIN (la API responde 403 a los demás roles).

type Schemas = components['schemas'];

export type DuplicateReason = Schemas['DuplicateReason'];
export type DuplicatePatient = Schemas['DuplicatePatientDto'];
export type DuplicatePair = Schemas['DuplicatePairDto'];
export type DuplicatePage = Schemas['DuplicatePageDto'];
export type MergeBlocker = Schemas['MergeBlocker'];
export type MergeCategory = Schemas['MergeCategory'];
export type MergeFieldValues = Schemas['MergeFieldValuesDto'];
export type MergeSide = Schemas['MergeSideDto'];
export type MergePreview = Schemas['MergePreviewDto'];
export type MergeFieldGroup = Schemas['MergeFieldGroup'];
export type MergeFieldSource = Schemas['MergeFieldSource'];
export type MergeFieldChoices = Schemas['MergeFieldChoicesDto'];
export type MergePatientsInput = Schemas['MergePatientsDto'];
export type MergeResult = Schemas['MergeResultDto'];
export type MergeLeftover = Schemas['MergeLeftoverDto'];
export type MergeLeftoversResult = Schemas['MergeLeftoversResultDto'];

/** La lista vive bajo Pacientes, sin entrada propia en el menú (presupuesto de 900 px). */
export const DUPLICATES_HREF = '/patients/duplicados';

/** Solo ADMIN, igual que el `@Roles` de la API. Solo decide qué se pinta. */
export function canManageDuplicates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Tamaño de página que pide la lista (la API admite hasta 50). */
export const DUPLICATES_PAGE_SIZE = 20;

/** `GET /patient-duplicates?locationId&page&pageSize`. */
export function listDuplicates(
  token: string,
  params: { page: number; pageSize?: number; locationId?: string | null },
): Promise<DuplicatePage> {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize ?? DUPLICATES_PAGE_SIZE),
  });
  if (params.locationId) search.set('locationId', params.locationId);
  return apiFetch<DuplicatePage>(`/patient-duplicates?${search.toString()}`, { token });
}

/** `POST /patient-duplicates/dismissals` → 204: «No es duplicado». */
export async function dismissDuplicate(token: string, patientIds: [string, string]): Promise<void> {
  await apiFetchOrNull<null>('/patient-duplicates/dismissals', {
    method: 'POST',
    body: { patientIds },
    token,
  });
}

/** `GET /patient-duplicates/merge-preview?keptId&absorbedId`. */
export function getMergePreview(token: string, keptId: string, absorbedId: string): Promise<MergePreview> {
  const search = new URLSearchParams({ keptId, absorbedId });
  return apiFetch<MergePreview>(`/patient-duplicates/merge-preview?${search.toString()}`, { token });
}

/** `POST /patient-duplicates/merge` → 201. Sin deshacer. */
export function mergePatients(token: string, input: MergePatientsInput): Promise<MergeResult> {
  return apiFetch<MergeResult>('/patient-duplicates/merge', { method: 'POST', body: input, token });
}

/**
 * DX-266-bis: `GET /patient-duplicates/merge-leftovers?keptId` — los pacientes
 * fusionados en este a los que les quedó algo (una escritura que llegó en el
 * mismo instante que la fusión). Vacío casi siempre.
 */
export async function listMergeLeftovers(token: string, keptId: string): Promise<MergeLeftover[]> {
  const search = new URLSearchParams({ keptId });
  const res = await apiFetch<{ items: MergeLeftover[] }>(`/patient-duplicates/merge-leftovers?${search.toString()}`, {
    token,
  });
  return res.items;
}

/** DX-266-bis: `POST /patient-duplicates/merge-leftovers` → 201. Idempotente. */
export function moveMergeLeftovers(token: string, absorbedId: string): Promise<MergeLeftoversResult> {
  return apiFetch<MergeLeftoversResult>('/patient-duplicates/merge-leftovers', {
    method: 'POST',
    body: { absorbedId },
    token,
  });
}

/** Por qué sale una pareja: una etiqueta corta (chip) y la frase que lo explica. */
export const DUPLICATE_REASON_COPY: Record<DuplicateReason, { label: string; hint: string }> = {
  DOCUMENT: {
    label: 'Mismo documento',
    hint: 'El número de documento coincide aunque esté escrito distinto (con o sin puntos o guiones).',
  },
  NAME_BIRTHDATE: {
    label: 'Mismo nombre y nacimiento',
    hint: 'El nombre completo y la fecha de nacimiento coinciden.',
  },
  PHONE_NAME: {
    label: 'Mismo teléfono y nombre',
    hint: 'Comparten teléfono y también primer nombre y apellido.',
  },
};

/** Lo que impide fusionar: los textos de la API (`merge-errors.ts`). */
export const MERGE_BLOCKER_COPY: Record<MergeBlocker, string> = {
  DX266_OVERLAPPING_APPOINTMENTS:
    'Los dos pacientes tienen citas a la misma hora. Cancela o mueve una de ellas antes de fusionar.',
  DX266_OPENING_BALANCE_CONFLICT:
    'Los dos pacientes tienen un saldo migrado del mismo lote de importación y en la misma moneda. Esos saldos no se pueden juntar.',
  DX266_OPEN_PAYMENT_PROMISES:
    'Los dos pacientes tienen un compromiso de pago abierto. Cierra uno de los dos antes de fusionar.',
  // DX-190.
  DX266_TWO_ACTIVE_ORTHO_CASES:
    'Los dos pacientes tienen un caso de ortodoncia activo. Finaliza, pasa a retención o da por abandonado uno de los dos antes de fusionar.',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Lo que pasa a la ficha que se conserva, por categoría. `other` (bajas de
 * avisos, revisiones de mayoría de edad…) también se mueve, pero la API no lo
 * cuenta: no se enseña.
 */
export const MERGE_CATEGORY_COPY: Record<Exclude<MergeCategory, 'other'>, (n: number) => string> = {
  appointments: (n) => plural(n, 'cita', 'citas'),
  clinicalEntries: (n) => plural(n, 'evolución clínica', 'evoluciones clínicas'),
  odontogram: (n) => plural(n, 'registro del odontograma', 'registros del odontograma'),
  periodontogram: (n) => plural(n, 'periodontograma', 'periodontogramas'),
  anamnesis: (n) => plural(n, 'versión de la anamnesis', 'versiones de la anamnesis'),
  consents: (n) => plural(n, 'consentimiento', 'consentimientos'),
  documents: (n) => plural(n, 'documento', 'documentos'),
  prescriptions: (n) => plural(n, 'receta', 'recetas'),
  treatmentPlans: (n) => plural(n, 'plan de tratamiento', 'planes de tratamiento'),
  payments: (n) => plural(n, 'pago', 'pagos'),
  coverages: (n) => plural(n, 'cobertura', 'coberturas'),
  responsibleParties: (n) => plural(n, 'responsable', 'responsables'),
  recalls: (n) => plural(n, 'control periódico', 'controles periódicos'),
};

const COUNTED = Object.keys(MERGE_CATEGORY_COPY) as Exclude<MergeCategory, 'other'>[];

/**
 * DX-266-bis: las líneas de lo que quedó en un absorbido, en el orden de la
 * ficha. Aquí `other` sí se cuenta (la API lo suma): «2 registros más».
 */
export function leftoverLines(counts: readonly { category: MergeCategory; count: number }[]): string[] {
  const byCategory = new Map(counts.map((c) => [c.category, c.count]));
  const lines = COUNTED.flatMap((category) => {
    const n = byCategory.get(category) ?? 0;
    return n > 0 ? [MERGE_CATEGORY_COPY[category](n)] : [];
  });
  const other = byCategory.get('other') ?? 0;
  if (other > 0) {
    const more = lines.length > 0;
    lines.push(plural(other, more ? 'registro más' : 'registro', more ? 'registros más' : 'registros'));
  }
  return lines;
}

/** Las líneas «3 citas», «1 receta»… de un lado, en el orden de la ficha; sin ceros. */
export function countLines(side: MergeSide): string[] {
  const byCategory = new Map(side.counts.map((c) => [c.category, c.count]));
  return COUNTED.flatMap((category) => {
    const n = byCategory.get(category) ?? 0;
    return n > 0 ? [MERGE_CATEGORY_COPY[category](n)] : [];
  });
}

/**
 * Los grupos que se eligen enteros, en el orden de la ficha y con las columnas
 * que compara la API (`merge-fields.ts`): el documento es tipo + nombre del
 * tipo + número; la dirección, con su país y su ciudad.
 */
export const MERGE_FIELD_GROUPS: ReadonlyArray<{
  group: MergeFieldGroup;
  label: string;
  columns: readonly (keyof MergeFieldValues)[];
}> = [
  { group: 'firstName', label: 'Nombre', columns: ['firstName'] },
  { group: 'lastName', label: 'Apellidos', columns: ['lastName'] },
  { group: 'document', label: 'Documento', columns: ['documentType', 'docTypeLabel', 'docNumber'] },
  { group: 'birthDate', label: 'Fecha de nacimiento', columns: ['birthDate'] },
  { group: 'sex', label: 'Sexo', columns: ['sex'] },
  { group: 'phone', label: 'Teléfono', columns: ['phone'] },
  { group: 'email', label: 'Correo', columns: ['email'] },
  { group: 'address', label: 'Dirección', columns: ['address', 'countryCode', 'cityId'] },
  { group: 'maritalStatus', label: 'Estado civil', columns: ['maritalStatus'] },
  { group: 'occupation', label: 'Ocupación', columns: ['occupation'] },
  { group: 'physician', label: 'Médico tratante', columns: ['physicianName', 'physicianPhone'] },
  {
    group: 'emergencyContact',
    label: 'Contacto de emergencia',
    columns: ['emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'],
  },
  { group: 'notes', label: 'Notas', columns: ['notes'] },
  { group: 'preferredLanguage', label: 'Idioma de los avisos', columns: ['preferredLanguage'] },
];

/** ¿El grupo tiene valores distintos en las dos fichas? (vacío y `null` cuentan igual) */
export function groupDiffers(
  columns: readonly (keyof MergeFieldValues)[],
  kept: MergeFieldValues,
  absorbed: MergeFieldValues,
): boolean {
  return columns.some((column) => (kept[column] ?? null) !== (absorbed[column] ?? null));
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/**
 * ¿La ficha no tiene el dato del grupo? Todo el grupo vacío; el documento, sin
 * número (su tipo siempre tiene valor, y un tipo sin número no es un documento).
 */
export function groupIsEmpty(
  group: MergeFieldGroup,
  columns: readonly (keyof MergeFieldValues)[],
  values: MergeFieldValues,
): boolean {
  if (group === 'document') return isEmpty(values.docNumber);
  return columns.every((column) => isEmpty(values[column]));
}

/**
 * El valor que se propone para un grupo distinto: el del conservado, salvo que
 * el conservado no tenga el dato y el absorbido sí (no se pierde por defecto).
 */
export function defaultSource(
  group: MergeFieldGroup,
  columns: readonly (keyof MergeFieldValues)[],
  kept: MergeFieldValues,
  absorbed: MergeFieldValues,
): MergeFieldSource {
  return groupIsEmpty(group, columns, kept) && !groupIsEmpty(group, columns, absorbed) ? 'ABSORBED' : 'KEPT';
}

/**
 * Lo que se queda de cada grupo distinto: lo elegido o, sin elegir, lo propuesto.
 * Los grupos iguales no aparecen (da igual de qué ficha salgan).
 */
export function effectiveChoices(
  kept: MergeFieldValues,
  absorbed: MergeFieldValues,
  choices: Partial<Record<MergeFieldGroup, MergeFieldSource>>,
): Partial<Record<MergeFieldGroup, MergeFieldSource>> {
  const result: Partial<Record<MergeFieldGroup, MergeFieldSource>> = {};
  for (const { group, columns } of MERGE_FIELD_GROUPS) {
    if (!groupDiffers(columns, kept, absorbed)) continue;
    result[group] = choices[group] ?? defaultSource(group, columns, kept, absorbed);
  }
  return result;
}

/**
 * El `fields` del cuerpo: solo los grupos que se toman de la ficha absorbida
 * (lo demás, sin indicar, se queda con el valor del conservado). `undefined`
 * si no se toma ninguno.
 */
export function mergeFieldsBody(
  choices: Partial<Record<MergeFieldGroup, MergeFieldSource>>,
): MergeFieldChoices | undefined {
  const fields: MergeFieldChoices = {};
  for (const { group } of MERGE_FIELD_GROUPS) {
    if (choices[group] === 'ABSORBED') fields[group] = 'ABSORBED';
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}
