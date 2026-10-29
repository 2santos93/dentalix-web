import { legacyPrescriptionLayout } from './legacy-prescription-layout';

describe('legacyPrescriptionLayout', () => {
  it('CO legacy layout', () => {
    expect(legacyPrescriptionLayout({ country: 'CO' })).toEqual({
      title: 'Fórmula médica',
      subtitle: 'Decreto 780 de 2016, art. 2.5.3.10.16',
      dispensationLabel: 'Fecha de la receta',
      validityNote: '30 días naturales',
      documentLabel: 'Documento',
      licenseLabel: 'Registro profesional',
      patientRows: 'clinicalRecord',
    });
  });

  it('ES legacy layout', () => {
    expect(legacyPrescriptionLayout({ country: 'ES' })).toEqual({
      title: 'Receta médica privada',
      subtitle: 'Real Decreto 1718/2010, art. 3',
      dispensationLabel: 'Fecha prevista de dispensación',
      validityNote: '10 días naturales',
      documentLabel: 'DNI/NIE',
      licenseLabel: 'Nº de colegiado',
      patientRows: 'birthYear',
    });
  });

  it('country null → null', () => {
    expect(legacyPrescriptionLayout({ country: null })).toBeNull();
  });

  it('unknown legacy country → null (explicit neutral fallback, never undefined)', () => {
    const unknown = { country: 'XX' as unknown as 'CO' };
    expect(legacyPrescriptionLayout(unknown)).toBeNull();
  });
});
