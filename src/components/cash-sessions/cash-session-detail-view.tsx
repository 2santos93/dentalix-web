'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lock, Printer, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  cashSessionReportHref,
  getCashSession,
  type CashSessionDetail,
} from '@/lib/cash-sessions/cash-sessions-api';
import { COUNTRY_CURRENCY } from '@/lib/locations/clinic-currency';
import { listLocations } from '@/lib/locations/locations-api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CashSessionReport } from './cash-session-report';
import { CloseCashSessionModal } from './close-cash-session-modal';
import { ReopenCashSessionModal } from './reopen-cash-session-modal';
import { CashAdjustmentModal } from './cash-adjustment-modal';

const copy = {
  title: 'Turno de caja',
  description: (sede: string, who: string) => `${sede} · abrió ${who}`,
  back: 'Volver a los turnos',
  close: 'Cerrar caja',
  reopen: 'Reabrir',
  adjust: 'Corregir con un ajuste',
  print: 'Informe imprimible',
  loadError: 'No pudimos cargar el turno.',
  notFoundTitle: 'No encontramos este turno.',
  notFoundHint: 'Puede que sea de otra persona o de otra clínica.',
  forbiddenTitle: 'Tu rol no tiene acceso a la caja.',
  forbiddenHint: 'La caja es para administración y recepción.',
  closed: 'Caja cerrada: el arqueo quedó guardado.',
  reopened: 'Caja reabierta. El cierre anterior queda en el historial.',
  adjusted: 'Ajuste registrado: cuenta en tu caja abierta de la sede o en la siguiente que se abra.',
};

interface CashSessionDetailViewProps {
  token: string;
  sessionId: string;
}

/**
 * Un turno de caja (DX-027): el documento del turno (fondo, cobros,
 * anulaciones, ajustes, arqueo) y las acciones que la API permite a quien
 * consulta (`can`): cerrar, reabrir o corregir, más el informe imprimible.
 */
export function CashSessionDetailView({ token, sessionId }: CashSessionDetailViewProps) {
  const [session, setSession] = useState<CashSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [currency, setCurrency] = useState('COP');
  const [modal, setModal] = useState<'close' | 'reopen' | 'adjust' | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [res, locations] = await Promise.all([
          getCashSession(token, sessionId),
          listLocations(token).catch(() => []),
        ]);
        if (cancelled) return;
        setSession(res);
        const sede = locations.find((l) => l.id === res.location.id);
        if (sede) setCurrency(COUNTRY_CURRENCY[sede.country]);
        setError(null);
        setStatus(null);
      } catch (err) {
        if (cancelled) return;
        setStatus(err instanceof ApiError ? err.status : null);
        setError(apiErrorMessage(err, copy.loadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, sessionId, reloadKey]);

  function done(message: string) {
    setModal(null);
    setNotice(message);
    setReloadKey((k) => k + 1);
  }

  function openModal(kind: 'close' | 'reopen' | 'adjust') {
    setModalKey((k) => k + 1);
    setModal(kind);
  }

  const back = (
    <Button asChild variant="ghost" className="mb-4 -ml-2 justify-start">
      <Link href="/caja?tab=turnos">
        <ChevronLeft aria-hidden />
        {copy.back}
      </Link>
    </Button>
  );

  if (!session) {
    return (
      <>
        {back}
        <PageHeader title={copy.title} />
        {status === 404 ? (
          <EmptyState role="status" icon={<Wallet aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
        ) : status === 403 ? (
          <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : error ? (
          <SectionError description={error} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : (
          <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-6">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeader
        title={copy.title}
        description={copy.description(session.location.name, session.openedBy.fullName ?? '—')}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {session.can.close ? (
              <Button type="button" onClick={() => openModal('close')}>
                {copy.close}
              </Button>
            ) : null}
            {session.can.reopen ? (
              <Button type="button" variant="outline" onClick={() => openModal('reopen')}>
                {copy.reopen}
              </Button>
            ) : null}
            {session.can.adjust ? (
              <Button type="button" variant="outline" onClick={() => openModal('adjust')}>
                {copy.adjust}
              </Button>
            ) : null}
            {session.status === 'CLOSED' ? (
              <Button asChild variant={session.can.reopen ? 'outline' : 'default'}>
                <Link href={cashSessionReportHref(session.id)} target="_blank">
                  <Printer aria-hidden />
                  {copy.print}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <p role="status" className={notice ? 'mb-4 text-sm text-success' : 'sr-only'}>
        {notice}
      </p>
      <div className="overflow-hidden rounded-xl border border-border">
        <CashSessionReport session={session} />
      </div>

      {modal === 'close' ? (
        <CloseCashSessionModal
          key={`close-${modalKey}`}
          open
          onOpenChange={(open) => !open && setModal(null)}
          token={token}
          session={session}
          defaultCurrency={currency}
          onClosed={() => done(copy.closed)}
        />
      ) : null}
      {modal === 'reopen' ? (
        <ReopenCashSessionModal
          key={`reopen-${modalKey}`}
          open
          onOpenChange={(open) => !open && setModal(null)}
          token={token}
          sessionId={session.id}
          onReopened={() => done(copy.reopened)}
        />
      ) : null}
      {modal === 'adjust' ? (
        <CashAdjustmentModal
          key={`adjust-${modalKey}`}
          open
          onOpenChange={(open) => !open && setModal(null)}
          token={token}
          sessionId={session.id}
          defaultCurrency={currency}
          onCreated={() => done(copy.adjusted)}
        />
      ) : null}
    </>
  );
}
