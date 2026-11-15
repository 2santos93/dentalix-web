import type {
  AnestheticProduct,
  CreateAnestheticInput,
  UpdateAnestheticInput,
} from './anesthesia-api';
import { formatDecimal, formatEpinephrineMg } from './anesthesia-api';

/**
 * Formulario del catálogo de anestésicos (DX-408). Los límites son los de
 * `CreateAnestheticProductDto` de la API (DX-307, DX-420): la web los repite
 * para decir en español qué falla junto al campo; la API vuelve a validarlos.
 */
export const ANESTHETIC_LIMITS = {
  nameMax: 120,
  activeIngredientMax: 80,
  vasoconstrictorMax: 80,
  concentrationPct: { min: 0.01, max: 10, decimals: 2 },
  mlPerCarpule: { min: 0.1, max: 5, decimals: 2 },
  maxMgPerKg: { min: 0.1, max: 20, decimals: 2 },
  maxAbsoluteMg: { min: 1, max: 2000, decimals: 1 },
  pediatricMaxMgPerKg: { min: 0.1, max: 20, decimals: 2 },
  minAgeYears: { min: 0, max: 18, decimals: 0 },
  epinephrineMgPerCarpule: { min: 0, max: 0.2, decimals: 4 },
} as const;

export type NumericField =
  | 'concentrationPct'
  | 'mlPerCarpule'
  | 'maxMgPerKg'
  | 'maxAbsoluteMg'
  | 'pediatricMaxMgPerKg'
  | 'minAgeYears'
  | 'epinephrineMgPerCarpule';

export type FormField = 'name' | 'activeIngredient' | 'vasoconstrictor' | NumericField;

/** Lo que se escribe: todo texto, con coma o punto decimal. */
export type AnestheticDraft = Record<FormField, string>;

export type AnestheticErrors = Partial<Record<FormField, string>>;

const OPTIONAL: readonly NumericField[] = ['pediatricMaxMgPerKg', 'minAgeYears', 'epinephrineMgPerCarpule'];

/** «1,8» con la coma de la ficha; los valores del catálogo como se escriben. */
function show(field: NumericField, value: number | null): string {
  if (value === null) return '';
  return field === 'epinephrineMgPerCarpule' ? formatEpinephrineMg(value) : formatDecimal(value);
}

export function emptyDraft(): AnestheticDraft {
  return {
    name: '',
    activeIngredient: '',
    vasoconstrictor: '',
    concentrationPct: '',
    mlPerCarpule: '',
    maxMgPerKg: '',
    maxAbsoluteMg: '',
    pediatricMaxMgPerKg: '',
    minAgeYears: '',
    epinephrineMgPerCarpule: '',
  };
}

export function draftFrom(product: AnestheticProduct): AnestheticDraft {
  return {
    name: product.name,
    activeIngredient: product.activeIngredient,
    vasoconstrictor: product.vasoconstrictor ?? '',
    concentrationPct: show('concentrationPct', product.concentrationPct),
    mlPerCarpule: show('mlPerCarpule', product.mlPerCarpule),
    maxMgPerKg: show('maxMgPerKg', product.maxMgPerKg),
    maxAbsoluteMg: show('maxAbsoluteMg', product.maxAbsoluteMg),
    pediatricMaxMgPerKg: show('pediatricMaxMgPerKg', product.pediatricMaxMgPerKg),
    minAgeYears: product.minAgeYears === null ? '' : String(product.minAgeYears),
    epinephrineMgPerCarpule: show('epinephrineMgPerCarpule', product.epinephrineMgPerCarpule),
  };
}

