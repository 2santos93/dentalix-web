'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  SUBMISSION_STATUS_LABELS,
  listPatientAnamnesisRequests,
  revokeAnamnesisRequest,
  type AnamnesisSubmission,
} from '@/lib/anamnesis/anamnesis-api';
import { formatDateTime } from '@/lib/format/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';
import { AnamnesisLinkPanel } from './anamnesis-link-panel';

const copy = {
  heading: 'Anamnesis del paciente',
  loadError: 'No pudimos cargar el estado de la anamnesis por enlace.',
  pending: (when: string) => `Recibida el ${when}. La historia clínica no cambia hasta que un odontólogo la acepte.`,
  waiting: (when: string) => `Enlace enviado; caduca el ${when}.`,
  accepted: (who: string | null, when: string) =>
    who ? `Aceptada por ${who} el ${when}.` : `Aceptada el ${when}.`,
  rejected: (reason: string | null) => (reason ? `Rechazada: ${reason}` : 'Rechazada.'),
  review: 'Revisar',
  revoke: 'Anular enlace',
  revoked: 'Enlace anulado.',
  revokeError: 'No pudimos anular el enlace.',
};

const BADGE: Record<AnamnesisSubmission['status'], 'warning' | 'muted' | 'success' | 'danger' | 'secondary'> = {
  SUBMITTED: 'warning',
  PENDING_PATIENT: 'secondary',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'muted',
};

function detail(s: AnamnesisSubmission): string | null {
  switch (s.status) {
    case 'SUBMITTED':
      return s.submittedAt ? copy.pending(formatDateTime(s.submittedAt)) : null;
    case 'PENDING_PATIENT':
      return copy.waiting(formatDateTime(s.expiresAt));
    case 'ACCEPTED':
      return s.reviewedAt ? copy.accepted(s.reviewedByName, formatDateTime(s.reviewedAt)) : null;
    case 'REJECTED':
      return copy.rejected(s.rejectReason);
    default:
      return null;
  }
}

/**
 * Bloque de la ficha (DX-099): el estado del último cuestionario enviado por
 * enlace («Anamnesis pendiente de revisión», esperando al paciente…) y
 * «Enviar anamnesis». Lo ven los cuatro roles; «Revisar» solo quien ve la
 * bandeja (la API no le da las respuestas a recepción).
 */
export function PatientAnamnesisSection({
  token,
  patientId,
  canReview,
}: {
  token: string;
  patientId: string;
  canReview: boolean;
}) {
  const ids = useId();
  const [latest, setLatest] = useState<AnamnesisSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPatientAnamnesisRequests(token, patientId)
      .then((rows) => {
        if (cancelled) return;
        setLatest(rows[0] ?? null);
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
  }, [token, patientId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function handleRevoke(id: string) {
    setRevoking(true);
    try {
      setLatest(await revokeAnamnesisRequest(token, id));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.revokeError), { onRetry: () => void handleRevoke(id) });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      data-testid="patient-anamnesis-section"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      <h2 id={`${ids}-heading`} className="text-base font-semibold text-ink">
        {copy.heading}
      </h2>
      {loading ? (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      ) : error ? (
        <SectionError
          description={error}
          className="py-8"
          onRetry={() => {
            setLoading(true);
            reload();
          }}
        />
      ) : latest ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <Badge variant={BADGE[latest.status]} className="self-start">
              {SUBMISSION_STATUS_LABELS[latest.status]}
            </Badge>
            {detail(latest) && <p className="text-sm text-muted tabular-nums">{detail(latest)}</p>}
          </div>
          {latest.status === 'SUBMITTED' && canReview && (
            <Button asChild variant="secondary" className="min-h-11 sm:min-h-10">
              <Link href={`/anamnesis-por-revisar/${latest.id}`}>{copy.review}</Link>
            </Button>
          )}
          {latest.status === 'PENDING_PATIENT' && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 sm:min-h-10"
              loading={revoking}
              onClick={() => void handleRevoke(latest.id)}
            >
              {copy.revoke}
            </Button>
          )}
        </div>
      ) : null}
      <AnamnesisLinkPanel token={token} patientId={patientId} onCreated={reload} />
    </section>
  );
}
