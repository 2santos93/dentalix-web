'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Lock, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { getPlanQuote, type PlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { PlanQuoteDocument } from './plan-quote-document';

const copy = {
  toolbar: 'Acciones del presupuesto',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando el presupuesto…',
  loadError: 'No pudimos cargar el presupuesto.',
  notFoundTitle: 'No encontramos este presupuesto.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica o de este paciente.',
  forbiddenTitle: 'Tu rol no tiene acceso a este presupuesto.',
  forbiddenHint: 'Pide a la administración de la clínica que revise tu rol.',
  documentTitle: (name: string) => `Presupuesto · ${name}`,
};

interface PlanQuotePrintViewProps {
  token: string;
  patientId: string;
  planId: string;
  /** A dónde vuelve «Volver a la ficha» (la pestaña depende del rol). */
  backHref: string;
  /** En `false` no se pide nada y se muestra el aviso de acceso (la API daría 403). */
  allowed?: boolean;
}

/**
 * Vista imprimible del presupuesto (DX-012), fuera del shell, mismo patrón que
 * la del consentimiento y la receta: abre el diálogo de impresión UNA vez
 * cuando el presupuesto está en pantalla; la barra lleva `print:hidden`.
 */
export function PlanQuotePrintView({
  token,
  patientId,
  planId,
  backHref,
  allowed = true,
}: PlanQuotePrintViewProps) {
  const [data, setData] = useState<PlanQuote | null>(null);
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
        const res = await getPlanQuote(token, patientId, planId);
        if (cancelled) return;
        // La URL nombra al paciente: si el plan es de otro, no se imprime bajo
        // su ficha (el «Volver» llevaría a quien no es).
        if (res.patientId !== patientId) {
          setNotFound(true);
          setError(copy.loadError);
          return;
        }
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
  }, [token, patientId, planId, reloadKey, allowed]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  return (
    <div className="quote-print-page flex min-h-full flex-1 flex-col bg-surface-2 print:min-h-0 print:bg-white">
      {data ? <title>{copy.documentTitle(data.patient.name)}</title> : null}
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
            <PlanQuoteDocument quote={data} />
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
