import { ApiError } from '@/lib/api/api-error';
import { apiErrorFromBody } from '@/lib/api/client';
import { mergedPatientHref } from './merged-patient';

describe('mergedPatientHref (DX-266)', () => {
  const merged = apiErrorFromBody(
    404,
    { statusCode: 404, code: 'PATIENT_MERGED', mergedIntoId: 'kept-1', message: 'Este paciente se fusionó con otro.' },
    null,
  );

  it('el 404 PATIENT_MERGED lleva a la ficha del conservado con la misma pestaña', () => {
    expect(merged.mergedIntoId).toBe('kept-1');
    expect(mergedPatientHref(merged, '')).toBe('/patients/kept-1');
    expect(mergedPatientHref(merged, '?tab=plan&tooth=11')).toBe('/patients/kept-1?tab=plan&tooth=11');
  });

  it('cualquier otro error se queda en la ficha', () => {
    expect(mergedPatientHref(new ApiError(404, 'Paciente no encontrado'), '')).toBeNull();
    expect(mergedPatientHref(new ApiError(404, 'x', { code: 'PATIENT_MERGED' }), '')).toBeNull();
    expect(mergedPatientHref(new ApiError(500, 'x', { code: 'PATIENT_MERGED', mergedIntoId: 'k' }), '')).toBeNull();
    expect(mergedPatientHref(new Error('red'), '')).toBeNull();
  });
});
