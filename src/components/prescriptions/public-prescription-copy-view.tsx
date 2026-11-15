'use client';
import { useEffect, useMemo, useState } from 'react';
import { Clock, FileX, Printer, SearchX, ShieldAlert } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  PRESCRIPTION_COPY_EXPIRED_CODE,
  getPublicPrescriptionCopy,
  type PublicPrescriptionCopy,
} from '@/lib/prescriptions/prescription-copy';
import { prescriptionFormat } from '@/lib/prescriptions/prescription-format';
import { verificationDate } from '@/lib/prescriptions/prescription-verification';
import { NO_DOCUMENT_FORMAT } from '@/lib/format/document-format';
import { PublicNotice, publicBrandStyle } from '@/components/shared/public-page';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { PrescriptionDocument } from './prescription-document';
import { PrescriptionCopyFooterDocument } from './prescription-copy-footer-document';

// Copy as constants (i18n-ready, es-first).
export const publicPrescriptionCopyCopy = {
  loading: 'Abriendo la copia de tu receta…',
  toolbar: 'Acciones de la copia',
  print: 'Imprimir o guardar como PDF',
  informativeTitle: 'Copia informativa',
  informativeMessage:
    'Sirve para consultar tu tratamiento. No sustituye a la receta impresa y firmada.',
  voidedTitle: 'Esta receta fue anulada',
  voidedMessage: (date: string | null) =>
    date
      ? `La clínica la anuló el ${date}. Ya no es válida y no se puede descargar. Si tienes dudas, contacta con la clínica.`
      : 'Ya no es válida y no se puede descargar. Si tienes dudas, contacta con la clínica.',
  unverifiableTitle: 'No podemos mostrar esta receta',
  unverifiableMessage: 'Contacta con la clínica que te la envió para que te la vuelva a enviar.',
  expiredTitle: 'Este enlace caducó',
  expiredMessage: 'Si necesitas otra copia de la receta, pídesela a la clínica.',
  notFoundTitle: 'Este enlace no es válido',
  notFoundMessage:
    'Puede que la clínica te haya enviado otro más reciente, o que el enlace esté incompleto. Si necesitas la copia, pídesela a la clínica.',
  loadError: 'No pudimos abrir la copia de la receta. Revisa tu conexión.',
  tooManyTitle: 'Demasiados intentos',
  tooManyMessage: 'Espera un minuto antes de volver a abrirla.',
};

const copy = publicPrescriptionCopyCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; tooMany: boolean }
  | { kind: 'notFound' }
  | { kind: 'expired' }
  | { kind: 'ready'; data: PublicPrescriptionCopy };

/** El día de la anulación con el formato de la sede, o `null` sin formato. */
function voidedDate(data: PublicPrescriptionCopy): string | null {
  const date = verificationDate(data.voidedOn, data);
  return date === NO_DOCUMENT_FORMAT ? null : date;
}

/**
 * Página pública `/receta/copia/[token]` (DX-468): la copia INFORMATIVA de
 * una receta que la clínica envió al paciente (o al responsable de un menor).
 * Con el enlace vivo, la receta tal como se imprime, con su QR de
 * verificación (DX-467) y el pie de la clínica, y «Imprimir o guardar como
 * PDF». Si se anuló después del envío, solo «Esta receta fue anulada»: ni la
 * receta ni nada que descargar. Caducado, inválido o de otra clínica: un
 * aviso sin nada clínico. Móvil primero.
 */
export function PublicPrescriptionCopyView({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicPrescriptionCopy(token)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: 'notFound' });
        else if (err instanceof ApiError && err.status === 410 && err.code === PRESCRIPTION_COPY_EXPIRED_CODE)
          setState({ kind: 'expired' });
        else setState({ kind: 'error', tooMany: err instanceof ApiError && err.status === 429 });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const data = state.kind === 'ready' ? state.data : null;
  const prescription = data?.status === 'AVAILABLE' ? data.prescription : null;
  const format = useMemo(
    () => (prescription ? prescriptionFormat(prescription.locationFormat) : null),
    [prescription],
  );

  return (
    <div
      // `prescription-print-page`: al imprimir, la hoja A4 de la receta (globals.css).
      className="prescription-print-page flex min-h-dvh flex-col bg-canvas print:min-h-0 print:bg-white"
      style={publicBrandStyle(data?.clinic)}
    >
      {prescription ? (
        <div
          role="toolbar"
          aria-label={copy.toolbar}
          className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
        >
          <p className="text-sm font-medium text-ink">{data?.clinic?.name}</p>
          <Button type="button" onClick={() => window.print()} className="w-full sm:w-auto">
            <Printer aria-hidden />
            {copy.print}
          </Button>
        </div>
      ) : null}

      <main
        className={
          prescription
            ? 'flex flex-1 flex-col gap-4 px-0 py-4 sm:px-4 sm:py-8 print:p-0'
            : 'mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8'
        }
      >
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            title={state.tooMany ? copy.tooManyTitle : undefined}
            description={state.tooMany ? copy.tooManyMessage : copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'notFound' && (
          <PublicNotice headingLevel={1} icon={SearchX} title={copy.notFoundTitle} message={copy.notFoundMessage} />
        )}

        {state.kind === 'expired' && (
          <PublicNotice headingLevel={1} icon={Clock} title={copy.expiredTitle} message={copy.expiredMessage} />
        )}

        {data?.status === 'VOIDED' && (
          <PublicNotice
            headingLevel={1}
            icon={FileX}
            title={copy.voidedTitle}
            message={copy.voidedMessage(voidedDate(data))}
          />
        )}

        {data?.status === 'UNVERIFIABLE' && (
          <PublicNotice
            headingLevel={1}
            icon={ShieldAlert}
            title={copy.unverifiableTitle}
            message={copy.unverifiableMessage}
          />
        )}

        {prescription && data ? (
          <>
            <h1 className="sr-only">{copy.informativeTitle}</h1>
            <div className="mx-auto w-full max-w-[210mm] px-4 sm:px-0 print:hidden">
              <Callout tone="info" title={copy.informativeTitle}>
                {copy.informativeMessage}
              </Callout>
            </div>
            <div className="mx-auto w-full max-w-[210mm] shadow-sm print:shadow-none">
              {/* Solo en el cliente: `prescription` llega tras el fetch. */}
              <PrescriptionDocument prescription={prescription} format={format} origin={window.location.origin} />
              <PrescriptionCopyFooterDocument text={data.footer ?? ''} />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
