'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { useSedeClock, type SedeClock } from '@/lib/locations/sede-clock';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  canRevokeSignatureRequest,
  latestBudgetRequest,
  listSignatureRequests,
  signatureStatusLabel,
  type SignatureRequest,
} from '@/lib/signature-requests/signature-requests-api';
import { canAcceptPlan } from '@/lib/treatment-plans/plan-quote-api';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/errors/inline-error';
import { SendBudgetModal } from '@/components/signature-requests/send-budget-modal';

export const remoteBudgetCopy = {
  send: 'Enviar a aceptar',
  sendAgain: 'Enviar de nuevo',
  loadError: 'No pudimos cargar el estado del envío.',
  retry: 'Reintentar',
  requestStatus: (status: string, to: string, when: string) => `Enviado a aceptar a ${to} el ${when} · ${status}`,
  remoteAccepted: (name: string, when: string) => `Aceptado a distancia por ${name} el ${when}`,
  evidenceHeading: 'Evidencias de la aceptación a distancia',
  evidenceTo: 'Enviado por email a',
  evidenceSent: 'Enviado',
  evidenceOpened: 'Abierto',
  evidenceVerified: 'Código verificado',
  evidenceIp: 'IP de quien firmó',
  // DX-379 (C): vencido, no se envía (la API: 409 QUOTE_EXPIRED); un enlace ya enviado deja de valer.
  expiredSend: (date: string) => `El presupuesto venció el ${date}: actualiza sus precios antes de enviarlo.`,
  expiredPending: 'El presupuesto venció: el enlace enviado ya no vale para el paciente.',
  // DX-417: la API no cambia el estado de la solicitud; el paciente verá «Enlace no válido».
  partialPending: 'El enlace enviado ya no sirve: el presupuesto se aceptó en parte.',
};

const copy = remoteBudgetCopy;

interface RemoteBudgetPanelProps {
  token: string;
  patientId: string;
  plan: TreatmentPlan;
  role: ClinicRole | null;
}

/** Fecha y hora en la zona y el formato de la sede; «—» sin reloj. */
function at(iso: string, clock: SedeClock | null): string {
  return clock ? clock.fmt.dateTime(new Date(iso), clock.timeZone) : NO_SEDE_FORMAT;
}

/**
 * Evidencias de un plan aceptado a distancia (DX-415), para la ficha. DX-514:
 * con el pintor de la pantalla y la sede donde se aceptó (`locationId`), el
 * mismo reloj que pinta «Aceptado a distancia … el …»; nunca el del navegador
 * ni UTC (sin sede conocida, «—»).
 */
