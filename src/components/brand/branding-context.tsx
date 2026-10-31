'use client';
import * as React from 'react';

/**
 * Marca de la clínica (nombre y logo) que el layout raíz ya pidió en el
 * servidor (`fetchBranding`): se reparte por contexto para que el shell no
 * vuelva a pedirla. Fuera del provider (tests, páginas sin tenant), vacía: el
 * shell cae a la marca de Dentalix.
 */
export interface ClinicBranding {
  name: string | null;
  logoUrl: string | null;
}

const BrandingContext = React.createContext<ClinicBranding>({ name: null, logoUrl: null });

export function BrandingProvider({
  value,
  children,
}: {
  value: ClinicBranding;
  children: React.ReactNode;
}) {
  const memo = React.useMemo(() => value, [value.name, value.logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  return <BrandingContext.Provider value={memo}>{children}</BrandingContext.Provider>;
}

export function useClinicBranding(): ClinicBranding {
  return React.useContext(BrandingContext);
}
