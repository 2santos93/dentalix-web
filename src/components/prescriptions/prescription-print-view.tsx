'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Lock, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { getPrescription, type PrescriptionDocument as PrescriptionDoc } from '@/lib/prescriptions/prescriptions-api';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { PrescriptionDocument } from './prescription-document';

const copy = {
  toolbar: 'Acciones de la receta',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando la receta…',
  loadError: 'No pudimos cargar la receta.',
  notFoundTitle: 'No encontramos esta receta.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica.',
  forbiddenTitle: 'Tu rol no tiene acceso a las recetas.',
  forbiddenHint: 'Son documentos clínicos: los ven odontólogos, asistentes y administración.',
  documentTitle: (name: string) => `Receta · ${name}`,
};

interface PrescriptionPrintViewProps {
  token: string;
  patientId: string;
  prescriptionId: string;
  /** En `false` no se pide nada y se muestra el aviso de acceso (la API daría 403). */
  allowed?: boolean;
}

/**
 * Vista imprimible de la receta (DX-013), fuera del shell, mismo patrón que la
 * del consentimiento: abre el diálogo de impresión UNA vez cuando la receta
 * está en pantalla; la barra lleva `print:hidden`.
 */
export function PrescriptionPrintView({
  token,
  patientId,
  prescriptionId,
  allowed = true,
}: PrescriptionPrintViewProps) {
  const [data, setData] = useState<PrescriptionDoc | null>(null);
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
        const res = await getPrescription(token, prescriptionId);
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
  }, [token, prescriptionId, reloadKey, allowed]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  const backHref = `/patients/${encodeURIComponent(patientId)}?tab=prescriptions`;

  return (
    <div className="prescription-print-page flex min-h-full flex-1 flex-col bg-surface-2 print:min-h-0 print:bg-white">
      {data ? <title>{copy.documentTitle(data.patientName)}</title> : null}
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
            <PrescriptionDocument prescription={data} />
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
