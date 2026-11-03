import { AlertTriangle } from 'lucide-react';
import type { OverdueBalance } from '@/lib/collections/collections-api';
import { incompleteBalanceChipText, overdueChipText } from '@/lib/collections/presentation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * Chip «Saldo vencido · N días» (DX-150) de la tarjeta de la cita y de la
 * cabecera de la ficha. La API ya decide qué ve cada rol: ADMIN y RECEPTION
 * reciben el importe; DENTIST y ASSISTANT, solo la marca y los días. Sin saldo
 * vencido no pinta nada.
 */
export function OverdueChip({
  balance,
  className,
  compact = false,
}: {
  balance: OverdueBalance | null | undefined;
  className?: string;
  /** En la tarjeta de la agenda: una línea, sin icono. */
  compact?: boolean;
}) {
  const text = overdueChipText(balance);
  if (!text) return null;
  return (
    // «Vencido» es danger en todo el producto (DESIGN.md → Status tones).
    <Badge variant="danger" data-testid="overdue-chip" title={text} className={cn('tabular-nums', className)}>
      {compact ? null : <AlertTriangle aria-hidden className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{text}</span>
    </Badge>
  );
}

/**
 * DX-472-bis: sin saldo vencido, pero el saldo no cuenta algún abono en otra
 * moneda (sin tasa todavía): en la ficha, un aviso en tono de advertencia en
 * lugar de nada. El detalle está en el estado de cuenta.
 */
export function IncompleteBalanceChip({ balance }: { balance: OverdueBalance | null | undefined }) {
  const text = incompleteBalanceChipText(balance);
  if (!text) return null;
  return (
    <Badge variant="warning" data-testid="incomplete-balance-chip">
      {text}
    </Badge>
  );
}