/** «2» / «1,8» / «0.018»: número con, como mucho, `decimals` decimales. */
export function parseDecimalText(text: string, decimals: number): number | null {
  const clean = text.trim().replace(',', '.');
  const pattern = decimals === 0 ? /^\d{1,4}$/ : new RegExp(`^\\d{1,4}(\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(clean)) return null;
  return Number(clean);
}

/** El mensaje dice el rango y los decimales: qué escribir, no solo qué falla. */
export function rangeMessage(field: NumericField): string {
  const { min, max, decimals } = ANESTHETIC_LIMITS[field];
  const fmt = field === 'epinephrineMgPerCarpule' ? formatEpinephrineMg : formatDecimal;
  if (decimals === 0) return `Escribe un número entero entre ${fmt(min)} y ${fmt(max)}.`;
  const places = decimals === 1 ? '1 decimal' : `${decimals} decimales`;
  return `Escribe un número entre ${fmt(min)} y ${fmt(max)}, con hasta ${places}.`;
}

export interface ParsedAnesthetic {
  name: string;
  activeIngredient: string;
  vasoconstrictor: string | null;
  concentrationPct: number;
  mlPerCarpule: number;
  maxMgPerKg: number;
  maxAbsoluteMg: number;
  pediatricMaxMgPerKg: number | null;
  minAgeYears: number | null;
  /** null = vacío: la API lo deduce del vasoconstrictor y del volumen. */
  epinephrineMgPerCarpule: number | null;
}

export const FORM_MESSAGES = {
  nameRequired: 'Escribe el nombre comercial o de presentación.',
  nameTooLong: `El nombre admite hasta ${ANESTHETIC_LIMITS.nameMax} caracteres.`,
  activeIngredientRequired: 'Escribe el principio activo (por ejemplo, Lidocaína).',
  activeIngredientTooLong: `El principio activo admite hasta ${ANESTHETIC_LIMITS.activeIngredientMax} caracteres.`,
  vasoconstrictorTooLong: `El vasoconstrictor admite hasta ${ANESTHETIC_LIMITS.vasoconstrictorMax} caracteres.`,
} as const;

/**
 * Valida el borrador. Devuelve los valores o los errores por campo (escalón 4
 * de la escalera de errores: cada uno junto a su campo).
 */
export function validateDraft(
  draft: AnestheticDraft,
): { ok: true; value: ParsedAnesthetic } | { ok: false; errors: AnestheticErrors } {
  const errors: AnestheticErrors = {};
  const name = draft.name.trim();
  const activeIngredient = draft.activeIngredient.trim();
  const vasoconstrictor = draft.vasoconstrictor.trim();
  if (name === '') errors.name = FORM_MESSAGES.nameRequired;
  else if (name.length > ANESTHETIC_LIMITS.nameMax) errors.name = FORM_MESSAGES.nameTooLong;
  if (activeIngredient === '') errors.activeIngredient = FORM_MESSAGES.activeIngredientRequired;
  else if (activeIngredient.length > ANESTHETIC_LIMITS.activeIngredientMax) {
    errors.activeIngredient = FORM_MESSAGES.activeIngredientTooLong;
  }
  if (vasoconstrictor.length > ANESTHETIC_LIMITS.vasoconstrictorMax) {
    errors.vasoconstrictor = FORM_MESSAGES.vasoconstrictorTooLong;
  }

  const numbers = {} as Record<NumericField, number | null>;
  for (const field of Object.keys(ANESTHETIC_LIMITS) as (keyof typeof ANESTHETIC_LIMITS)[]) {
    const limit = ANESTHETIC_LIMITS[field];
    if (typeof limit === 'number') continue;
    const key = field as NumericField;
    const text = draft[key].trim();
    if (text === '' && OPTIONAL.includes(key)) {
      numbers[key] = null;
      continue;
    }
    const value = parseDecimalText(text, limit.decimals);
    if (value === null || value < limit.min || value > limit.max) {
      errors[key] = rangeMessage(key);
      numbers[key] = null;
    } else {
      numbers[key] = value;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      activeIngredient,
      vasoconstrictor: vasoconstrictor === '' ? null : vasoconstrictor,
      concentrationPct: numbers.concentrationPct!,
      mlPerCarpule: numbers.mlPerCarpule!,
      maxMgPerKg: numbers.maxMgPerKg!,
      maxAbsoluteMg: numbers.maxAbsoluteMg!,
      pediatricMaxMgPerKg: numbers.pediatricMaxMgPerKg,
      minAgeYears: numbers.minAgeYears,
      epinephrineMgPerCarpule: numbers.epinephrineMgPerCarpule,
    },
  };
}

/** Alta: la epinefrina vacía no se envía y la API la deduce. */
export function toCreateInput(value: ParsedAnesthetic): CreateAnestheticInput {
  const { epinephrineMgPerCarpule, ...rest } = value;
  return epinephrineMgPerCarpule === null ? rest : { ...rest, epinephrineMgPerCarpule };
}

/**
 * Edición: solo lo que cambió. Vaciar la epinefrina pide recalcularla: se
 * reenvía el vasoconstrictor (la API la recalcula al cambiarlo sin darla).
 */
export function toUpdatePatch(current: AnestheticProduct, value: ParsedAnesthetic): UpdateAnestheticInput {
  const patch: UpdateAnestheticInput = {};
  const keys = [
    'name',
    'activeIngredient',
    'vasoconstrictor',
    'concentrationPct',
    'mlPerCarpule',
    'maxMgPerKg',
    'maxAbsoluteMg',
    'pediatricMaxMgPerKg',
    'minAgeYears',
  ] as const;
  for (const key of keys) {
    if (value[key] !== current[key]) (patch as Record<string, unknown>)[key] = value[key];
  }
  if (value.epinephrineMgPerCarpule === null) {
    if (current.epinephrineMgPerCarpule !== null && patch.vasoconstrictor === undefined && patch.mlPerCarpule === undefined) {
      patch.vasoconstrictor = current.vasoconstrictor;
    }
  } else if (value.epinephrineMgPerCarpule !== current.epinephrineMgPerCarpule) {
    patch.epinephrineMgPerCarpule = value.epinephrineMgPerCarpule;
  }
  return patch;
}
