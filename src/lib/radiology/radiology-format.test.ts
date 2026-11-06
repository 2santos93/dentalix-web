import { expiryWhen, proposedExpiresOn, radiologyKindText, radiologyOfficer } from './radiology-format';

describe('expediente de rayos X: formato (DX-544)', () => {
  it('propone el vencimiento como la API: licencia I 5 años, II 4, control de calidad 2', () => {
    expect(proposedExpiresOn('LICENSE', 'I', '2026-03-15')).toBe('2031-03-15');
    expect(proposedExpiresOn('LICENSE', 'II', '2026-03-15')).toBe('2030-03-15');
    expect(proposedExpiresOn('QUALITY_CONTROL', null, '2026-03-15')).toBe('2028-03-15');
    // Recorta a fin de mes.
    expect(proposedExpiresOn('LICENSE', 'I', '2028-02-29')).toBe('2033-02-28');
    // Sin expedición o sin categoría en la licencia, no hay propuesta.
    expect(proposedExpiresOn('LICENSE', 'I', null)).toBeNull();
    expect(proposedExpiresOn('LICENSE', null, '2026-03-15')).toBeNull();
  });

  it('nombra el tipo y la categoría', () => {
    expect(radiologyKindText({ kind: 'LICENSE', category: 'II' })).toBe('Licencia · Cat. II');
    expect(radiologyKindText({ kind: 'QUALITY_CONTROL', category: null })).toBe('Control de calidad');
  });

  it('el encargado: del personal o escrito', () => {
    expect(radiologyOfficer({ officerMemberName: 'Dra. Ana', officerName: null })).toBe('Dra. Ana');
    expect(radiologyOfficer({ officerMemberName: null, officerName: 'Ing. Pérez' })).toBe('Ing. Pérez');
    expect(radiologyOfficer({ officerMemberName: null, officerName: null })).toBeNull();
  });

  it('dice cuándo vence en palabras', () => {
    expect(expiryWhen(-12)).toBe('Venció hace 12 días');
    expect(expiryWhen(-1)).toBe('Venció ayer');
    expect(expiryWhen(0)).toBe('Vence hoy');
    expect(expiryWhen(1)).toBe('Vence mañana');
    expect(expiryWhen(45)).toBe('Vence en 45 días');
  });
});
