'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ClinicLocation } from './locations-api';
import {
  browserHourCycle,
  browserLocale,
  browserTimeZone,
  type RegionalSettingsField,
  type RegionalSettingsValues,
} from './regional-settings';
import type { HourCycle } from '@/lib/format/regional-format';
import { countryProposal, guessCountry, localeHourCycle, type BrowserRegional, type CountryProposal } from './country-regional';

/** De dónde sale un valor que nadie ha tocado todavía: el navegador, el país o el formato regional (el reloj). */
export type RegionalSource = 'browser' | 'country' | 'format';

/** Campos que sigue el país: moneda, zona, formato y reloj. */
export type CountryField = Exclude<RegionalSettingsField, 'country'>;
const COUNTRY_FIELDS: readonly CountryField[] = ['currency', 'timeZone', 'locale', 'hourCycle'];

export interface RegionalDraft {
  values: RegionalSettingsValues;
  /** Campos que llevan una sugerencia sin tocar, y de dónde sale (para la marca «Sugerido por …»). */
  sources: Partial<Record<RegionalSettingsField, RegionalSource>>;
  /**
   * Lo que propone el país elegido para un campo que NO lo sigue (ya guardado
   * o tocado) y no coincide: la pantalla lo ofrece con «Usar …», nunca lo
   * aplica sola.
   */
  proposals: Partial<Record<CountryField, string>>;
  change: <F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) => void;
  /** Aplica la propuesta del país a ese campo. */
  accept: (field: CountryField) => void;
  /** Reescribe valores sin marcarlos como tocados (la forma canónica al enviar). */
  normalize: (patch: Partial<RegionalSettingsValues>) => void;
}

export function readBrowserRegional(): BrowserRegional {
  const languages =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? [...navigator.languages]
        : navigator.language
          ? [navigator.language]
          : [];
  return { timeZone: browserTimeZone(), locale: browserLocale(), hourCycle: browserHourCycle(), languages };
}

const EMPTY: RegionalSettingsValues = { country: '', currency: '', timeZone: '', locale: '', hourCycle: '' };

function storedValues(location: ClinicLocation | null): RegionalSettingsValues {
  if (!location) return EMPTY;
  return {
    country: location.country || '',
    currency: location.currency ?? '',
    timeZone: location.timeZone ?? '',
    locale: location.locale ?? '',
    hourCycle: location.hourCycle ?? '',
  };
}

interface State {
  values: RegionalSettingsValues;
  sources: Partial<Record<RegionalSettingsField, RegionalSource>>;
  /** Campos que siguen al país (sin valor guardado y sin tocar). */
  following: ReadonlySet<CountryField>;
  /** País al abrir (o al llegar la sugerencia del navegador): las propuestas solo salen si cambia. */
  openedCountry: string;
  /** Lo que dijo el navegador al montar (`null` hasta entonces). */
  browser: BrowserRegional | null;
}

/**
 * Estado de los campos regionales de una sede en un formulario (alta,
 * edición y registro), con las sugerencias que pidió el dueño:
 *
 * - Alta y registro: zona del navegador; país de esa zona (o de la región
 *   del idioma); moneda del país; formato y reloj del navegador si son de ese
 *   país, si no los del país (`countryProposal`). Todo a la vista y editable.
 * - Al cambiar el país, cada campo que nadie ha tocado y que no tenía valor
 *   guardado toma lo que propone el país nuevo; los demás no cambian, y si el
 *   país propone otra cosa queda en `proposals` para ofrecerla.
 * - Edición: se pintan los valores guardados; solo un campo vacío (sede sin
 *   configurar) recibe sugerencia. Nada guardado se cambia sin que se elija.
 *
 * El navegador se lee tras montar (el registro también se pinta en el
 * servidor, que no conoce la zona ni el idioma del navegador). `browser` se
 * inyecta en los tests.
 */
