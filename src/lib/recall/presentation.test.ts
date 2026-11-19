import { BATCH_OUTCOME_ORDER, attemptsLabel, callbackCopy, callbackError, callbackRange } from './presentation';

describe('presentación de los intentos (DX-465)', () => {
  it('«2 de 3»', () => {
    expect(attemptsLabel(2, 3)).toBe('2 de 3');
  });

  it('el lote no ofrece «Agendó»', () => {
    expect(BATCH_OUTCOME_ORDER).not.toContain('BOOKED');
    expect(BATCH_OUTCOME_ORDER).toHaveLength(6);
  });

  it('«Llamar luego»: de hoy a 90 días; con varias sedes, el rango que vale en todas', () => {
    expect(callbackRange(['2026-11-19'])).toEqual({ min: '2026-11-19', max: '2027-02-17' });
    // Tokio ya va un día por delante de Caracas.
    expect(callbackRange(['2026-11-19', '2026-11-20'])).toEqual({ min: '2026-11-20', max: '2027-02-17' });
    expect(callbackRange(['2026-11-19', null])).toBeNull();
    expect(callbackRange([])).toBeNull();
  });

  it('los errores de la fecha, con los textos de la API', () => {
    const range = { min: '2026-11-19', max: '2027-02-17' };
    expect(callbackError(null, range)).toBe(callbackCopy.required);
    expect(callbackError('2026-11-18', range)).toBe(callbackCopy.past);
    expect(callbackError('2027-02-18', range)).toBe(callbackCopy.tooFar);
    expect(callbackError('2026-11-19', range)).toBeNull();
    expect(callbackError('2027-02-17', range)).toBeNull();
    // Sin zona de la sede no se sabe «hoy»: decide la API.
    expect(callbackError('2020-01-01', null)).toBeNull();
  });
});
