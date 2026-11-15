import { ApiError } from '@/lib/api/api-error';

/** DX-266: código del 404 de `GET /patients/:id` para un paciente absorbido por una fusión. */
export const PATIENT_MERGED_CODE = 'PATIENT_MERGED';

export const mergedPatientCopy = {
  redirecting: 'Este paciente se fusionó con otro. Abriendo la ficha que se conservó…',
  redirected: 'Este paciente se fusionó con otro: esta es la ficha que se conservó.',
};

/**
 * A dónde lleva la ficha de un paciente fusionado: la del conservado, con la
 * misma pestaña y parámetros (`?tab=…`). `null` si el error no es ese 404.
 */
export function mergedPatientHref(err: unknown, search: string): string | null {
  if (!(err instanceof ApiError) || err.status !== 404 || err.code !== PATIENT_MERGED_CODE || !err.mergedIntoId) {
    return null;
  }
  const query = search.replace(/^\?/, '');
  return `/patients/${encodeURIComponent(err.mergedIntoId)}${query ? `?${query}` : ''}`;
}
