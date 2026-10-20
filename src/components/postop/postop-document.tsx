import * as React from 'react';
import type { PostOpDeliveryDocument } from '@/lib/postop/postop-api';
import { formatDate } from '@/lib/format/date';

const copy = {
  phone: (phone: string) => `Tel. ${phone}`,
  footer: (code: string, version: number, date: string, by: string) =>
    `${code} · v${version} · entregada el ${date} por ${by}`,
};

interface PostOpDocumentProps {
  delivery: PostOpDeliveryDocument;
}

/**
 * Las indicaciones entregadas como DOCUMENTO para papel o PDF (DX-222):
 * cabecera de la clínica con la sede y su teléfono, el título y el texto tal
 * como se entregó. Al pie, el código y la versión de la plantilla, la fecha
 * y quién las entregó.
 *
 * Misma excepción de fidelidad de impresión que el consentimiento: papel
 * blanco y tinta oscura explícitos, también en modo oscuro.
 */
export function PostOpDocument({ delivery }: PostOpDocumentProps) {
  const { clinic } = delivery;

  return (
    <article className="postop-print-root mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header
        data-testid="postop-header"
        className="flex items-center gap-3 border-b border-[#d1d5db] pb-4"
      >
        {clinic.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo del tenant con host arbitrario, para imprimir; next/image no aporta nada aquí
          <img
            src={clinic.logoUrl}
            alt={clinic.name}
            referrerPolicy="no-referrer"
            className="h-12 w-auto max-w-[160px] object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <p className="break-words text-base font-semibold">{clinic.name}</p>
          <p className="break-words text-sm text-[#4b5563]">
            <span>{delivery.locationName}</span>
            {delivery.locationPhone ? (
              <>
                {' · '}
                <span className="tabular-nums">{copy.phone(delivery.locationPhone)}</span>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <h1 className="mt-6 text-xl font-semibold tracking-tight">{delivery.templateTitle}</h1>

      <div className="mt-4 whitespace-pre-line break-words text-[0.9375rem] leading-relaxed">
        {delivery.renderedText}
      </div>

      <footer className="mt-10 border-t border-[#d1d5db] pt-4 text-xs text-[#4b5563]">
        <p className="tabular-nums">
          {copy.footer(
            delivery.templateCode,
            delivery.templateVersion,
            formatDate(delivery.deliveredAt),
            delivery.deliveredByName,
          )}
        </p>
      </footer>
    </article>
  );
}
