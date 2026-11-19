import { Badge } from '@/components/ui/badge';

export const reconciledCopy = {
  label: 'Conciliado',
  title: 'Conciliado con el extracto del banco',
};

/**
 * DX-571: el abono ya casa con un movimiento del extracto del banco (Caja ›
 * Conciliación). Es un dato del abono, no su estado: `Badge` en tono de éxito
 * con su texto, nunca solo color. `null` si no está conciliado.
 */
export function ReconciledBadge({ reconciled }: { reconciled: boolean | null | undefined }) {
  if (!reconciled) return null;
  return (
    <Badge variant="success" className="mt-1 flex w-fit" title={reconciledCopy.title} data-testid="reconciled-badge">
      {reconciledCopy.label}
    </Badge>
  );
}

/** El mismo dato en la línea de la tarjeta del teléfono. */
export function reconciledLabel(reconciled: boolean | null | undefined): string | null {
  return reconciled ? reconciledCopy.label : null;
}
