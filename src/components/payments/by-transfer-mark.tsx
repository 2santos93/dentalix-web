import { Badge } from '@/components/ui/badge';
import { allocationCopy } from '@/lib/payments/allocation-copy';

/**
 * DX-399-quater-bis: la marca «30,00 USD por traspaso» de un ítem que también
 * cubre el saldo que el plan recibió de otro plan del paciente («Ver
 * imputación» e «Imputar abono»). `Badge` neutral: es un dato, no un estado
 * (DESIGN.md › Chips / Badges). `amount` llega ya pintado con el formato de la
 * sede del abono.
 */
export function ByTransferMark({ amount }: { amount: string }) {
  return (
    <Badge variant="neutral" className="tabular-nums">
      {allocationCopy.byTransfer(amount)}
    </Badge>
  );
}
