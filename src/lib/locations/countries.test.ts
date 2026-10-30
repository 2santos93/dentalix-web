import { COUNTRIES, countryName, countrySearchKey, isCountryCode, searchCountries } from './countries';
import shared from './iso3166-countries.json';

describe('countries (DX-312, spec §6.2)', () => {
  it('the list has every country of the shared copy, sorted by Spanish name', () => {
    expect(COUNTRIES).toHaveLength(250);
    expect(new Set(COUNTRIES.map((c) => c.code))).toEqual(new Set(shared.map((c) => c.code)));
    const names = COUNTRIES.map((c) => c.name);
    expect(names.indexOf('Afganistán')).toBeLessThan(names.indexOf('Albania'));
    expect(names).toEqual([...names].sort(new Intl.Collator('es').compare));
    for (const { code } of shared) expect([code, isCountryCode(code)]).toEqual([code, true]);
    expect(isCountryCode('ZZ')).toBe(false);
    expect(isCountryCode('ve')).toBe(false);
  });

  it('countryName gives the Spanish name, the code when unknown and null for null', () => {
    expect(countryName('VE')).toBe('Venezuela');
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName(null)).toBeNull();
  });

  it('countryName is safe with constructor, toString and __proto__', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(countryName(key)).toBe(key);
      expect(isCountryCode(key)).toBe(false);
    }
  });

  it('searchCountries ignores accents and case', () => {
    expect(countrySearchKey('  Côte   d’Ivoire ')).toBe('cote d’ivoire');
    expect(searchCountries('cote').map((c) => c.code)).toContain('CI');
    expect(searchCountries('ESPANA').map((c) => c.code)).toEqual(['ES']);
  });

  it('the exact code comes first', () => {
    expect(searchCountries('ve')[0].code).toBe('VE');
    // El código manda aunque el nombre no lo contenga; detrás, los nombres que empiezan por la clave.
    const de = searchCountries('de').map((c) => c.code);
    expect(de[0]).toBe('DE');
    expect(de.length).toBeGreaterThan(1);
  });

  it('names that start with the query come before names that contain it', () => {
    const keys = searchCountries('ar').map((c) => countrySearchKey(c.name));
    const firstContains = keys.findIndex((k) => !k.startsWith('ar'));
    expect(firstContains).toBeGreaterThan(0);
    expect(keys.slice(firstContains).every((k) => !k.startsWith('ar') && k.includes('ar'))).toBe(true);
  });

  it('an empty query lists every country', () => {
    expect(searchCountries('')).toEqual(COUNTRIES);
    expect(searchCountries('   ')).toEqual(COUNTRIES);
    expect(searchCountries('xyzxyz')).toEqual([]);
  });
});
