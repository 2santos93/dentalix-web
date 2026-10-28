// TODO(T8): los envases dejan de depender del país.
import type { ClinicCountry } from '@/lib/locations/location-country';
import type { PrescriptionItemInput, PrescriptionTemplateItem } from './prescriptions-api';

/**
 * Un medicamento tal como se edita en el formulario: todo texto, también los
 * números (un `<input type="number">` vacío es `''`, no `0`).
 */
export interface ItemDraft {
  activeIngredient: string;
  brandName: string;
  concentration: string;
  pharmaceuticalForm: string;
  route: string;
  dose: string;
  frequency: string;
  durationDays: string;
  totalQuantity: string;
  quantityUnit: string;
  packages: string;
  instructions: string;
}

const TEXT_FIELDS = [
  'activeIngredient',
  'brandName',
  'concentration',
  'pharmaceuticalForm',
  'route',
  'dose',
  'frequency',
  'quantityUnit',
  'instructions',
] as const;
const NUMBER_FIELDS = ['durationDays', 'totalQuantity', 'packages'] as const;

export function emptyItemDraft(): ItemDraft {
  return {
    activeIngredient: '',
    brandName: '',
    concentration: '',
    pharmaceuticalForm: '',
    route: '',
    dose: '',
    frequency: '',
    durationDays: '',
    totalQuantity: '',
    quantityUnit: '',
    packages: '',
    instructions: '',
  };
}

export function draftFromTemplateItem(item: PrescriptionTemplateItem): ItemDraft {
  const draft = emptyItemDraft();
  for (const field of TEXT_FIELDS) draft[field] = item[field] ?? '';
  for (const field of NUMBER_FIELDS) {
    const value = item[field];
    draft[field] = value == null ? '' : String(value);
  }
  return draft;
}

/**
 * Lo que se manda a la API: los vacíos NO viajan (la API, que conoce el país
 * de la sede, responde 400 en español con todo lo que falta). Los números se
 * mandan tal cual (con la coma decimal aceptada): un «7,5» llega como 7.5 y la
 * API responde que la duración debe ser un número entero.
 */
export function itemInputFromDraft(draft: ItemDraft): PrescriptionItemInput {
  const input: Record<string, string | number> = {};
  for (const field of TEXT_FIELDS) {
    const value = draft[field].trim();
    if (value !== '') input[field] = value;
  }
  for (const field of NUMBER_FIELDS) {
    const value = draft[field].trim();
    if (value !== '') input[field] = Number(value.replace(',', '.'));
  }
  return input as PrescriptionItemInput;
}

/** Igual, pero el principio activo de una plantilla viaja siempre. */
export function templateItemInputFromDraft(draft: ItemDraft): PrescriptionItemInput {
  return { activeIngredient: draft.activeIngredient.trim(), ...itemInputFromDraft(draft) };
}

/** Errores de un medicamento, por campo, en el orden en que se ven en el formulario. */
export type ItemDraftErrors = Partial<Record<keyof ItemDraft, string>>;

const REQUIRED_TEXT: readonly [keyof ItemDraft, string][] = [
  ['activeIngredient', 'Falta el principio activo (DCI).'],
  ['concentration', 'Falta la concentración.'],
  ['pharmaceuticalForm', 'Falta la forma farmacéutica.'],
  ['route', 'Falta la vía de administración.'],
  ['dose', 'Falta la dosis.'],
  ['frequency', 'Falta la frecuencia.'],
];

const NUMBER_RULES: Record<(typeof NUMBER_FIELDS)[number], { max: number; missing: string }> = {
  durationDays: { max: 365, missing: 'Falta la duración: indica los días de tratamiento.' },
  totalQuantity: { max: 9999, missing: 'Falta la cantidad total.' },
  packages: { max: 99, missing: 'Falta el nº de envases.' },
};

function numberError(field: (typeof NUMBER_FIELDS)[number], raw: string, required: boolean) {
  const value = raw.trim();
  const { max, missing } = NUMBER_RULES[field];
  if (value === '') return required ? missing : undefined;
  const n = Number(value.replace(',', '.'));
  return Number.isInteger(n) && n >= 1 && n <= max
    ? undefined
    : `Debe ser un número entero entre 1 y ${max}.`;
}

/**
 * Validación en el cliente de UN medicamento, con las mismas reglas por país
 * que la API (`prescription-rules.ts`): así cada campo se marca junto al
 * control en vez de esperar al 400. Lo que el formulario no conoce (documento
 * o nacimiento del paciente) lo sigue diciendo la API.
 */
export function itemDraftErrors(draft: ItemDraft, country: ClinicCountry): ItemDraftErrors {
  const errors: ItemDraftErrors = {};
  for (const [field, message] of REQUIRED_TEXT) {
    if (draft[field].trim() === '') errors[field] = message;
  }
  const duration = numberError('durationDays', draft.durationDays, true);
  if (duration) errors.durationDays = duration;
  const total = numberError('totalQuantity', draft.totalQuantity, true);
  if (total) errors.totalQuantity = total;
  if (draft.quantityUnit.trim() === '') {
    errors.quantityUnit = 'Falta la unidad (p. ej. tabletas).';
  }
  const packages = numberError('packages', draft.packages, country === 'ES');
  if (packages) errors.packages = packages;
  return errors;
}
