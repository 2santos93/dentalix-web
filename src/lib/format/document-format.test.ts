import { documentFormat, documentTexts, NO_DOCUMENT_FORMAT } from './document-format';
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

describe('documentTexts', () => {
  it('sede h12 en-US: hora de 12 h, fecha mm/dd/yyyy e importe con código', () => {
    const t = documentTexts(documentFormat(NEW_YORK));
    expect(t.dateTime('2027-05-03T19:05:00.000Z')).toBe('05/03/2027 3:05 p. m.');
    expect(t.date('2027-05-03T19:05:00.000Z')).toBe('05/03/2027');
    expect(t.time('2027-05-03T19:05:00.000Z')).toBe('3:05 p. m.');
    expect(t.civilDate('2027-05-03')).toBe('05/03/2027');
    expect(t.amount(1234.5, 'USD')).toBe('USD\u00a01,234.50');
  });

  it('sede h23 de-DE: 24 h, dd.mm.yyyy e importe con código', () => {
    const t = documentTexts(documentFormat({ locale: 'de-DE', hourCycle: 'h23', timeZone: 'Europe/Berlin' }));
    expect(t.dateTime('2027-05-03T19:05:00.000Z')).toBe('03.05.2027 21:05');
    expect(t.amount(1234.5, 'EUR')).toBe('1.234,50\u00a0EUR');
  });

  it('sin formato todo sale «—», también lo que falta o está mal formado', () => {
    const none = documentTexts(null);
    expect(none.amount(1, 'USD')).toBe('—');
    expect(none.civilDate('2027-05-03')).toBe('—');
    expect(none.dateTime('2027-05-03T19:05:00.000Z')).toBe('—');
    const t = documentTexts(documentFormat(NEW_YORK));
    expect(t.dateTime(null)).toBe('—');
    expect(t.dateTime('no es una fecha')).toBe('—');
    expect(t.civilDate('2027-13-45')).toBe('—');
  });
});
