import { Badge } from '@/components/ui/badge';

interface SplitPaymentInfo {
  /** Cuántas formas de pago tiene su cobro dividido; `null` en un abono suelto. */
  splitLines: number | null | undefined;
  /** Recibo único del cobro (o del abono); `null` si es anterior a la numeración. */
  receiptNumber: string | null | undefined;
}

/**
 * DX-414: «Cobro dividido · 3 formas · PRI-000007». Une a la vista las líneas de
 * un mismo cobro dividido aunque haya otros cobros entre ellas: comparten el
 * texto y, sobre todo, el número del recibo único. `null` en un abono suelto.
 */
export function splitPaymentLabel({ splitLines, receiptNumber }: SplitPaymentInfo): string | null {
  if (!splitLines || splitLines < 2) return null;
  return ['Cobro dividido', `${splitLines} formas`, receiptNumber].filter(Boolean).join(' · ');
}

export function SplitPaymentBadge(info: SplitPaymentInfo) {
  const label = splitPaymentLabel(info);
  if (!label) return null;
  return (
    <Badge variant="info" className="mt-1" data-testid="split-payment-badge">
      {label}
    </Badge>
  );
}
