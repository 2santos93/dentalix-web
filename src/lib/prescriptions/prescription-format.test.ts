import { prescriptionFormat } from './prescription-format';

const NEW_YORK = { locale: 'en-US', hourCycle: 'h12', timeZone: 'America/New_York' } as const;
/** 15:05 en Nueva York (EDT, UTC−4). */
const ISSUED_AT = new Date('2027-05-03T19:05:00.000Z');

describe('prescriptionFormat', () => {
  it('en-US h12 New York formats 05/03/2027 and a 12-hour time', () => {
    const format = prescriptionFormat(NEW_YORK);
    expect(format).not.toBeNull();
    expect(format!.timeZone).toBe('America/New_York');
    expect(format!.fmt.civilDate('2027-05-03')).toBe('05/03/2027');
    expect(format!.fmt.dateTime(ISSUED_AT, format!.timeZone)).toBe('05/03/2027 3:05 p. m.');
  });

  it('null locale, null hourCycle, null timeZone or an invalid locale → null', () => {
    expect(prescriptionFormat({ ...NEW_YORK, locale: null })).toBeNull();
    expect(prescriptionFormat({ ...NEW_YORK, hourCycle: null })).toBeNull();
    expect(prescriptionFormat({ ...NEW_YORK, timeZone: null })).toBeNull();
    expect(prescriptionFormat({ ...NEW_YORK, locale: 'no es un locale' })).toBeNull();
    expect(prescriptionFormat(null)).toBeNull();
  });

  it('invalid stored zone → null', () => {
    expect(prescriptionFormat({ ...NEW_YORK, timeZone: 'Not/AZone' })).toBeNull();
  });

  // Jest da al test una copia de `process.env` y el cambio de `TZ` puede no
  // llegar a ICU; la garantía real es que el helper siempre pasa la zona de la
  // sede a `Intl`. Se deja como regresión barata.
  it('does not depend on the process zone', () => {
    const before = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      const format = prescriptionFormat(NEW_YORK)!;
      expect(format.fmt.dateTime(ISSUED_AT, format.timeZone)).toBe('05/03/2027 3:05 p. m.');
      expect(format.fmt.civilDate('2027-05-03')).toBe('05/03/2027');
    } finally {
      process.env.TZ = before;
    }
  });
});
