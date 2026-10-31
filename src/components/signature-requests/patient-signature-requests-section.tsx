'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { useSedeClock, type SedeClock } from '@/lib/locations/sede-clock';
import {
  SIGNATURE_STATUS_LABELS,
  canRevokeSignatureRequest,
  listSignatureRequests,
  revokeSignatureRequest,
  type SignatureRequest,
  type SignatureRequestCreated,
} from '@/lib/signature-requests/signature-requests-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';
import { SendToSignModal } from './send-to-sign-modal';

const copy = {
  heading: 'Firma a distancia',
  support:
    'Consentimientos enviados al paciente por email. Solo cuentan como completos cuando además firma el profesional.',
  send: 'Enviar a firmar',
  empty: 'Aún no se ha enviado ningún consentimiento a firmar a distancia.',
  loadError: 'No pudimos cargar los envíos a firmar.',
  loading: 'Cargando envíos a firmar',
  listLabel: 'Consentimientos enviados a firmar',
  sent: (when: string, to: string, by: string | null) =>
    by ? `Enviado el ${when} a ${to} por ${by}` : `Enviado el ${when} a ${to}`,
  signer: (name: string, guardian: boolean) =>
    guardian ? `Firma ${name}, responsable del paciente` : `Firma ${name}`,
  professional: (name: string) => `Profesional: ${name}`,
  expires: (when: string) => `Caduca el ${when}`,
  opened: (when: string) => `Abierto el ${when}`,
  verified: (when: string) => `Código verificado el ${when}`,
  attempts: (n: number) => (n === 1 ? '1 código incorrecto' : `${n} códigos incorrectos`),
  locked: (when: string) =>
    `Bloqueado el ${when} tras 5 códigos incorrectos: anúlalo y envía otro.`,
  signed: (when: string, ip: string | null) =>
    ip ? `Firmado por el paciente el ${when} desde la IP ${ip}` : `Firmado por el paciente el ${when}`,
  pendingProfessional: 'Falta la firma del profesional en la pestaña de consentimientos.',
  completed: (when: string) => `Completo: el profesional firmó el ${when}`,
  revoked: (when: string) => `Anulado el ${when}`,
  revoke: 'Anular enlace',
  revokeHint: (title: string) => ` de ${title}`,
  revokeError: 'No pudimos anular el enlace.',
  revokedToast: 'Enlace anulado: ya no sirve.',
  sentToast: (to: string) => `Enlace enviado a ${to}.`,
  notQueued:
    'La solicitud quedó registrada, pero el email no salió. Anúlala y envíala de nuevo.',
};

const BADGE: Record<
  SignatureRequest['status'],
  'secondary' | 'warning' | 'danger' | 'muted' | 'success'
> = {
  SENT: 'secondary',
  OPENED: 'secondary',
  LOCKED: 'danger',
  EXPIRED: 'muted',
  REVOKED: 'muted',
  SIGNED_BY_PATIENT: 'warning',
  COMPLETE: 'success',
};

function at(iso: string | null | undefined, clock: SedeClock | null): string {
  if (!iso) return NO_SEDE_FORMAT;
  return clock ? clock.fmt.dateTime(new Date(iso), clock.timeZone) : NO_SEDE_FORMAT;
}

/** Las líneas de evidencia de una solicitud, en orden de lo que pasó. */
function evidence(r: SignatureRequest, clock: SedeClock | null): string[] {
  const lines = [
    copy.sent(at(r.sentAt, clock), r.destinationMasked, r.sentByName),
    copy.signer(r.signerName, r.signerType === 'GUARDIAN'),
    copy.professional(r.professionalName),
  ];
  if (r.openedAt) lines.push(copy.opened(at(r.openedAt, clock)));
  if (r.verifiedAt) lines.push(copy.verified(at(r.verifiedAt, clock)));
  if (r.failedAttempts > 0 && r.status !== 'LOCKED') lines.push(copy.attempts(r.failedAttempts));
  if (r.status === 'LOCKED') lines.push(copy.locked(at(r.lockedAt, clock)));
  if (r.signedAt) lines.push(copy.signed(at(r.signedAt, clock), r.signedIpAddress));
  if (r.status === 'SIGNED_BY_PATIENT') lines.push(copy.pendingProfessional);
  if (r.countersignedAt) lines.push(copy.completed(at(r.countersignedAt, clock)));
  if (r.status === 'REVOKED') lines.push(copy.revoked(at(r.revokedAt, clock)));
  if (r.status === 'SENT' || r.status === 'OPENED' || r.status === 'EXPIRED') {
    lines.push(copy.expires(at(r.expiresAt, clock)));
  }
  return lines;
}

