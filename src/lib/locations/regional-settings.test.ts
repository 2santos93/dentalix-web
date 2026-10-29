import { browserCountry, browserHourCycle, browserLocale, canonicalLocale, canonicalTimeZone } from './regional-settings';

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

  it('a zone this browser accepts but the shared list lacks is null (spec §7: newer tzdata)', () => {
    // La lista compartida con la API manda: una zona que el navegador ya conoce
    // y la lista todavía no, no se ofrece ni se envía.
    jest.isolateModules(() => {
      jest.doMock('./iana-zone-names.json', () => ['Asia/Tokyo']);
      const isolated = jest.requireActual<typeof import('./regional-settings')>('./regional-settings');
      const { isUsableTimeZone } = jest.requireActual<typeof import('./location-settings')>('./location-settings');
      expect(isUsableTimeZone('Europe/Paris')).toBe(true);
      expect(isolated.canonicalTimeZone('Europe/Paris')).toBeNull();
      expect(isolated.canonicalTimeZone('asia/tokyo')).toBe('Asia/Tokyo');
    });
    jest.dontMock('./iana-zone-names.json');
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

describe('browserCountry (DX-312 R11, P1)', () => {
  it('the browser region is suggested only when a language tag has an explicit region', () => {
    const maximize = jest.spyOn(Intl.Locale.prototype, 'maximize');
    // Solo la región escrita: nunca deducida del idioma.
    expect(browserCountry(['es'])).toBeNull();
    expect(browserCountry(['es-419'])).toBeNull();
    expect(browserCountry([])).toBeNull();
    expect(browserCountry(['es-VE', 'en-US'])).toBe('VE');
    expect(browserCountry(['es', 'es-ve'])).toBe('VE');
    expect(browserCountry(['es-Latn-VE'])).toBe('VE');
    // Una región que no está en la lista de países no se sugiere.
    expect(browserCountry(['xx-ZZ'])).toBeNull();
    expect(browserCountry(['not a tag', 'es-VE'])).toBe('VE');
    expect(maximize).not.toHaveBeenCalled();
    maximize.mockRestore();
  });

  it('without an argument it reads navigator.languages', () => {
    const languages = jest.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-VE']);
    expect(browserCountry()).toBe('VE');
    languages.mockReturnValue(['es']);
    expect(browserCountry()).toBeNull();
    languages.mockRestore();
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
