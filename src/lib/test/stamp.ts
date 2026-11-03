import type { ClinicLocation } from '@/lib/locations/locations-api';
import { stampPainters, type SedePainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock } from './sede-clock';

/** Los pintores de sede con estas sedes (la primera es la de la pantalla): para probar ayudantes de `lib/**` (DX-354b). */
export function testStamp(locations?: ClinicLocation[], activeLocationId?: string | null): SedePainters {
  return stampPainters(testAgendaClock(locations, activeLocationId));
}
