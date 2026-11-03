'use client';
import { TriangleAlert } from 'lucide-react';
import { Callout } from '@/components/ui/callout';
import { RateProviderNotice } from './rate-provider-notice';
import { withoutRateCopy } from './without-rate-notice';

/**
 * DX-472-ter: el aviso de las cifras incompletas donde solo se sabe CUÁNTOS
 * abonos en otra moneda faltan por contar, no cuáles (cartera e Inicio). Los
 * mismos dos casos y textos que el estado de cuenta: el proveedor que no
 * respondió pide reintentar (`RateProviderNotice`); «sin tasa» dice qué falta,
 * sin acción aquí (la lista de abonos y qué hacer van en el estado de cuenta,
 * `WithoutRateNotice`). Cada pantalla puede cambiar el texto de debajo para
 * decir qué parte suya no los cuenta.
 */
export function RateCountNotice({
  paymentsCount,
  timedOut,
  onRetry,
  providerDetail,
  withoutRateBody = withoutRateCopy.body,
}: {
  /** Abonos sin contar; sin el campo (API anterior), 0. */
  paymentsCount: number | undefined;
  timedOut: boolean | undefined;
  onRetry: () => void;
  providerDetail?: string;
  withoutRateBody?: string;
}) {
  if (timedOut) {
    return <RateProviderNotice paymentsCount={paymentsCount} detail={providerDetail} onRetry={onRetry} />;
  }
  if (!paymentsCount) return null;
  return (
    <Callout tone="warning" role="status" icon={TriangleAlert} title={withoutRateCopy.title(paymentsCount)}>
      <p>{withoutRateBody}</p>
    </Callout>
  );
}
