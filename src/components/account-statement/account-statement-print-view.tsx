'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lock, Printer, UserX } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getAccountStatement,
  type AccountStatement,
} from '@/lib/account-statement/account-statement-api';
import { AccountStatementDocument } from './account-statement-document';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

const copy = {
  toolbar: 'Acciones del documento',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando el estado de cuenta…',
  loadError: 'No pudimos cargar el estado de cuenta.',
  notFoundTitle: 'No encontramos este paciente.',
  notFoundHint: 'Puede que se haya retirado o que el enlace no sea de esta clínica.',
  forbiddenTitle: 'Tu rol no tiene acceso al estado de cuenta.',
  forbiddenHint: 'Es un dato financiero: lo ven administración y recepción.',
  documentTitle: (name: string) => `Estado de cuenta · ${name}`,
};

interface AccountStatementPrintViewProps {
  token: string;
  patientId: string;
  /**
   * El rol de la sesión puede leer el estado de cuenta (por defecto, sí). En
   * `false` no se pide nada y se muestra el aviso de acceso: la API lo
   * rechazaría con 403 igualmente.
   */
  allowed?: boolean;
}

/**
 * Vista imprimible del estado de cuenta (DX-011), fuera del shell de la app.
 * Carga el estado de cuenta, lo pinta como documento y abre el diálogo de
 * impresión del navegador UNA vez, en cuanto el documento está en pantalla
 * (desde ahí se imprime o se «Guarda como PDF»). La barra de acciones lleva
 * `print:hidden`: no sale en el papel.
 */
export function AccountStatementPrintView({
  token,
  patientId,
  allowed = true,
}: AccountStatementPrintViewProps) {
  const [data, setData] = useState<AccountStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const forbidden = !allowed || deniedByApi;
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await getAccountStatement(token, patientId);
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        // 404 (paciente inexistente, retirado o de otra clínica): reintentar
        // no lo arregla, así que va como aviso y no como error con reintento.
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(copy.loadError);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey, allowed]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  const backHref = `/patients/${encodeURIComponent(patientId)}?tab=account-statement`;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface-sunken print:bg-white">
      {data ? (
        <title>{copy.documentTitle(`${data.patient.firstName} ${data.patient.lastName}`)}</title>
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
          <div className="mx-auto max-w-[210mm] sm:border sm:border-border print:border-0">
            <AccountStatementDocument statement={data} />
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
              icon={<UserX aria-hidden />}
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