interface PatientSignatureRequestsSectionProps {
  token: string;
  patientId: string;
  /** Roles clínicos: pueden asociar un plan al enviar. */
  clinical: boolean;
  /** Cambia cuando la ficha sabe que algo cambió (p. ej. firmó el profesional). */
  refreshKey?: number;
}

/**
 * Bloque «Firma a distancia» de la pestaña de consentimientos (DX-243): el
 * botón «Enviar a firmar» y cada envío con su estado (Enviado · Abierto ·
 * Bloqueado · Firmado por paciente · Completo, o Caducado / Anulado) y sus
 * evidencias (destino enmascarado, horas en la zona y el formato de la sede,
 * intentos, IP de la firma). Lo ven los cuatro roles: recepción también envía
 * y ve si quedó bloqueado. Anular deja el enlace sin efecto.
 */
export function PatientSignatureRequestsSection({
  token,
  patientId,
  clinical,
  refreshKey = 0,
}: PatientSignatureRequestsSectionProps) {
  const ids = useId();
  const sede = useSedeClock(token);
  const screenClock = sede.status === 'ready' ? sede.clock : null;
  const [rows, setRows] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listSignatureRequests(token, patientId)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setError(null);
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
  }, [token, patientId, reloadKey, refreshKey]);

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      const updated = await revokeSignatureRequest(token, patientId, id);
      setRows((current) => current.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(copy.revokedToast);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.revokeError), { onRetry: () => void handleRevoke(id) });
    } finally {
      setRevoking(null);
    }
  }

  function handleSent(created: SignatureRequestCreated) {
    if (created.emailQueued) toast.success(copy.sentToast(created.destinationMasked));
    else toast.warning(copy.notQueued);
    // Un envío nuevo anula el anterior del mismo documento: se relee la lista.
    setReloadKey((k) => k + 1);
  }

  const clockOf = (locationId: string) => screenClock?.of(locationId) ?? screenClock;

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      data-testid="patient-signature-requests"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id={`${ids}-heading`} className="text-base font-semibold text-ink">
            {copy.heading}
          </h3>
          <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            setModalKey((k) => k + 1);
            setModalOpen(true);
          }}
        >
          <Send aria-hidden />
          {copy.send}
        </Button>
      </div>

      {loading ? (
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      ) : error ? (
        <SectionError
          description={error}
          className="py-8"
          onRetry={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : rows.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          {copy.empty}
        </p>
      ) : (
        <ul aria-label={copy.listLabel} className="flex flex-col divide-y divide-hairline">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{r.title}</span>
                  <Badge variant={BADGE[r.status]}>{SIGNATURE_STATUS_LABELS[r.status]}</Badge>
                </div>
                <ul className="flex flex-col gap-0.5 text-sm text-muted tabular-nums">
                  {evidence(r, clockOf(r.locationId)).map((line) => (
                    <li key={line} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              {canRevokeSignatureRequest(r.status) ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11 shrink-0 sm:min-h-9"
                  loading={revoking === r.id}
                  disabled={revoking !== null && revoking !== r.id}
                  onClick={() => void handleRevoke(r.id)}
                >
                  {copy.revoke}
                  <span className="sr-only">{copy.revokeHint(r.title)}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <SendToSignModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        patientId={patientId}
        canPickPlan={clinical}
        onSent={handleSent}
      />
    </section>
  );
}
