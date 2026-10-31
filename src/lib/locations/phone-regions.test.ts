import {
  PHONE_REGIONS,
  isPhoneRegion,
  phoneRegionLabel,
  searchPhoneRegions,
} from './phone-regions';
import shared from './phone-regions-list.json';

describe('phone regions (DX-329, spec §6.2)', () => {
  it('the list has every region of the shared copy, sorted by Spanish name', () => {
    expect(PHONE_REGIONS).toHaveLength(245);
    expect(PHONE_REGIONS).toHaveLength(shared.length);
    expect(new Set(PHONE_REGIONS.map((r) => r.code))).toEqual(new Set(shared.map((r) => r.code)));
    const names = PHONE_REGIONS.map((r) => r.name);
    expect(names).toEqual([...names].sort(new Intl.Collator('es').compare));
    expect(PHONE_REGIONS.find((r) => r.code === 'VE')).toEqual({
      code: 'VE',
      name: 'Venezuela',
      callingCode: '58',
    });
    for (const { code } of shared) expect([code, isPhoneRegion(code)]).toEqual([code, true]);
    expect(isPhoneRegion('ZZ')).toBe(false);
    expect(isPhoneRegion('ve')).toBe(false);
    // Países ISO sin metadatos de teléfono: no son regiones de numeración.
    expect(isPhoneRegion('AQ')).toBe(false);
  });

  it('phoneRegionLabel gives the name and the calling code', () => {
    expect(phoneRegionLabel('VE')).toBe('Venezuela (+58)');
    expect(phoneRegionLabel('AC')).toBe('Isla de la Ascensión (+247)');
    expect(phoneRegionLabel('ZZ')).toBe('ZZ');
    expect(phoneRegionLabel(null)).toBeNull();
  });

  it('phoneRegionLabel is safe with constructor, toString and __proto__', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(phoneRegionLabel(key)).toBe(key);
      expect(isPhoneRegion(key)).toBe(false);
    }
  });

  it('searching by calling code with or without + lists every region that shares it', () => {
    const plusOne = searchPhoneRegions('+1');
    expect(plusOne).toHaveLength(25);
    expect(plusOne.every((r) => r.callingCode === '1')).toBe(true);
    expect(plusOne.map((r) => r.code)).toEqual(expect.arrayContaining(['US', 'CA', 'PR', 'DO']));
    const names = plusOne.map((r) => r.name);
    expect(names).toEqual([...names].sort(new Intl.Collator('es').compare));
    expect(searchPhoneRegions('1')).toEqual(plusOne);
    expect(searchPhoneRegions('58').map((r) => r.code)).toEqual(['VE']);
    expect(searchPhoneRegions(' +58 ').map((r) => r.code)).toEqual(['VE']);
    expect(searchPhoneRegions('+9999')).toEqual([]);
  });

  it('a partial calling code narrows the list while typing, (DX-329 M6)', () => {
    const plusFive = searchPhoneRegions('+5');
    expect(plusFive.length).toBeGreaterThan(10);
    expect(plusFive.every((r) => r.callingCode.startsWith('5'))).toBe(true);
    expect(plusFive.map((r) => r.callingCode)).toEqual(expect.arrayContaining(['51', '52', '54', '56', '58']));
    expect(PHONE_REGIONS.filter((r) => r.callingCode.startsWith('5'))).toHaveLength(plusFive.length);
    expect(searchPhoneRegions('5')).toEqual(plusFive);

    // Ningún indicativo empieza por otro: el completo da solo los suyos.
    const codes = new Set(PHONE_REGIONS.map((r) => r.callingCode));
    for (const code of codes) {
      expect(searchPhoneRegions(`+${code}`).every((r) => r.callingCode === code)).toBe(true);
    }
  });

  it('spaces inside a calling code do not stop it from matching', () => {
    const plusFiftyEight = searchPhoneRegions('+58');
    expect(searchPhoneRegions('+ 58')).toEqual(plusFiftyEight);
    expect(searchPhoneRegions(' + 5 8 ')).toEqual(plusFiftyEight);
    expect(searchPhoneRegions('+ 5')).toEqual(searchPhoneRegions('+5'));
  });

  it('searching ignores accents and case and the exact code comes first', () => {
    expect(searchPhoneRegions('ASCENSION').map((r) => r.code)).toEqual(['AC']);
    expect(searchPhoneRegions('venezuela').map((r) => r.code)).toEqual(['VE']);
    expect(searchPhoneRegions('ve')[0].code).toBe('VE');
    const de = searchPhoneRegions('de').map((r) => r.code);
    expect(de[0]).toBe('DE');
    expect(de.length).toBeGreaterThan(1);
    expect(searchPhoneRegions('')).toEqual(PHONE_REGIONS);
    expect(searchPhoneRegions('xyzxyz')).toEqual([]);
  });
});
