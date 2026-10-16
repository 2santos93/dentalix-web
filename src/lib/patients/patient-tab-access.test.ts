import { patientTabAccess, resolvePatientTab } from './patient-tab-access';

describe('patientTabAccess (qué pestañas de la ficha ve cada rol)', () => {
  it('recepción no ve ninguna pestaña clínica (la API le responde 403)', () => {
    const access = patientTabAccess('RECEPTION');
    expect(access['clinical-history']).toBe(false);
    expect(access.odontogram).toBe(false);
    expect(access['treatment-plans']).toBe(false);
    expect(access.consents).toBe(false);
    // Sí lo suyo: datos, estado de cuenta y autorizaciones de datos.
    expect(access.data).toBe(true);
    expect(access['account-statement']).toBe(true);
    expect(access['data-consents']).toBe(true);
  });

  it.each(['DENTIST', 'ASSISTANT'] as const)(
    '%s ve lo clínico pero no el estado de cuenta',
    (role) => {
      const access = patientTabAccess(role);
      expect(access['clinical-history']).toBe(true);
      expect(access.odontogram).toBe(true);
      expect(access['treatment-plans']).toBe(true);
      expect(access.consents).toBe(true);
      expect(access['account-statement']).toBe(false);
    },
  );

  it('ADMIN ve todas', () => {
    expect(Object.values(patientTabAccess('ADMIN')).every(Boolean)).toBe(true);
  });

  it('sin rol legible solo queda «Datos»', () => {
    const access = patientTabAccess(null);
    expect(
      Object.entries(access)
        .filter(([, v]) => v)
        .map(([k]) => k),
    ).toEqual(['data']);
  });
});

describe('resolvePatientTab', () => {
  it('un ?tab= sin acceso (enlace compartido) o desconocido cae en «Datos»', () => {
    const reception = patientTabAccess('RECEPTION');
    expect(resolvePatientTab('treatment-plans', reception)).toBe('data');
    expect(resolvePatientTab('odontogram', reception)).toBe('data');
    expect(resolvePatientTab('nope', reception)).toBe('data');
    expect(resolvePatientTab(null, reception)).toBe('data');
    expect(resolvePatientTab('account-statement', reception)).toBe('account-statement');
  });
});
