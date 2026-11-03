import { documentFormat, NO_DOCUMENT_FORMAT } from './document-format';
import { NO_SEDE_FORMAT } from './sede-number';

const NEW_YORK = { locale: 'en-US', hourCycle: 'h12', timeZone: 'America/New_York' } as const;
/** 15:05 en Nueva York (EDT, UTC−4). */
const ISSUED_AT = new Date('2027-05-03T19:05:00.000Z');

describe('documentFormat', () => {
  it('con el formato completo devuelve fmt y la zona de la sede', () => {
    const format = documentFormat(NEW_YORK);
    expect(format).not.toBeNull();
    expect(format!.timeZone).toBe('America/New_York');
    expect(format!.fmt.dateTime(ISSUED_AT, format!.timeZone)).toBe('05/03/2027 3:05 p. m.');
  });

  it('una sede de 24 h y otro locale da su propio orden y reloj', () => {
    const format = documentFormat({ locale: 'de-DE', hourCycle: 'h23', timeZone: 'Europe/Berlin' })!;
    expect(format.fmt.dateTime(ISSUED_AT, format.timeZone)).toBe('03.05.2027 21:05');
  });

  it('null sin reloj, sin locale o sin zona', () => {
    expect(documentFormat({ ...NEW_YORK, hourCycle: null })).toBeNull();
    expect(documentFormat({ ...NEW_YORK, locale: null })).toBeNull();
    expect(documentFormat({ ...NEW_YORK, timeZone: null })).toBeNull();
    expect(documentFormat(null)).toBeNull();
    expect(documentFormat(undefined)).toBeNull();
  });

  it('null con una zona o un locale que el navegador no acepta (RangeError)', () => {
    expect(documentFormat({ ...NEW_YORK, timeZone: 'Not/AZone' })).toBeNull();
    expect(documentFormat({ ...NEW_YORK, locale: 'no es un locale' })).toBeNull();
  });

  it('lo que se pinta sin formato es «—»', () => {
    expect(NO_DOCUMENT_FORMAT).toBe(NO_SEDE_FORMAT);
  });
});
