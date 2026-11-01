'use client';
import * as React from 'react';
import { apiFetch } from '@/lib/api/client';
import { accentStyleSheet } from '@/lib/color/accent';

/**
 * Marca de la clínica (nombre, logo y color) que el layout raíz ya pidió en el
 * servidor (`fetchBranding`): se reparte por contexto para que el shell no
 * vuelva a pedirla. Fuera del provider (tests, páginas sin tenant), vacía: el
 * shell cae a la marca de Dentalix.
 *
 * DX-019:
 * - Si el servidor no supo la clínica (`*.localhost`, un dominio propio que
 *   el servidor no resuelve, o la marca falló), el navegador la pide por el
 *   proxy, que sí resuelve la clínica por el host. Así el login y la app
 *   enseñan su logo y su color también ahí.
 * - Ajustes › Datos de la clínica la cambia al guardar (`useSetClinicBranding`):
 *   el color, el logo y el nombre se ven al instante, sin recargar.
 */
export interface ClinicBranding {
  name: string | null;
  logoUrl: string | null;
  /** `#RRGGBB` de la clínica, o `null` (los tokens de fábrica). */
  primaryColor?: string | null;
}

const EMPTY: ClinicBranding = { name: null, logoUrl: null, primaryColor: null };

const BrandingContext = React.createContext<ClinicBranding>(EMPTY);
const SetBrandingContext = React.createContext<(next: ClinicBranding) => void>(() => {});

const HEX = /^#[0-9a-fA-F]{3,8}$/;

/** Solo URLs http(s): nada de `javascript:` ni `data:` en un `src`. */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function readBranding(data: Record<string, unknown>): ClinicBranding {
  return {
    name: typeof data.name === 'string' && data.name.trim() ? data.name : null,
    logoUrl: safeUrl(data.logoUrl),
    primaryColor: typeof data.primaryColor === 'string' && HEX.test(data.primaryColor) ? data.primaryColor : null,
  };
}

export function BrandingProvider({ value, children }: { value: ClinicBranding; children: React.ReactNode }) {
  const [fetched, setFetched] = React.useState<ClinicBranding | null>(null);
  const [override, setOverride] = React.useState<ClinicBranding | null>(null);
  const serverKnows = value.name !== null;

  React.useEffect(() => {
    if (serverKnows) return;
    let cancelled = false;
    apiFetch<Record<string, unknown>>('/public/tenant/branding')
      .then((data) => {
        if (!cancelled) setFetched(readBranding(data));
      })
      .catch(() => {
        // Sin clínica en este host (el apex) o la API no responde: la de Dentalix.
      });
    return () => {
      cancelled = true;
    };
  }, [serverKnows]);

  const effective = override ?? (serverKnows ? value : (fetched ?? value));
  const memo = React.useMemo(
    () => effective,
    [effective.name, effective.logoUrl, effective.primaryColor], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // El acento que pintó el servidor ya está en <head>; solo hace falta otro
  // si el de ahora es distinto (lo pidió el navegador o se acaba de guardar).
  const color = memo.primaryColor ?? null;
  const css = color && color !== (value.primaryColor ?? null) ? accentStyleSheet(color) : null;

  return (
    <SetBrandingContext.Provider value={setOverride}>
      <BrandingContext.Provider value={memo}>
        {css ? (
          // Va después del de <head>: con la misma especificidad e `!important`
          // en los dos, gana este (el orden del documento decide).
          <style data-testid="client-accent">{css}</style>
        ) : null}
        {children}
      </BrandingContext.Provider>
    </SetBrandingContext.Provider>
  );
}

export function useClinicBranding(): ClinicBranding {
  return React.useContext(BrandingContext);
}

/** DX-019: fija la marca de la pestaña (tras guardar en Ajustes). */
export function useSetClinicBranding(): (next: ClinicBranding) => void {
  return React.useContext(SetBrandingContext);
}
