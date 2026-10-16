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
