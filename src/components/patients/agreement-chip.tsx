import { Handshake } from 'lucide-react';
import type { AgreementSummary } from '@/lib/patients/patients-api';
import { agreementChipText } from '@/lib/patients/agreement-presentation';
import { Badge } from '@/components/ui/badge';

/**
 * Chip «Convenio: X» (DX-105) de la cabecera de la ficha, hermano de
 * `CoverageChip`. Informativo (neutro): solo se pinta con un convenio vigente.
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
    <Badge variant="neutral" data-testid="agreement-chip" title={text} className={className}>
      <Handshake aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{text}</span>
    </Badge>
  );
}
