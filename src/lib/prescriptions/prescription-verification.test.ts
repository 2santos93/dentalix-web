import {
  formatVerificationCode,
  prescriptionVerificationUrl,
  verificationDate,
} from './prescription-verification';

describe('verificación pública de la receta (DX-467)', () => {
  it('agrupa el código de 4 en 4', () => {
    expect(formatVerificationCode('K7M3QH9XRT2W')).toBe('K7M3-QH9X-RT2W');
  });

  it('el QR apunta a /receta/<código> en el host de la clínica', () => {
    expect(prescriptionVerificationUrl('https://demo.dentalix.app', 'K7M3QH9XRT2W')).toBe(
      'https://demo.dentalix.app/receta/K7M3QH9XRT2W',
    );
    expect(prescriptionVerificationUrl('http://demo.localhost:3001/', 'K7M3QH9XRT2W')).toBe(
      'http://demo.localhost:3001/receta/K7M3QH9XRT2W',
    );
  });

  it('escribe el día con el formato de la sede (DD/MM/AAAA en es-VE)', () => {
    expect(verificationDate('2026-11-14', { locale: 'es-VE', hourCycle: 'h12' })).toBe('14/11/2026');
    expect(verificationDate('2026-11-14', { locale: 'en-US', hourCycle: 'h12' })).toBe('11/14/2026');
  });

  it('sin día o sin formato válido de la sede, «—»; nunca otro formato', () => {
    expect(verificationDate(null, { locale: 'es-VE', hourCycle: 'h12' })).toBe('—');
    expect(verificationDate('2026-11-14', { locale: null, hourCycle: 'h12' })).toBe('—');
    expect(verificationDate('2026-11-14', { locale: 'es-VE', hourCycle: null })).toBe('—');
    expect(verificationDate('2026-11-14', { locale: 'no_es_un_locale', hourCycle: 'h12' })).toBe('—');
  });
});
