'use client';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api/client';
import { readCurrencyTexts, type CurrencyTexts } from '@/lib/format/currency-text';
import {
  cachedClinicCurrencyTexts,
  clinicCurrencyTexts,
  sameCurrencyTexts,
  setClinicCurrencyTexts,
} from '@/lib/format/clinic-currency-texts';

/**
 * DX-517: fija el texto propio de cada moneda de la clínica ANTES de pintar
 * los hijos, así que el primer importe ya sale con él.
 *
 * - `value` (la marca que el layout raíz pidió en el servidor): se fija tal cual.
 * - `null` (el servidor no supo la clínica: dominio propio, `*.localhost`, o
 *   la marca falló): se pinta con la última copia de la pestaña y se pide la
 *   marca desde el navegador (el proxy resuelve la clínica por el host). Si
 *   trae otro mapa, se fija y el árbol se vuelve a montar UNA vez, para que
 *   todos los importes lo usen (pasa en la primera visita de la pestaña o
 *   tras un cambio; nunca en el caso normal).
 */
export function CurrencyTextsSync({ value, children }: { value: CurrencyTexts | null; children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const [fetched, setFetched] = useState<CurrencyTexts | null>(null);
  setClinicCurrencyTexts(value ?? fetched ?? cachedClinicCurrencyTexts());

  useEffect(() => {
    if (value) return;
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
  }, [value]);

  return <Fragment key={generation}>{children}</Fragment>;
}
