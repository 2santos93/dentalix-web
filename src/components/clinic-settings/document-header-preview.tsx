import { ClinicFiscalLines } from '@/components/brand/clinic-fiscal-lines';
import type { ClinicFiscal } from '@/lib/clinic/clinic-settings-api';

export const documentHeaderPreviewCopy = {
  title: 'Recibo de caja',
  number: 'N.º 000123 · ejemplo',
  pending: 'Datos fiscales pendientes',
};

const copy = documentHeaderPreviewCopy;

/**
 * DX-019: la cabecera de un documento impreso con lo que hay escrito, antes
 * de guardar: logo, nombre y datos fiscales (o «Datos fiscales pendientes»,
 * como el recibo, si falta la razón social o el identificador). Papel blanco,
 * como los documentos, en los dos temas.
 */
export function DocumentHeaderPreview({
  name,
  logoUrl,
  fiscal,
}: {
  name: string;
  logoUrl: string | null;
  fiscal: ClinicFiscal;
}) {
  const pending = !fiscal.legalName || !fiscal.taxId;
  return (
    <div
      data-testid="document-header-preview"
      className="overflow-hidden rounded-xl border border-border bg-white px-4 py-5 text-sm text-[#111827] sm:px-6"
    >
      <div className="flex flex-col gap-3 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo de la clínica (o su vista previa local)
            <img src={logoUrl} alt="" className="h-12 w-auto max-w-[160px] shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="text-base font-semibold [overflow-wrap:anywhere]">{name}</p>
            {/* Como el recibo: sin razón social o sin identificador, solo el aviso. */}
            {pending ? (
              <p className="mt-1 inline-block rounded-sm border border-[#d1d5db] px-1.5 py-0.5 text-xs text-[#4b5563]">
                {copy.pending}
              </p>
            ) : (
              <ClinicFiscalLines fiscal={fiscal} className="mt-1" />
            )}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-lg font-semibold tracking-tight">{copy.title}</p>
          <p className="text-xs text-[#4b5563] tabular-nums">{copy.number}</p>
        </div>
      </div>
    </div>
  );
}
