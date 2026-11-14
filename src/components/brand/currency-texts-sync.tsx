'use client';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api/client';
import { NO_CURRENCY_TEXTS, readCurrencyTexts, type CurrencyTexts } from '@/lib/format/currency-text';
import {
  cachedClinicCurrencyTexts,
  clinicCurrencyTexts,
  sameCurrencyTexts,
  setClinicCurrencyTexts,
} from '@/lib/format/clinic-currency-texts';
import { useClientBrandingNeeded } from '@/components/brand/branding-context';
import type { BrandingStatus } from '@/lib/branding';
import { isPlatformHost } from '@/lib/tenant';

/**
 * DX-517: fija el texto propio de cada moneda de la clínica ANTES de pintar
 * los hijos, así que el primer importe ya sale con él.
 *
 * DX-517-ter: el servidor dice qué supo (`status`):
 * - `clinic`: `value` (la marca del primer HTML) se fija tal cual. No se pide
 *   nada ni se vuelve a montar el árbol.
 * - `none`: el host no tiene clínica; sin textos y sin pedir nada. Al salir
 *   del registro sin recargar (la clínica ya existe) se pide una vez.
 * - `unknown` (la API no contestó a tiempo): se pinta con la última copia de
 *   la pestaña y se pide la marca desde el navegador. Si trae otro mapa, se
 *   fija y el árbol se vuelve a montar UNA vez, para que todos los importes
 *   lo usen. Es el único camino con remontaje, y es degradado.
 * Donde no hay clínica no se pide (sería un 404 en la consola): el host de la
 * plataforma y el registro.
 */
export function CurrencyTextsSync({
  value,
  status,
  children,
}: {
  value: CurrencyTexts | null;
  /** Lo que supo el servidor; sin él (tests), `clinic` si trae mapa y si no `unknown`. */
  status?: BrandingStatus;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [generation, setGeneration] = useState(0);
  const [fetched, setFetched] = useState<CurrencyTexts | null>(null);
  const serverStatus: BrandingStatus = status ?? (value ? 'clinic' : 'unknown');
  setClinicCurrencyTexts(
    value ?? fetched ?? (serverStatus === 'none' ? NO_CURRENCY_TEXTS : cachedClinicCurrencyTexts()),
  );

  const needed = useClientBrandingNeeded(serverStatus, pathname);

  useEffect(() => {
    if (!needed || isPlatformHost(window.location.host)) return;
    let cancelled = false;
    apiFetch<{ currencyTexts?: unknown }>('/public/tenant/branding')
      .then((branding) => {
        if (cancelled) return;
        const texts = readCurrencyTexts(branding.currencyTexts);
        const changed = !sameCurrencyTexts(texts, clinicCurrencyTexts());
        setClinicCurrencyTexts(texts);
        setFetched(texts);
        if (changed) setGeneration((g) => g + 1);
      })
      .catch(() => {
        // Sin clínica en este host o la API no responde: se queda lo que había.
      });
    return () => {
      cancelled = true;
    };
  }, [needed]);

  return <Fragment key={generation}>{children}</Fragment>;
}
