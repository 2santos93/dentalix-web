import { canonicalTimeZone } from './regional-settings';

describe('canonicalTimeZone (solo la capitalización, nunca el nombre)', () => {
  it.each(['Asia/Kolkata', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh', 'Asia/Kathmandu', 'America/Nuuk', 'Etc/UTC'])(
    '%s se queda como está (V8 lo pasaría a su alias viejo de ICU)',
    (zone) => {
      expect(canonicalTimeZone(zone)).toBe(zone);
    },
  );

  it('a lowercase name gets its canonical case', () => {
    expect(canonicalTimeZone('asia/tokyo')).toBe('Asia/Tokyo');
    expect(canonicalTimeZone('  europe/madrid ')).toBe('Europe/Madrid');
    expect(canonicalTimeZone('utc')).toBe('UTC');
  });

  it('an unknown zone is null', () => {
    expect(canonicalTimeZone('Marte/Olimpo')).toBeNull();
    expect(canonicalTimeZone('')).toBeNull();
    expect(canonicalTimeZone(null)).toBeNull();
  });
});
