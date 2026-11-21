'use client';
import dynamic from 'next/dynamic';
import { useExchangeHeader } from './exchange-header-context';
import type { RateIndicatorVariant } from './rate-indicator';

// El indicador (y su Popover) es un trozo aparte: el shell lo baja solo cuando
// la clínica lo enseña. Una clínica de una sola moneda no paga ni un byte.
const RateIndicator = dynamic(() => import('./rate-indicator').then((m) => m.RateIndicator), { ssr: false });

/** DX-584: hueco del indicador de la tasa en el shell; vacío salvo con `visible` y alguna fila. */
export function RateIndicatorSlot({ token, variant }: { token: string | null; variant: RateIndicatorVariant }) {
  const state = useExchangeHeader();
  if (!token || state.status !== 'ready' || !state.header.visible || state.header.rates.length === 0) return null;
  return <RateIndicator token={token} variant={variant} />;
}
