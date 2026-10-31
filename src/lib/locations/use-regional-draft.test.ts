import { act, renderHook } from '@testing-library/react';
import { clinicLocation } from '@/lib/test/locations';
import type { BrowserRegional } from './country-regional';
import { useRegionalDraft } from './use-regional-draft';

const caracasEnUs: BrowserRegional = {
  timeZone: 'America/Caracas',
  locale: 'en-US',
  hourCycle: 'h12',
  languages: ['en-US'],
};

describe('useRegionalDraft (R1)', () => {
  it('create: country from the browser zone, currency/format/clock from that country, all marked', () => {
    const { result } = renderHook(() => useRegionalDraft(null, () => caracasEnUs));
    expect(result.current.values).toEqual({
      country: 'VE',
      currency: 'VES',
      timeZone: 'America/Caracas',
      locale: 'es-VE',
      hourCycle: 'h12',
    });
    expect(result.current.sources).toEqual({
      country: 'browser',
      currency: 'country',
      timeZone: 'browser',
      locale: 'country',
      hourCycle: 'browser',
    });
    expect(result.current.proposals).toEqual({});
  });

  it('create: a browser en-US in Madrid gives Spain, EUR, Madrid and es-ES (not US + Madrid + en-US)', () => {
    const { result } = renderHook(() =>
      useRegionalDraft(null, () => ({ timeZone: 'Europe/Madrid', locale: 'en-US', hourCycle: 'h12', languages: ['en-US'] })),
    );
    expect(result.current.values).toEqual({
      country: 'ES',
      currency: 'EUR',
      timeZone: 'Europe/Madrid',
      locale: 'es-ES',
      hourCycle: 'h23',
    });
  });

  it('create: changing the country re-suggests the untouched fields and keeps the touched ones', () => {
    const { result } = renderHook(() => useRegionalDraft(null, () => caracasEnUs));
    act(() => result.current.change('currency', 'USD'));
    act(() => result.current.change('country', 'MX'));
    expect(result.current.values.currency).toBe('USD');
    expect(result.current.values.locale).toBe('es-MX');
    expect(result.current.sources.locale).toBe('country');
    expect(result.current.sources.currency).toBeUndefined();
    // Varias zonas y la del navegador no es de México: se queda la que había y no se inventa otra.
    expect(result.current.values.timeZone).toBe('America/Caracas');
    // Lo tocado no se cambia: el país lo ofrece.
    expect(result.current.proposals.currency).toBe('MXN');
    act(() => result.current.accept('currency'));
    expect(result.current.values.currency).toBe('MXN');
    expect(result.current.proposals.currency).toBeUndefined();
  });

  it('create without any browser hint leaves everything empty', () => {
    const { result } = renderHook(() =>
      useRegionalDraft(null, () => ({ timeZone: null, locale: null, hourCycle: null, languages: [] })),
    );
    expect(result.current.values).toEqual({ country: '', currency: '', timeZone: '', locale: '', hourCycle: '' });
    act(() => result.current.change('country', 'VE'));
    expect(result.current.values).toEqual({
      country: 'VE',
      currency: 'VES',
      timeZone: 'America/Caracas',
      locale: 'es-VE',
      hourCycle: 'h12',
    });
  });

  it('edit: shows what is stored, suggests nothing and never changes a stored value on its own', () => {
    const stored = clinicLocation({ country: 'CO', currency: 'COP', timeZone: 'America/Bogota', locale: 'es-CO', hourCycle: 'h12' });
    const { result } = renderHook(() => useRegionalDraft(stored, () => caracasEnUs));
    expect(result.current.values).toEqual({
      country: 'CO',
      currency: 'COP',
      timeZone: 'America/Bogota',
      locale: 'es-CO',
      hourCycle: 'h12',
    });
    expect(result.current.sources).toEqual({});
    act(() => result.current.change('country', 'VE'));
    expect(result.current.values.currency).toBe('COP');
    expect(result.current.values.timeZone).toBe('America/Bogota');
    expect(result.current.proposals).toEqual({ currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE' });
  });

  it('edit of an unconfigured location fills only the empty fields, from its country', () => {
    const stored = clinicLocation({ country: 'VE', currency: null, timeZone: 'America/Caracas', locale: null, hourCycle: 'h23' });
    const { result } = renderHook(() =>
      useRegionalDraft(stored, () => ({ timeZone: 'Europe/Madrid', locale: 'es-ES', hourCycle: 'h23', languages: ['es-ES'] })),
    );
    expect(result.current.values).toEqual({
      country: 'VE',
      currency: 'VES',
      timeZone: 'America/Caracas',
      locale: 'es-VE',
      hourCycle: 'h23',
    });
    expect(result.current.sources).toEqual({ currency: 'country', locale: 'country' });
  });
});
