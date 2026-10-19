import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/** Código CIE-10 de la tabla de referencia (DX-212). */
export type Icd10Code = components['schemas']['Icd10CodeDto'];

/**
 * `GET /reference/icd10?q=` — por código («K02», «k021») o texto («caries»),
 * sin tildes ni mayúsculas. La API devuelve como mucho 20.
 */
export async function searchIcd10(token: string, q: string): Promise<Icd10Code[]> {
  const search = new URLSearchParams();
  if (q.trim()) search.set('q', q.trim());
  const qs = search.toString();
  return apiFetch<Icd10Code[]>(`/reference/icd10${qs ? `?${qs}` : ''}`, { token });
}
