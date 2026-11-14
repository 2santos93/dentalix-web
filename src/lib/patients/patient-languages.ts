import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/** DX-497: idiomas que la ficha ofrece como idioma preferido del paciente. */
export type PatientLanguages = components['schemas']['PatientLanguagesDto'];

/** Opción «sin preferencia»: el valor `null` de la ficha. */
export const CLINIC_LANGUAGE_LABEL = 'Idioma de la clínica';

/** La lista la cambia solo ADMIN (la API también lo exige). */
export function canManagePatientLanguages(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export function getPatientLanguages(token: string): Promise<PatientLanguages> {
  return apiFetch<PatientLanguages>('/patients/languages', { token });
}

export function savePatientLanguages(token: string, languages: string[]): Promise<PatientLanguages> {
  return apiFetch<PatientLanguages>('/patients/languages', {
    method: 'PUT',
    body: { languages },
    token,
  });
}

/**
 * Nombre de un idioma en ese mismo idioma, como lo reconoce quien lo habla:
 * «English (en)», «Català (ca)», «Español (es)». Sin nombre conocido, solo la
 * etiqueta.
 */
export function languageName(tag: string): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
  } catch {
    name = undefined;
  }
  if (!name || name === tag) return tag;
  const capitalized = name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
  return `${capitalized} (${tag})`;
}

/** Un idioma que ya no está en la lista de la clínica: «(no disponible) ca». */
export function unavailableLanguageLabel(tag: string): string {
  return `(no disponible) ${tag}`;
}

/**
 * Cómo se lee el idioma preferido del paciente en la ficha: «Idioma de la
 * clínica» (null), el nombre si la clínica lo ofrece o «(no disponible) ca»
 * si se quitó de la lista (el dato del paciente se conserva).
 */
export function preferredLanguageLabel(preferred: string | null, offered: readonly string[]): string {
  if (!preferred) return CLINIC_LANGUAGE_LABEL;
  return offered.includes(preferred) ? languageName(preferred) : unavailableLanguageLabel(preferred);
}

export interface LanguageOption {
  /** '' = «Idioma de la clínica» (se envía null). */
  value: string;
  label: string;
}

/**
 * Opciones del desplegable: «Idioma de la clínica» y los de la lista (sin el
 * de la clínica, que ya es la primera opción). Si el paciente tiene uno que
 * se quitó, sigue saliendo marcado «(no disponible)» para no perderlo al
 * guardar otra cosa.
 */
export function languageOptions(
  offered: readonly string[],
  clinicLanguage: string,
  current: string | null = null,
): LanguageOption[] {
  const options: LanguageOption[] = [
    { value: '', label: `${CLINIC_LANGUAGE_LABEL} · ${languageName(clinicLanguage)}` },
    ...offered.filter((tag) => tag !== clinicLanguage).map((tag) => ({ value: tag, label: languageName(tag) })),
  ];
  if (current && current !== clinicLanguage && !offered.includes(current)) {
    options.push({ value: current, label: unavailableLanguageLabel(current) });
  }
  return options;
}
