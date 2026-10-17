import { AlertTriangle } from 'lucide-react';
import type { OverdueBalance } from '@/lib/collections/collections-api';
import { overdueChipText } from '@/lib/collections/presentation';
import { cn } from '@/lib/utils';

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
    <span
      data-testid="overdue-chip"
      title={text}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-warning tabular-nums',
        // Sobre el color del tipo de cita, un fondo de superficie para que el
        // texto mantenga el contraste en claro y en oscuro.
        compact ? 'border border-warning/40 bg-surface' : 'bg-warning/15',
        className,
      )}
    >
      {compact ? null : <AlertTriangle aria-hidden className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}
