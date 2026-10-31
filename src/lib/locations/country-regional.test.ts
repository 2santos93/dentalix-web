import ianaZoneNames from './iana-zone-names.json';
import data from './country-regional.json';
import { COUNTRIES } from './countries';
import {
  countryCurrency,
  countryCurrencyAlternatives,
  countryLocale,
  countryProposal,
  countryTimeZones,
  guessCountry,
  localeHourCycle,
  timeZoneCountry,
  timeZoneInCountry,
  type BrowserRegional,
} from './country-regional';
import { localeChoices, localeLabel, searchRegionalOptions, timeZoneChoices, timeZoneLabel } from './regional-options';

const browser = (over: Partial<BrowserRegional> = {}): BrowserRegional => ({
  timeZone: null,
  locale: null,
  hourCycle: null,
  languages: [],
  ...over,
});

describe('country-regional data', () => {
  it('covers every country of the list, with IANA zones from the shared list and ISO currency codes', () => {
    const iana = new Set(ianaZoneNames as string[]);
    expect(Object.keys(data.zones).sort()).toEqual(COUNTRIES.map((c) => c.code).sort());
    for (const zones of Object.values(data.zones)) for (const zone of zones) expect(iana.has(zone)).toBe(true);
    for (const code of Object.values(data.currencies)) expect(code).toMatch(/^[A-Z]{3}$/);
  });

  it('knows current currencies (no retired codes)', () => {
    // V1: en Venezuela se propone USD (en lo que trabajan sobre todo las
    // clínicas); el bolívar es la alternativa a un clic.
    expect(countryCurrency('VE')).toBe('USD');
    expect(countryCurrency('PA')).toBe('USD');
    expect(countryCurrency('HR')).toBe('EUR');
    expect(countryCurrency('BG')).toBe('EUR');
    expect(countryCurrency('EC')).toBe('USD');
    expect(countryCurrency('MX')).toBe('MXN');
    expect(countryCurrency('ES')).toBe('EUR');
    // Monedas de tres decimales: la API no las admite, no se propone ninguna.
    expect(countryCurrency('KW')).toBeNull();
    expect(Object.values(data.currencies)).not.toEqual(expect.arrayContaining(['VEF', 'HRK', 'BGN', 'MRO', 'STD', 'SLL', 'ZWL']));
  });

  it('offers other currencies in use only where the data says so (V1: VES in Venezuela)', () => {
    expect(countryCurrencyAlternatives('VE')).toEqual(['VES']);
    // El resto de países, como los dejó R1: sin alternativa.
    for (const country of ['PA', 'EC', 'CO', 'MX', 'ES', 'US']) expect(countryCurrencyAlternatives(country)).toEqual([]);
    expect(countryCurrencyAlternatives('ZZ')).toEqual([]);
    for (const [country, alternatives] of Object.entries(data.currencyAlternatives)) {
      expect(Object.keys(data.currencies)).toContain(country);
      for (const code of alternatives) {
        expect(code).toMatch(/^[A-Z]{3}$/);
        expect(code).not.toBe((data.currencies as Record<string, string>)[country]);
      }
    }
  });
});

describe('country ↔ zone', () => {
  it('maps a zone to its only country, also the legacy ICU names', () => {
    expect(timeZoneCountry('America/Caracas')).toBe('VE');
    expect(timeZoneCountry('Europe/Madrid')).toBe('ES');
    expect(timeZoneCountry('Asia/Calcutta')).toBe('IN');
    expect(timeZoneCountry('UTC')).toBeNull();
    // Compartida por dos países: no se adivina.
    expect(timeZoneCountry('Europe/Belgrade')).toBeNull();
  });

  it('lists the zones of a country', () => {
    expect(countryTimeZones('VE')).toEqual(['America/Caracas']);
    expect(countryTimeZones('US').length).toBeGreaterThan(5);
    expect(timeZoneInCountry('America/New_York', 'US')).toBe(true);
    expect(timeZoneInCountry('Europe/Madrid', 'US')).toBe(false);
  });
});

describe('guessCountry', () => {
  it('prefers the browser zone over the language region', () => {
    expect(guessCountry({ timeZone: 'Europe/Madrid', languages: ['en-US'] })).toBe('ES');
    expect(guessCountry({ timeZone: 'America/Caracas', languages: ['es-ES'] })).toBe('VE');
  });

  it('falls back to an explicit region of the main language', () => {
    expect(guessCountry({ timeZone: 'UTC', languages: ['es-VE'] })).toBe('VE');
    expect(guessCountry({ timeZone: null, languages: ['es'] })).toBeNull();
  });
});

