'use client';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

// Copy como constantes (i18n-ready). Distinto de «sin tasa» (without-rate-notice):
// aquí no falta ninguna tasa, así que no se propone registrar una.
export const rateProviderCopy = {
  title: 'El proveedor de tasas no respondió, vuelve a intentarlo',
  retry: 'Reintentar',
  notCounted: (n: number) =>
    n === 1
      ? 'El saldo todavía no cuenta 1 abono en otra moneda.'
      : `El saldo todavía no cuenta ${n} abonos en otra moneda.`,
  incomplete: 'Las cifras con abonos en otra moneda están incompletas.',
  installments: 'Hasta completarlo, ninguna cuota se marca como vencida.',
  printed: 'Cifras incompletas: el proveedor de tasas no respondió y faltan abonos en otra moneda.',
};

/**
 * DX-472: el proveedor de tasas no respondió a tiempo. Las cifras que hay en
 * pantalla son correctas pero incompletas, y lo único que hace falta es volver
 * a pedirlas: tono de advertencia, `role="status"` y siempre con «Reintentar».
 */
export function RateProviderNotice({
  paymentsCount,
  onRetry,
  retrying = false,
}: {
  /** Abonos sin contar; sin él, un texto que no los cuenta. */
  paymentsCount?: number;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Callout
      tone="warning"
      role="status"
      icon={TriangleAlert}
      title={rateProviderCopy.title}
      action={
        <Button type="button" variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          {rateProviderCopy.retry}
        </Button>
      }
    >
      <p>{paymentsCount ? rateProviderCopy.notCounted(paymentsCount) : rateProviderCopy.incomplete}</p>
    </Callout>
  );
}
