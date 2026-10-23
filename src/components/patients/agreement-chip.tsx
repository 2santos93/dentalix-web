import { Handshake } from 'lucide-react';
import type { AgreementSummary } from '@/lib/patients/patients-api';
import { agreementChipText } from '@/lib/patients/agreement-presentation';
import { cn } from '@/lib/utils';

/**
 * Chip «Convenio: X» (DX-105) de la cabecera de la ficha, hermano de
 * `CoverageChip`. Informativo (`muted`): solo se pinta con un convenio vigente.
 */
export function AgreementChip({
  agreement,
  className,
}: {
  agreement: AgreementSummary | null | undefined;
  className?: string;
}) {
  const text = agreementChipText(agreement);
  if (!text) return null;
  return (
    <span
      data-testid="agreement-chip"
      title={text}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted',
        className,
      )}
    >
      <Handshake aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}
