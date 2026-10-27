import { browserHourCycle, browserLocale, canonicalLocale, canonicalTimeZone } from './regional-settings';

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

  it.each([
    ['asia/kolkata', 'Asia/Kolkata'],
    ['asia/calcutta', 'Asia/Calcutta'],
    ['europe/kyiv', 'Europe/Kyiv'],
    ['utc', 'UTC'],
    ['etc/utc', 'Etc/UTC'],
    ['america/port-au-prince', 'America/Port-au-Prince'],
  ])('spec §7: %s → %s (the list, never the link target)', (raw, canonical) => {
    expect(canonicalTimeZone(raw)).toBe(canonical);
  });

  it('never calls resolvedOptions', () => {
    const spy = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions');
    try {
      for (const raw of ['asia/kolkata', 'Asia/Kolkata', 'europe/kyiv', 'utc', 'Marte/Olimpo']) canonicalTimeZone(raw);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('canonicalLocale', () => {
  it('canonicalLocale strips hc', () => {
    expect(canonicalLocale('en-us-u-hc-h12')).toBe('en-US');
    expect(canonicalLocale('ja-JP-u-ca-japanese-hc-h12')).toBe('ja-JP-u-ca-japanese');
    expect(canonicalLocale('fr-FR-u-hc-h23-nu-latn')).toBe('fr-FR-u-nu-latn');
    expect(canonicalLocale('es-mx')).toBe('es-MX');
  });

  it('an invalid locale is null', () => {
    expect(canonicalLocale('not a locale')).toBeNull();
    expect(canonicalLocale('')).toBeNull();
  });
});

/** Un objeto tipo `Intl` cuyo `DateTimeFormat` resuelve a `resolved` (M9: nada del prototipo global). */
function fakeIntl(resolved: Partial<Intl.ResolvedDateTimeFormatOptions>, seen: unknown[] = []): typeof Intl {
  const DateTimeFormat = function (this: unknown, locales?: unknown, options?: unknown) {
    seen.push(options);
    return { resolvedOptions: () => resolved };
  };
  return { ...Intl, DateTimeFormat } as unknown as typeof Intl;
}

describe('browserLocale', () => {
  it('the Intl locale of the browser, canonical and without hc', () => {
    expect(browserLocale(fakeIntl({ locale: 'ja-jp' }))).toBe('ja-JP');
    expect(browserLocale(fakeIntl({ locale: 'en-US-u-hc-h23' }))).toBe('en-US');
  });

  it('null when the browser gives nothing usable', () => {
    expect(browserLocale(fakeIntl({}))).toBeNull();
    expect(browserLocale(fakeIntl({ locale: 'not a locale' }))).toBeNull();
  });
});

describe('browserHourCycle', () => {
  it('browserHourCycle maps h11/h12 to h12 and h23/h24 to h23, null when absent', () => {
    expect(browserHourCycle(fakeIntl({ hourCycle: 'h11' }))).toBe('h12');
    expect(browserHourCycle(fakeIntl({ hourCycle: 'h12' }))).toBe('h12');
    expect(browserHourCycle(fakeIntl({ hourCycle: 'h23' }))).toBe('h23');
    expect(browserHourCycle(fakeIntl({ hourCycle: 'h24' }))).toBe('h23');
    expect(browserHourCycle(fakeIntl({}))).toBeNull();
  });

  it('asks for the hour: without it resolvedOptions has no hourCycle', () => {
    const seen: unknown[] = [];
    browserHourCycle(fakeIntl({ hourCycle: 'h23' }, seen));
    expect(seen).toEqual([{ hour: 'numeric' }]);
  });
});
