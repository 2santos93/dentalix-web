import { canWriteClinicalHistory } from './clinical-roles';

describe('canWriteClinicalHistory', () => {
  it.each(['DENTIST', 'ASSISTANT', 'ADMIN'] as const)('%s puede', (role) => {
    expect(canWriteClinicalHistory(role)).toBe(true);
  });

  it('recepción no puede', () => {
    expect(canWriteClinicalHistory('RECEPTION')).toBe(false);
  });

  it('sin rol legible cuenta como sin permiso', () => {
    expect(canWriteClinicalHistory(null)).toBe(false);
  });
});
