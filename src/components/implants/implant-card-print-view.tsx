'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getImplantCard, printImplantCard, type ImplantCard } from '@/lib/implants/implants-api';
import { notifyError } from '@/components/errors/notify';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { ImplantCardDocument } from './implant-card-document';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';

const copy = {
  toolbar: 'Acciones de la tarjeta de implante',
  print: 'Imprimir y registrar la entrega',
  printing: 'Registrando la entrega…',
  back: 'Volver a la ficha',
  loading: 'Preparando la tarjeta…',
  loadError: 'No pudimos cargar la tarjeta de implante.',
  printError: 'No pudimos registrar la entrega de la tarjeta.',
  notFoundTitle: 'No hay implantes registrados en esa fecha.',
  notFoundHint: 'Abre la tarjeta desde la sección «Implantes» de la ficha.',
  documentTitle: (name: string) => `Tarjeta de implante · ${name}`,
};

interface ImplantCardPrintViewProps {
  token: string;
  patientId: string;
  date: string;
}

/**
 * Vista imprimible de la tarjeta de implante (DX-191), fuera del shell como la
 * receta. No abre el diálogo de impresión sola: «Imprimir» registra primero la
 * entrega en la API (la primera fecha queda; reimprimir no la mueve) y luego
 * abre el diálogo. La barra lleva `print:hidden`. Una sola hoja A4 o carta.
 */
export function ImplantCardPrintView({ token, patientId, date }: ImplantCardPrintViewProps) {
  const [card, setCard] = useState<ImplantCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [printing, setPrinting] = useState(false);
  const pendingPrint = useRef(false);
  // G1-B: la sede de la pantalla hasta G1-C (la tarjeta aún no trae la suya).
  const sedeFormat = useSedeFormat(token);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getImplantCard(token, patientId, date);
        if (cancelled) return;
        setCard(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // 404/400: reintentar no lo arregla → aviso, no error con reintento.
        setNotFound(err instanceof ApiError && (err.status === 404 || err.status === 400));
        setError(apiErrorMessage(err, copy.loadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, date, reloadKey]);

  // El diálogo se abre DESPUÉS de pintar la tarjeta con la fecha de entrega.
  useEffect(() => {
    if (card && pendingPrint.current) {
      pendingPrint.current = false;
      window.print();
    }
  }, [card]);

  // I1: sin el formato de la sede, las medidas saldrían «—» en una tarjeta que se entrega al paciente.
  const formatReady = sedeFormat.status === 'ready';

  async function handlePrint() {
    if (!formatReady) return;
    setPrinting(true);
    try {
      const delivered = await printImplantCard(token, patientId, date);
      pendingPrint.current = true;
      setCard(delivered);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: copy.printError }), {
        onRetry: () => void handlePrint(),
      });
    } finally {
      setPrinting(false);
    }
  }

  const backHref = `/patients/${encodeURIComponent(patientId)}?tab=implants`;

  return (
    <div className="implant-card-print-page flex min-h-full flex-1 flex-col bg-surface-2 print:min-h-0 print:bg-white">
      {card ? <title>{copy.documentTitle(card.patientName)}</title> : null}
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
        <Button type="button" onClick={() => void handlePrint()} disabled={!card || !formatReady} loading={printing}>
          <Printer aria-hidden />
          {printing ? copy.printing : copy.print}
        </Button>
      </div>

      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {card ? (
          <div className="mx-auto flex w-full max-w-[180mm] flex-col gap-3 print:max-w-none">
            {sedeFormat.status === 'error' ? (
              <SedeConfigError
                kind="locale"
                variant="note"
                onRetry={sedeFormat.retry}
                description={sedeFormat.message}
                className="mx-4 sm:mx-0 print:hidden"
              />
            ) : null}
            <div className="shadow-sm print:shadow-none">
              <ImplantCardDocument card={card} fmt={readyFormat(sedeFormat)} />
            </div>
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
