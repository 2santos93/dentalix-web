'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { useSedeClock, type SedeClock } from '@/lib/locations/sede-clock';
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
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/errors/inline-error';
import { SendBudgetModal } from '@/components/signature-requests/send-budget-modal';

export const remoteBudgetCopy = {
  send: 'Enviar a aceptar',
  sendAgain: 'Enviar de nuevo',
  loadError: 'No pudimos cargar el estado del envío.',
  retry: 'Reintentar',
  requestStatus: (status: string, to: string, when: string) => `Enviado a aceptar a ${to} el ${when} · ${status}`,
  emailNotQueued: 'La solicitud quedó registrada pero el email no salió: envíala de nuevo.',
  remoteAccepted: (name: string, when: string) => `Aceptado a distancia por ${name} el ${when}`,
  evidenceHeading: 'Evidencias de la aceptación a distancia',
  evidenceTo: 'Enviado por email a',
  evidenceSent: 'Enviado',
  evidenceOpened: 'Abierto',
  evidenceVerified: 'Código verificado',
  evidenceIp: 'IP de quien firmó',
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

/** Evidencias de un plan aceptado a distancia (DX-415), para la ficha. */
export function RemoteAcceptanceEvidence({
  token,
  remote,
}: {
  token: string;
  remote: NonNullable<NonNullable<TreatmentPlan['acceptance']>['remote']>;
}) {
  const sede = useSedeClock(token);
  const clock = sede.status === 'ready' ? sede.clock : null;
  const rows: [string, string][] = [
    [copy.evidenceTo, remote.destinationMasked],
    [copy.evidenceSent, at(remote.sentAt, clock)],
    [copy.evidenceOpened, at(remote.openedAt, clock)],
    [copy.evidenceVerified, at(remote.verifiedAt, clock)],
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
 * pinta `PlanQuoteActions`.
 */
export function RemoteBudgetPanel({ token, patientId, plan, role }: RemoteBudgetPanelProps) {
  const [request, setRequest] = useState<SignatureRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [emailNotQueued, setEmailNotQueued] = useState(false);
  const sede = useSedeClock(token);
  const screenClock = sede.status === 'ready' ? sede.clock : null;

  // Quien decide el plan (odontólogo o ADMIN): al firmarlo el paciente, el
  // plan queda aceptado a nombre de quien lo envió (la API lo exige, 403).
  const sendable =
    canAcceptPlan(role) && plan.status === 'PRESENTED' && !plan.acceptance && (plan.items?.length ?? 0) > 0;

  useEffect(() => {
    if (!sendable) return;
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
  }, [sendable, token, patientId, plan.id, reloadKey]);

  if (!sendable) return null;

  const pending = request ? canRevokeSignatureRequest(request.status) && request.status !== 'EXPIRED' : false;

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
      {emailNotQueued ? <InlineError>{copy.emailNotQueued}</InlineError> : null}
      <div>
        <Button type="button" variant="secondary" disabled={loading} onClick={() => setSending(true)}>
          <Send aria-hidden />
          {request ? copy.sendAgain : copy.send}
        </Button>
      </div>
      {sending ? (
        <SendBudgetModal
          open
          onOpenChange={setSending}
          token={token}
          patientId={patientId}
          planId={plan.id}
          replacesPending={pending}
          onSent={(created) => {
            setRequest(created);
            setEmailNotQueued(!created.emailQueued);
          }}
        />
      ) : null}
    </div>
  );
}
