import { Wallet } from 'lucide-react';
import { orthoOverdueChipText, type OrthoBalanceFlag } from '@/lib/ortho/ortho-overdue';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * «Ortodoncia: saldo vencido · N días» (DX-285) en la tarjeta de la cita y en
 * «En clínica»: un cargo de ortodoncia realizado y sin pagar de hace más de
 * los días del ajuste de la clínica. Sin importe. Sin marca no pinta nada.
 */
export function OrthoOverdueChip({
  flag,
  className,
  compact = false,
}: {
  flag: OrthoBalanceFlag | null | undefined;
  className?: string;
  /** En la tarjeta de la agenda: una línea, sin icono. */
  compact?: boolean;
}) {
  const text = orthoOverdueChipText(flag);
  if (!text) return null;
  return (
    // «Vencido» es danger en todo el producto (DESIGN.md → Status tones).
    <Badge variant="danger" data-testid="ortho-overdue-chip" title={text} className={cn('tabular-nums', className)}>
      {compact ? null : <Wallet aria-hidden className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{text}</span>
    </Badge>
  );
}