export function useRegionalDraft(
  location: ClinicLocation | null,
  browser: () => BrowserRegional = readBrowserRegional,
): RegionalDraft {
  const [state, setState] = useState<State>(() => ({
    values: storedValues(location),
    sources: {},
    following: new Set(COUNTRY_FIELDS.filter((f) => !storedValues(location)[f])),
    openedCountry: storedValues(location).country,
    browser: null,
  }));

  useEffect(() => {
    function read() {
      const info = browser();
      setState((prev) => {
        const values = { ...prev.values };
        const sources = { ...prev.sources };
        if (!values.country) {
          const guessed = guessCountry(info);
          if (guessed) {
            values.country = guessed;
            sources.country = 'browser';
          }
        }
        const proposal: CountryProposal | null = values.country ? countryProposal(values.country, info) : null;
        const browserValues: Partial<Record<CountryField, string | null>> = {
          timeZone: info.timeZone,
          locale: info.locale,
          hourCycle: info.hourCycle,
        };
        for (const field of COUNTRY_FIELDS) {
          if (!prev.following.has(field) || values[field]) continue;
          // Con país, manda lo que propone (ya coherente con el navegador); sin
          // país, la zona, el formato y el reloj del navegador.
          const fromBrowser = browserValues[field] ?? null;
          // El reloj de una sede con formato guardado va con ese formato, no con el del país.
          const clockOfStoredFormat =
            field === 'hourCycle' && !prev.following.has('locale') ? clockFor(values.locale, info) : undefined;
          if (clockOfStoredFormat !== undefined) {
            if (!clockOfStoredFormat) continue;
            values.hourCycle = clockOfStoredFormat;
            sources.hourCycle = clockOfStoredFormat === fromBrowser && info.locale === values.locale ? 'browser' : 'format';
            continue;
          }
          const fromCountry = proposal?.[field] ?? null;
          const value = fromCountry ?? fromBrowser;
          if (!value) continue;
          (values as Record<string, string>)[field] = value;
          sources[field] = fromCountry && (field === 'currency' || fromCountry !== fromBrowser) ? 'country' : 'browser';
        }
        return { ...prev, values, sources, openedCountry: values.country, browser: info };
      });
    }
    read();
    // Solo al montar: el padre monta el formulario con una `key` por apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = useCallback(<F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) => {
    setState((prev) => {
      const values = { ...prev.values, [field]: value };
      const sources = { ...prev.sources };
      delete sources[field];
      const following = new Set(prev.following);
      if (field !== 'country') {
        following.delete(field as CountryField);
        return { ...prev, values, sources, following };
      }
      if (value) {
        const proposal = countryProposal(value as string, prev.browser ?? emptyBrowser());
        for (const f of COUNTRY_FIELDS) {
          if (!following.has(f)) continue;
          const next = proposal[f];
          if (next) {
            (values as Record<string, string>)[f] = next;
            sources[f] = 'country';
          }
        }
      }
      return { ...prev, values, sources, following };
    });
  }, []);

  const proposal =
    state.values.country && state.values.country !== state.openedCountry
      ? countryProposal(state.values.country, state.browser ?? emptyBrowser())
      : null;
  const proposals: Partial<Record<CountryField, string>> = {};
  if (proposal) {
    for (const field of COUNTRY_FIELDS) {
      const next = proposal[field];
      if (next && !state.following.has(field) && next !== state.values[field]) proposals[field] = next;
    }
  }

  const accept = useCallback(
    (field: CountryField) => {
      const next = proposals[field];
      if (next) change(field, next as RegionalSettingsValues[typeof field]);
    },
    // `proposals` se recalcula en cada render; basta con el valor de este campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [change, proposals.currency, proposals.timeZone, proposals.locale, proposals.hourCycle],
  );

  const normalize = useCallback((patch: Partial<RegionalSettingsValues>) => {
    setState((prev) => ({ ...prev, values: { ...prev.values, ...patch } }));
  }, []);

  return { values: state.values, sources: state.sources, proposals, change, accept, normalize };
}

/** Reloj para un formato: el del navegador si es su mismo formato; si no, el propio del formato. */
function clockFor(locale: string, browser: BrowserRegional): HourCycle | null {
  if (!locale) return browser.hourCycle;
  if (browser.locale === locale && browser.hourCycle) return browser.hourCycle;
  return localeHourCycle(locale);
}

function emptyBrowser(): BrowserRegional {
  return { timeZone: null, locale: null, hourCycle: null, languages: [] };
}