export function RemoteAcceptanceEvidence({
  remote,
  stamp,
  locationId,
}: {
  remote: NonNullable<NonNullable<TreatmentPlan['acceptance']>['remote']>;
  stamp: SedePainters;
  locationId: string | null | undefined;
}) {
  const paint = (iso: string) => stamp.dateTime(iso, locationId);
  const rows: [string, string][] = [
    [copy.evidenceTo, remote.destinationMasked],
    [copy.evidenceSent, paint(remote.sentAt)],
    [copy.evidenceOpened, paint(remote.openedAt)],
    [copy.evidenceVerified, paint(remote.verifiedAt)],
    ...(remote.ipAddress ? ([[copy.evidenceIp, remote.ipAddress]] as [string, string][]) : []),
  ];
  return (
    <dl
      aria-label={copy.evidenceHeading}
      className="grid grid-cols-1 gap-x-4 gap-y-1 t-caption text-muted sm:grid-cols-2"
    >
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-w-0 gap-1">
          <dt>{label}:</dt>
          <dd className="min-w-0 break-words tabular-nums text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * «Enviar a aceptar» del presupuesto presentado (DX-415): el estado del último
 * enlace de este plan (Enviado · Abierto · Bloqueado · Caducado · Anulado) y
 * el botón que abre la confirmación. Solo en un plan «Presentado», sin aceptar
 * y con ítems, y solo para quien decide el plan; el aceptado a distancia lo
 * pinta `PlanQuoteActions`. DX-379 (C): un presupuesto vencido no se envía
 * (botón deshabilitado con el porqué) y, si había un enlace pendiente, se
 * avisa de que ya no vale. DX-417: aceptado en parte, lo mismo con el enlace
 * pendiente del original (y nada más: el pendiente nuevo tiene su propio panel).
 */
export function RemoteBudgetPanel({ token, patientId, plan, role }: RemoteBudgetPanelProps) {
  const [request, setRequest] = useState<SignatureRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, setSending] = useState(false);
  const sede = useSedeClock(token);
  const screenClock = sede.status === 'ready' ? sede.clock : null;

  // Quien decide el plan (odontólogo o ADMIN): al firmarlo el paciente, el
  // plan queda aceptado a nombre de quien lo envió (la API lo exige, 403).
  const sendable =
    canAcceptPlan(role) && plan.status === 'PRESENTED' && !plan.acceptance && (plan.items?.length ?? 0) > 0;
  // DX-417: aceptado en parte; si quedaba un enlace pendiente del original, ya no sirve.
  const partiallyAccepted = canAcceptPlan(role) && Boolean(plan.partialPendingPlanId);
  const watched = sendable || partiallyAccepted;

  useEffect(() => {
    if (!watched) return;
    let cancelled = false;
    listSignatureRequests(token, patientId)
      .then((rows) => {
        if (!cancelled) setRequest(latestBudgetRequest(rows, plan.id));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [watched, token, patientId, plan.id, reloadKey]);

  if (partiallyAccepted) {
    const linkLeft = request !== null && (request.status === 'SENT' || request.status === 'OPENED');
    return linkLeft ? <Callout tone="warning">{copy.partialPending}</Callout> : null;
  }
  if (!sendable) return null;

  const pending = request ? canRevokeSignatureRequest(request.status) && request.status !== 'EXPIRED' : false;
  // DX-379 (C): el día, en la sede de la presentación (la del dato); sin su reloj, la de la pantalla.
  const expired = plan.quoteExpired;
  const expiredClock = screenClock?.of(plan.presentedLocationId) ?? screenClock;
  const expiredDay =
    expired && plan.quoteValidUntil && expiredClock ? expiredClock.fmt.civilDate(plan.quoteValidUntil) : NO_SEDE_FORMAT;
  const expiredHintId = `remote-budget-expired-${plan.id}`;
  // La API no cambia el estado de la solicitud: el paciente que abra el enlace verá «Enlace no válido».
  const linkVoided = expired && request !== null && (request.status === 'SENT' || request.status === 'OPENED');

  return (
    <div className="flex flex-col gap-2">
      {loading ? (
        <div role="status" aria-label="Cargando">
          <Skeleton className="h-5 w-64" />
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2">
          <InlineError>{error}</InlineError>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoading(true);
              setError(null);
              setReloadKey((k) => k + 1);
            }}
          >
            {copy.retry}
          </Button>
        </div>
      ) : request ? (
        <p role="status" className="text-sm text-muted tabular-nums">
          {copy.requestStatus(
            signatureStatusLabel(request.status, request.signerType),
            request.destinationMasked,
            at(request.sentAt, screenClock?.of(request.locationId) ?? screenClock),
          )}
        </p>
      ) : null}
      {linkVoided ? <Callout tone="warning">{copy.expiredPending}</Callout> : null}
      <div className="flex flex-col gap-1">
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || expired}
            aria-describedby={expired ? expiredHintId : undefined}
            onClick={() => setSending(true)}
          >
            <Send aria-hidden />
            {request ? copy.sendAgain : copy.send}
          </Button>
        </div>
        {expired ? (
          <p id={expiredHintId} className="text-sm text-muted tabular-nums">
            {copy.expiredSend(expiredDay)}
          </p>
        ) : null}
      </div>
      {sending ? (
        <SendBudgetModal
          open
          onOpenChange={setSending}
          token={token}
          patientId={patientId}
          planId={plan.id}
          replacesPending={pending}
          // DX-149-quater: un 201 siempre lleva el email en cola (la API guarda
          // la solicitud y su email en la misma transacción; si no se puede
          // encolar, responde error y no queda nada).
          onSent={(created) => setRequest(created)}
        />
      ) : null}
    </div>
  );
}
