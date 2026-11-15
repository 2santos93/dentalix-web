'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Lock, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { documentFormat } from '@/lib/format/document-format';
import {
  getClinicalRecordCopyDocument,
  type ClinicalRecordCopyDocument as CopyDoc,
} from '@/lib/patients/clinical-record-copies-api';
import { usePrintDocumentTitle } from '@/lib/print/use-print-document-title';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { ClinicalRecordCopyDocument } from './clinical-record-copy-document';

const copy = {
  toolbar: 'Acciones de la copia',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando la copia de la historia clínica…',
  loadError: 'No pudimos cargar la copia de la historia clínica.',
  notFoundTitle: 'No encontramos esta copia.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica o de este paciente.',
  forbiddenTitle: 'No tienes acceso a esta copia.',
  forbiddenHint:
    'La copia de la historia clínica la ve el personal clínico de la sede donde se generó.',
  genericTitle: 'Copia de la historia clínica',
  documentTitle: (name: string) => `Historia clínica · ${name}`,
  runningHeader: (name: string) => `${name} · Copia de la historia clínica`,
  pageOf: 'Página ',
  of: ' de ',
};

/**
 * Texto seguro dentro de una cadena CSS `"…"` de un `<style>`: todo lo que no
 * sea una letra (también con tilde), una cifra o un espacio sale como escape
 * hexadecimal CSS (`\3c `). Así comillas, barras, `<`, `/` y los caracteres
 * de control de un nombre nunca cierran la cadena, la regla ni el elemento.
 */
const SAFE_CSS_CHAR = /^[A-Za-z0-9\p{L} ]$/u;

export function cssString(value: string): string {
  let out = '';
  for (const ch of value) {
    out += SAFE_CSS_CHAR.test(ch) ? ch : `\\${ch.codePointAt(0)!.toString(16)} `;
  }
  return `"${out}"`;
}

interface ClinicalRecordCopyPrintViewProps {
  token: string;
  patientId: string;
  copyId: string;
  /** En `false` no se pide nada y se muestra el aviso de acceso (la API daría 403). */
  allowed?: boolean;
}

/**
 * DX-456: vista imprimible de una copia de la historia clínica, fuera del
 * shell. Pide el documento (la API lo deja como impresión), lo pinta con el
 * formato de la sede de la copia y abre el diálogo de impresión UNA vez. En
 * papel: A4 o Carta (página sin tamaño fijo), el nombre del paciente arriba y
 * «Página X de Y» abajo en cada hoja.
 */
export function ClinicalRecordCopyPrintView({ token, patientId, copyId, allowed = true }: ClinicalRecordCopyPrintViewProps) {
  const [data, setData] = useState<CopyDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const forbidden = !allowed || deniedByApi;
  const format = useMemo(
    () =>
      data
        ? documentFormat({
            timeZone: data.location.timeZone,
            locale: data.location.locale,
            hourCycle: data.location.hourCycle === 'h12' || data.location.hourCycle === 'h23' ? data.location.hourCycle : null,
          })
        : null,
    [data],
  );

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getClinicalRecordCopyDocument(token, patientId, copyId).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      },
      (err: unknown) => {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        // 404: reintentar no lo arregla → aviso, no error con reintento.
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(apiErrorMessage(err, { fallback: copy.loadError }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, patientId, copyId, reloadKey, allowed]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  const backHref = `/patients/${encodeURIComponent(patientId)}?tab=clinical-history`;
  usePrintDocumentTitle(copy.genericTitle, data ? copy.documentTitle(data.patient.name) : null);

  return (
    <div className="clinical-record-print-page flex min-h-full flex-1 flex-col bg-surface-sunken print:min-h-0 print:bg-white">
      {data ? (
        // Cabecera de cada hoja: el nombre del paciente (nunca un id). El
        // número de hoja lo pone `@page clinical-record` (globals.css).
        <style data-testid="copy-page-style">{`@page clinical-record { @top-left { content: ${cssString(
          copy.runningHeader(data.patient.name),
        )}; } @bottom-right { content: ${cssString(copy.pageOf)} counter(page) ${cssString(copy.of)} counter(pages); } }`}</style>
      ) : null}
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start max-sm:min-h-11">
          <Link href={backHref}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()} disabled={!data} className="max-sm:min-h-11">
          <Printer aria-hidden />
          {copy.print}
        </Button>
      </div>

      <main className="min-w-0 flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {data ? (
          <>
            {format === null ? (
              <div className="mx-auto max-w-[210mm] px-4 pt-4 pb-4 sm:px-0 sm:pt-0 print:hidden">
                <SedeConfigError
                  kind="locale"
                  variant="note"
                  locationId={data.copy.location.id}
                  onRetry={() => setReloadKey((k) => k + 1)}
                />
              </div>
            ) : null}
            <div className="mx-auto max-w-[210mm] sm:border sm:border-border print:max-w-none print:border-0">
              <ClinicalRecordCopyDocument document={data} format={format} />
            </div>
          </>
        ) : forbidden ? (
          <Notice icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : notFound ? (
          <Notice icon={<FileX aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
        ) : error ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <SectionError
              description={error}
              onRetry={() => {
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </div>
        ) : (
          <p role="status" className="px-4 py-8 text-center text-sm text-muted">
            {copy.loading}
          </p>
        )}
      </main>
    </div>
  );
}

function Notice({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <EmptyState role="status" icon={icon} title={title} description={description} />
    </div>
  );
}
