import { displayPhone } from './display-phone';

describe('displayPhone (DX-387)', () => {
  it('shows the international format the API computed', () => {
    expect(displayPhone({ phone: '0412-1234567', phoneInternational: '+58 412 1234567' })).toBe('+58 412 1234567');
  });

  it('falls back to the stored phone, as is, when the API could not read it', () => {
    expect(displayPhone({ phone: 'llamar por la tarde', phoneInternational: null })).toBe('llamar por la tarde');
    // Una API anterior a DX-387 no trae el campo.
    expect(displayPhone({ phone: '3001234567' })).toBe('3001234567');
  });

  it('no phone at all is null', () => {
    expect(displayPhone({ phone: null, phoneInternational: null })).toBeNull();
    expect(displayPhone({ phone: '', phoneInternational: null })).toBeNull();
  });

  it('never formats on its own: the stored text is returned untouched', () => {
    expect(displayPhone({ phone: '  +57 3001234567 ', phoneInternational: null })).toBe('  +57 3001234567 ');
  });
});