describe('countryProposal', () => {
  it('Venezuela: USD, Caracas, es-VE and its 12 h clock, without any hard-coded rule', () => {
    expect(countryProposal('VE', browser({ languages: ['en-US'] }))).toEqual({
      currency: 'USD',
      timeZone: 'America/Caracas',
      locale: 'es-VE',
      hourCycle: localeHourCycle('es-VE'),
    });
  });

  it('keeps the browser zone and format when they belong to the country', () => {
    const p = countryProposal('ES', browser({ timeZone: 'Atlantic/Canary', locale: 'es-ES', hourCycle: 'h12' }));
    expect(p).toEqual({ currency: 'EUR', timeZone: 'Atlantic/Canary', locale: 'es-ES', hourCycle: 'h12' });
  });

  it('a browser en-US in Madrid proposes Spain, EUR and es-ES (never US + Madrid + en-US)', () => {
    const b = browser({ timeZone: 'Europe/Madrid', locale: 'en-US', hourCycle: 'h12', languages: ['en-US'] });
    const country = guessCountry(b);
    expect(country).toBe('ES');
    expect(countryProposal(country!, b)).toEqual({
      currency: 'EUR',
      timeZone: 'Europe/Madrid',
      locale: 'es-ES',
      hourCycle: 'h23',
    });
  });

  it('a country with several zones proposes none unless the browser is in one of them', () => {
    expect(countryProposal('US', browser({ timeZone: 'Europe/Madrid' })).timeZone).toBeNull();
    expect(countryProposal('US', browser({ timeZone: 'America/Chicago' })).timeZone).toBe('America/Chicago');
  });

  it('countryLocale uses a browser language when the main one has no format data', () => {
    expect(countryLocale('PY', ['es-ES'])).toBe('es-PY');
    expect(countryLocale('ZZ')).toBeNull();
  });
});

describe('regional options', () => {
  const at = new Date('2026-10-31T12:00:00Z');

  it('labels zones by offset, city and country', () => {
    expect(timeZoneLabel('America/Caracas', at)).toBe('(UTC−4) Caracas — Venezuela');
    expect(timeZoneLabel('America/Bogota', at)).toBe('(UTC−5) Bogotá — Colombia');
    expect(timeZoneLabel('America/Panama', at)).toBe('(UTC−5) Panamá');
    expect(timeZoneLabel('UTC', at)).toBe('UTC');
  });

  it('lists the zones of the country first and keeps a stored zone outside every country', () => {
    const choices = timeZoneChoices('VE', ['Etc/GMT+4'], at);
    expect(choices[0]).toEqual({ code: 'America/Caracas', name: '(UTC−4) Caracas — Venezuela' });
    expect(choices.some((c) => c.code === 'Etc/GMT+4')).toBe(true);
    expect(new Set(choices.map((c) => c.code)).size).toBe(choices.length);
  });

  it('labels a format with its name and how it writes numbers and dates', () => {
    expect(localeLabel('es-VE', at)).toBe('Español (Venezuela) — 12.345,67 · 31/10/2026');
    expect(localeLabel('en-US', at)).toBe('Inglés (Estados Unidos) — 12,345.67 · 10/31/2026');
  });

  it('offers the country format first, then the browser ones, then one per country', () => {
    const choices = localeChoices('VE', [''], ['en-US'], at);
    expect(choices[0].code).toBe('es-VE');
    expect(choices.map((c) => c.code)).toEqual(expect.arrayContaining(['en-VE', 'en-US', 'es-ES', 'pt-BR']));
  });

  it('search matches the city, the country, the offset and the exact code', () => {
    const zones = timeZoneChoices('', [], at);
    expect(searchRegionalOptions(zones, 'caracas')[0].code).toBe('America/Caracas');
    expect(searchRegionalOptions(zones, 'venezuela')[0].code).toBe('America/Caracas');
    expect(searchRegionalOptions(zones, 'America/Caracas')[0].code).toBe('America/Caracas');
    expect(searchRegionalOptions(zones, 'bogota')[0].code).toBe('America/Bogota');
    expect(searchRegionalOptions(zones, 'UTC−4').map((o) => o.code)).toContain('America/Caracas');
    const locales = localeChoices('', [], [], at);
    expect(searchRegionalOptions(locales, 'es-VE')[0].code).toBe('es-VE');
    expect(searchRegionalOptions(locales, 'venezuela').map((o) => o.code)).toContain('es-VE');
  });
});
