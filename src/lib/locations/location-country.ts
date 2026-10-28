import type { components } from '@/lib/api/schema';

/**
 * País de la sede (`locations.country`), tal como lo edita el formulario de
 * sedes. Vivía en el cliente de recetas hasta DX-324; DX-312 lo retira.
 */
export type ClinicCountry = components['schemas']['ClinicCountry'];

export const COUNTRY_LABELS: Record<ClinicCountry, string> = {
  CO: 'Colombia',
  ES: 'España',
};
