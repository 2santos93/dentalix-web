import { canUsePerio } from './perio-api';

describe('canUsePerio', () => {
  it('dentista, asistente y admin sí; recepción y sin rol no', () => {
    expect(canUsePerio('DENTIST')).toBe(true);
    expect(canUsePerio('ASSISTANT')).toBe(true);
    expect(canUsePerio('ADMIN')).toBe(true);
    expect(canUsePerio('RECEPTION')).toBe(false);
    expect(canUsePerio(null)).toBe(false);
  });
});
