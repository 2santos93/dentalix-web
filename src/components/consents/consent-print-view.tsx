'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Lock, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { getPatientConsent, type PatientConsentDocument } from '@/lib/consents/consents-api';
import { ConsentDocument } from './consent-document';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

const copy = {
  toolbar: 'Acciones del documento',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando el consentimiento…',
  loadError: 'No pudimos cargar el consentimiento.',
  notFoundTitle: 'No encontramos este consentimiento.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica o de este paciente.',
  forbiddenTitle: 'Tu rol no tiene acceso a los consentimientos.',
  forbiddenHint: 'Son documentos clínicos: los ven odontólogos, asistentes y administración.',
  documentTitle: (title: string, name: string) => `${title} · ${name}`,
};

interface ConsentPrintViewProps {
  token: string;
  patientId: string;
  consentId: string;
  /** En `false` no se pide nada y se muestra el aviso de acceso (la API daría 403). */
  allowed?: boolean;
}

/**
 * Vista imprimible del consentimiento firmado (DX-006), fuera del shell:
 * mismo patrón que la del estado de cuenta. Abre el diálogo de impresión UNA
 * vez, en cuanto el documento está en pantalla; la barra lleva `print:hidden`.
 */
export function ConsentPrintView({
  token,
  patientId,
  consentId,
  allowed = true,
}: ConsentPrintViewProps) {
  const [data, setData] = useState<PatientConsentDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const forbidden = !allowed || deniedByApi;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await getPatientConsent(token, patientId, consentId);
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        // 404: reintentar no lo arregla → aviso, no error con reintento.
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(copy.loadError);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, consentId, reloadKey, allowed]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  const backHref = `/patients/${encodeURIComponent(patientId)}?tab=consents`;

  return (
    <div className="consent-print-page flex min-h-full flex-1 flex-col bg-surface-2 print:min-h-0 print:bg-white">
      {data ? (
        <title>
          {copy.documentTitle(data.title, `${data.patient.firstName} ${data.patient.lastName}`)}
        </title>
      ) : null}
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start">
          <Link href={backHref}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()} disabled={!data}>
          <Printer aria-hidden />
          {copy.print}
        </Button>
      </div>

      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {data ? (
          <div className="mx-auto max-w-[210mm] shadow-sm print:shadow-none">
            <ConsentDocument consent={data} />
          </div>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<Lock aria-hidden />}
              title={copy.forbiddenTitle}
              description={copy.forbiddenHint}
            />
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<FileX aria-hidden />}
              title={copy.notFoundTitle}
              description={copy.notFoundHint}
            />
          </div>
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
