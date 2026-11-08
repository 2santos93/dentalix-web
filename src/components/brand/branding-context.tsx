'use client';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { apiFetch } from '@/lib/api/client';
import { accentStyleSheet } from '@/lib/color/accent';
import type { BrandingStatus } from '@/lib/branding';
import { isPlatformHost, isRegistrationPath } from '@/lib/tenant';

/**
 * Marca de la clínica (nombre, logo y color) que el layout raíz ya pidió en el
 * servidor (`fetchBranding`): se reparte por contexto para que el shell no
 * vuelva a pedirla. Fuera del provider (tests, páginas sin tenant), vacía: el
 * shell cae a la marca de Dentalix.
 *
 * DX-019 / DX-517-ter:
 * - El servidor la pide por el host de la página (`brandingForRequest`) y dice
 *   si encontró clínica (`clinic`), si el host no tiene (`none`) o si no lo
 *   pudo saber (`unknown`: la API no contestó a tiempo). Solo con `unknown`
 *   la pide el navegador por el proxy; con `clinic` ya viene en el primer
 *   HTML (sin parpadeo) y con `none` no hay nada que pedir. Excepción: al
 *   salir del registro sin recargar (`none` porque la clínica aún no existía)
 *   se pide una vez. Donde no hay clínica tampoco se pide en `unknown` (sería
 *   un 404 en la consola): el host de la plataforma y el registro.
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

/**
 * DX-517-ter: ¿hay que pedir la marca desde el navegador? Solo si el servidor
 * no lo supo (`unknown`), o si dijo `none` en el registro y la pestaña acaba
 * de salir de él sin recargar (la clínica ya existe).
 */
export function useClientBrandingNeeded(status: BrandingStatus, pathname: string | null): boolean {
  const onRegistration = isRegistrationPath(pathname);
  const [leftRegistration, setLeftRegistration] = React.useState(false);
  const [sawRegistration, setSawRegistration] = React.useState(onRegistration);
  if (onRegistration && !sawRegistration) setSawRegistration(true);
  if (!onRegistration && sawRegistration && !leftRegistration) setLeftRegistration(true);
  if (onRegistration) return false;
  return status === 'unknown' || (status === 'none' && leftRegistration);
}

export function BrandingProvider({
  value,
  status,
  children,
}: {
  value: ClinicBranding;
  /** Lo que supo el servidor; sin él (tests), `clinic` si trae nombre y si no `unknown`. */
  status?: BrandingStatus;
  children: React.ReactNode;
}) {
  const [fetched, setFetched] = React.useState<ClinicBranding | null>(null);
  const [override, setOverride] = React.useState<ClinicBranding | null>(null);
  const serverStatus: BrandingStatus = status ?? (value.name !== null ? 'clinic' : 'unknown');
  const serverKnows = serverStatus === 'clinic';
  const needed = useClientBrandingNeeded(serverStatus, usePathname());

  React.useEffect(() => {
    if (!needed || isPlatformHost(window.location.host)) return;
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
  }, [needed]);

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
