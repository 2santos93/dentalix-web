import { cn } from '@/lib/utils';
import { taxIdLine, type ClinicFiscal } from '@/lib/clinic/clinic-settings-api';

/**
 * DX-019: los datos fiscales y de contacto de la clínica en la cabecera de un
 * documento imprimible (presupuesto, receta, estado de cuenta): razón social ·
 * identificador con el nombre que le da la clínica, dirección fiscal y
 * contacto. Lo que falte no se pinta; sin nada, no hay bloque. El recibo de
 * caja usa su foto congelada (y su aviso «Datos fiscales pendientes»).
 */
export function ClinicFiscalLines({ fiscal, className }: { fiscal: ClinicFiscal | null | undefined; className?: string }) {
  if (!fiscal) return null;
  const first = [fiscal.legalName, fiscal.taxId ? taxIdLine(fiscal.taxId, fiscal.taxIdLabel) : null].filter(
    (v): v is string => Boolean(v),
  );
  const contact = [fiscal.email, fiscal.phone].filter((v): v is string => Boolean(v));
  const lines = [first.join(' · '), fiscal.address ?? '', contact.join(' · ')].filter((l) => l !== '');
  if (lines.length === 0) return null;
  return (
    <p data-testid="clinic-fiscal" className={cn('text-xs text-[#4b5563] [overflow-wrap:anywhere]', className)}>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </p>
  );
}
