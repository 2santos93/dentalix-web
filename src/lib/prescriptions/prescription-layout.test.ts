import { neutralPrescriptionLayout, validityDaysOf } from './prescription-layout';

describe('neutralPrescriptionLayout', () => {
  it('neutral layout', () => {
    expect(
      neutralPrescriptionLayout({ dispensationDate: '2026-10-16', validUntil: '2026-11-14' }),
    ).toEqual({
      title: 'Receta',
      subtitle: null,
      dispensationLabel: 'Válida desde',
      validityNote: '30 días',
      documentLabel: 'Documento',
      licenseLabel: 'Nº de registro profesional',
      patientRows: 'neutral',
    });
  });

  it('validityNote is «1 día» or «N días»', () => {
    const note = (dispensationDate: string, validUntil: string) =>
      neutralPrescriptionLayout({ dispensationDate, validUntil }).validityNote;
    expect(note('2026-10-16', '2026-10-16')).toBe('1 día');
    expect(note('2026-10-16', '2026-10-25')).toBe('10 días');
  });
});

describe('validityDaysOf', () => {
  it('validityDaysOf crosses 29 February', () => {
    expect(validityDaysOf('2028-02-28', '2028-03-01')).toBe(3);
  });
});
