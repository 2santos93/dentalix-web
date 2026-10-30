'use client';
import * as React from 'react';
import { I18nProvider } from 'react-aria-components';
import { normalizeDateLocale } from '@/lib/dates/iso';
import type { HourCycle } from '@/lib/format/regional-format';

/**
 * Cómo se escriben y se leen las fechas y horas en los campos: el locale de la
 * sede (orden de los segmentos dd/mm/aaaa, primer día de la semana), su reloj
 * de 12/24 h y su zona (qué día es «hoy»). Nunca el idioma del navegador: un
 * Chrome en inglés no puede convertir 04/05 en 5 de abril (DESIGN.md → Dates
 * and times).
 */
export interface DateLocale {
  locale: string;
  hourCycle?: HourCycle;
  timeZone?: string;
}

/** Sin proveedor: español, reloj del locale y zona del navegador. */
const FALLBACK: DateLocale = { locale: 'es' };

const DateLocaleContext = React.createContext<DateLocale>(FALLBACK);

export function useDateLocale(): DateLocale {
  return React.useContext(DateLocaleContext);
}

/**
 * Fija el locale de fechas para todo lo que cuelga de él (y el de
 * react-aria, por si otra primitiva suya lo lee). Cada campo de fecha vuelve a
 * envolverse con este mismo locale, así que fuera de un proveedor siguen en
 * español y no en el idioma del navegador.
 */
export function DateLocaleProvider({
  locale,
  hourCycle,
  timeZone,
  children,
}: {
  locale?: string | null;
  hourCycle?: HourCycle | null;
  timeZone?: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo<DateLocale>(
    () => ({
      locale: normalizeDateLocale(locale),
      ...(hourCycle ? { hourCycle } : {}),
      ...(timeZone ? { timeZone } : {}),
    }),
    [locale, hourCycle, timeZone],
  );
  return (
    <DateLocaleContext.Provider value={value}>
      <I18nProvider locale={value.locale}>{children}</I18nProvider>
    </DateLocaleContext.Provider>
  );
}

/** Envoltorio interno de cada campo: el locale del contexto, nunca el del navegador. */
export function DateI18n({ children }: { children: React.ReactNode }) {
  const { locale } = useDateLocale();
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
