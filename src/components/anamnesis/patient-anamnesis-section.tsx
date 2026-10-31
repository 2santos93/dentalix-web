'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ClipboardList, NotebookPen } from 'lucide-react';
import {
  listPatientAnamnesisRequests,
  revokeAnamnesisRequest,
  type AnamnesisSubmission,
} from '@/lib/anamnesis/anamnesis-api';
import { formatDateTime } from '@/lib/format/date';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';
import { Callout } from '@/components/ui/callout';
import type { AnamnesisStatus } from '@/lib/clinical/medical-alerts';

const copy = {
  heading: 'Anamnesis del paciente',
  // Una sola frase para lo que antes se decía cuatro veces (chip, dos líneas y
  // la tarjeta): la cabecera lleva el chip «Sin anamnesis»; aquí, qué hacer.
  missingTitle: 'Sin anamnesis registrada',
  missingBody: 'Nadie ha preguntado todavía por alergias ni condiciones: regístrala antes de tratar.',
  send: 'Enviar anamnesis',
  register: 'Registrar en Historia clínica',
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
 * Bloque de anamnesis al principio de las pestañas «Datos» e «Historia
 * clínica» (DX-099, DX-247). Sustituye a la tarjeta y a las dos frases que
 * había encima de las pestañas:
 *
 * - Sin anamnesis: UN aviso (`Callout` de aviso) con «Enviar anamnesis» y
 *   «Registrar en Historia clínica».
 * - `reviewLine`: la línea de revisión (al día / caducada, «Sin cambios hoy»)
 *   que la página pasa donde toca.
 * - El estado de los cuestionarios por enlace: toda anamnesis aún por revisar
 *   («Anamnesis pendiente de revisión», aunque haya un enlace más nuevo) y el
 *   último enlace enviado. «Revisar», solo quien ve la bandeja (la API no le da
 *   las respuestas a recepción).
 *
 * «Enviar anamnesis» abre el diálogo de la página (`onSend`), el mismo que el
 * menú «⋯» de la cabecera. Sin nada que decir, no pinta nada.
 */
export function PatientAnamnesisSection({
  token,
  patientId,
  canReview,
  status = null,
  onSend,
  onRegister,
  reviewLine = null,
  refreshKey = 0,
}: {
  token: string;
  patientId: string;
  canReview: boolean;
  /** Estado de la anamnesis (banderas médicas); `null` mientras se comprueba o si falló. */
  status?: AnamnesisStatus | null;
  onSend: () => void;
  /** Lleva a la anamnesis de «Historia clínica»; sin él (recepción) no se ofrece. */
  onRegister?: () => void;
  reviewLine?: ReactNode;
  /** Sube al generar un enlace nuevo: se relee el estado. */
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<AnamnesisSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPatientAnamnesisRequests(token, patientId)
      .then((rows) => {
        if (cancelled) return;
        setRows(rows);
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

  const reload = () => setReloadKey((k) => k + 1);
  // Lo que se ve: toda anamnesis aún por revisar (un enlace más nuevo, esperando
  // o anulado, no la tapa) y, si es otro, el último enlace enviado.
  const pendingReview = rows.filter((r) => r.status === 'SUBMITTED');
  const visible = rows[0] && rows[0].status !== 'SUBMITTED' ? [...pendingReview, rows[0]] : pendingReview;

  async function handleRevoke(id: string) {
    setRevoking(true);
    try {
      const updated = await revokeAnamnesisRequest(token, id);
      setRows((current) => current.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.revokeError), { onRetry: () => void handleRevoke(id) });
    } finally {
      setRevoking(false);
    }
  }

  const missing = status === 'MISSING';
  // Mientras carga no se reserva hueco: el bloque aparece si hay algo que decir.
  const showRows = !loading && !error && visible.length > 0;
  if (!missing && !reviewLine && !showRows && !error) return null;

  return (
    <section
      aria-label={copy.heading}
      data-testid="patient-anamnesis-section"
      className="flex min-w-0 flex-col gap-3"
    >
      {missing ? (
        <Callout
          tone="warning"
          title={copy.missingTitle}
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onSend}>
                <ClipboardList aria-hidden /> {copy.send}
              </Button>
              {onRegister ? (
                <Button type="button" variant="ghost" size="sm" onClick={onRegister}>
                  <NotebookPen aria-hidden /> {copy.register}
                </Button>
              ) : null}
            </div>
          }
        >
          {copy.missingBody}
        </Callout>
      ) : null}
      {reviewLine}
      {error ? (
        <SectionError
          description={error}
          className="py-4"
          onRetry={() => {
            setLoading(true);
            setError(null);
            reload();
          }}
        />
      ) : showRows ? (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {visible.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <StatusBadge kind="anamnesisSubmission" status={item.status} />
                {detail(item) && <p className="text-sm text-muted tabular-nums">{detail(item)}</p>}
              </div>
              {item.status === 'SUBMITTED' && canReview && (
                <Button asChild variant="secondary" size="sm" className="self-start sm:self-auto">
                  <Link href={`/anamnesis-por-revisar/${item.id}`}>{copy.review}</Link>
                </Button>
              )}
              {item.status === 'PENDING_PATIENT' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start sm:self-auto"
                  loading={revoking}
                  onClick={() => void handleRevoke(item.id)}
                >
                  {copy.revoke}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
