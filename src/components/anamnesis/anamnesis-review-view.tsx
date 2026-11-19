'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/api-error';
import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';
import {
  SUBMISSION_STATUS_LABELS,
  acceptAnamnesis,
  getAnamnesisReview,
  rejectAnamnesis,
  type AnamnesisReview,
  type AnamnesisSubmission,
  type HistoryDiffEntry,
} from '@/lib/anamnesis/anamnesis-api';
import { SAFETY_FLAG_LABELS } from '@/lib/clinical/medical-alerts';
import type { ClinicalHistoryValue, SafetyFlags } from '@/lib/clinical/clinical-types';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { ClinicalHistoryFields } from '@/components/clinical/clinical-history-fields';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout } from '@/components/ui/callout';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { CONDITION_UNANSWERED_LABEL } from '@/lib/clinical/clinical-types';

const copy = {
  back: 'Anamnesis por revisar',
  title: (name: string) => `Anamnesis de ${name}`,
  loadingTitle: 'Anamnesis',
  submitted: (when: string, location: string) => `Enviada por el paciente el ${when} · ${location}`,
  appointment: (when: string) => `Para la cita del ${when}`,
  loadError: 'No pudimos cargar la anamnesis.',
  notFound: 'No encontramos esta anamnesis: puede que sea de otra clínica o que el enlace esté mal.',
  alertsTitle: 'Al aceptar, la ficha tendrá estas alertas',
  noAlerts: 'Al aceptar, la ficha no tendrá alertas médicas.',
  diffTitle: 'Cambios frente a la versión vigente',
  diffAgainst: (v: number, when: string) => `Comparado con la versión ${v}, del ${when}. Los «Sí» primero.`,
  diffNoPrevious: 'El paciente no tenía anamnesis: todo aparece como nuevo. Los «Sí» primero.',
  noChanges: 'Lo que contestó coincide con la versión vigente.',
  unchanged: (n: number) => (n === 1 ? '1 dato sin cambios.' : `${n} datos sin cambios.`),
  change: { ADDED: 'Nuevo', REMOVED: 'Quitado', CHANGED: 'Cambiado' } as Record<string, string>,
  section: {
    ALLERGIES: 'Alergia',
    CONDITIONS: 'Enfermedad',
    MEDICATIONS: 'Medicamento',
    HABITS: 'Hábito',
    PREGNANCY: 'Embarazo',
    SURGERIES: 'Cirugía',
  } as Record<string, string>,
  before: 'Antes',
  after: 'Ahora',
  yes: 'Sí',
  accept: 'Aceptar',
  adjust: 'Ajustar y aceptar',
  reject: 'Rechazar',
  acceptHint: 'Aceptar crea una versión nueva de la historia clínica con tu nombre y origen «formulario del paciente».',
  reviewOnly: 'Solo un odontólogo o un administrador puede aceptar o rechazar la anamnesis.',
  acceptError: 'No pudimos aceptar la anamnesis.',
  adjustTitle: 'Ajustar antes de aceptar',
  adjustDescription: 'Corrige lo que haga falta: se guardará esto, no lo que envió el paciente tal cual.',
  adjustSubmit: 'Aceptar con ajustes',
  rejectTitle: 'Rechazar la anamnesis',
  rejectDescription: 'La historia clínica no cambia. El motivo queda en el envío.',
  rejectReason: 'Motivo',
  rejectReasonError: 'Escribe el motivo (al menos 3 caracteres).',
  rejectError: 'No pudimos rechazar la anamnesis.',
  acceptedTitle: 'Anamnesis aceptada',
  acceptedText: 'La versión nueva ya está en la historia clínica y las alertas en la agenda.',
  rejectedTitle: 'Anamnesis rechazada',
  goToPatient: 'Ir a la ficha',
  // DX-298 (FE-072): otra persona la revisó antes (409).
  conflictTitle: 'Esta anamnesis ya no está por revisar',
  conflictFallback: 'Otra persona la revisó mientras la tenías abierta. Esto es lo que quedó.',
  refreshing: 'Cargando el estado actual…',
  reviewed: (status: string, who: string | null, when: string | null) =>
    [status, who ? `por ${who}` : null, when ? `el ${when}` : null].filter(Boolean).join(' '),
};

type FlagKey = keyof typeof SAFETY_FLAG_LABELS;

/** Anillo de foco del bloque de resultado (recibe el foco por programa). */
const OUTCOME_FOCUS =
  'rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text';

/** Ya revisada: estado, quién y cuándo (y el motivo, si se rechazó). */
function ReviewedSummary({
  submission,
  stamp,
}: {
  submission: AnamnesisSubmission;
  stamp: ReturnType<typeof useSedeStamp>;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <StatusBadge kind="anamnesisSubmission" status={submission.status} />
      <p className="text-sm text-muted">
        {copy.reviewed(
          SUBMISSION_STATUS_LABELS[submission.status],
          submission.reviewedByName,
          submission.reviewedAt ? stamp.dateTime(submission.reviewedAt, submission.location.id) : null,
        )}
      </p>
      {submission.rejectReason && <p className="text-sm text-ink">{submission.rejectReason}</p>}
    </div>
  );
}

function alertLines(flags: SafetyFlags): string[] {
  return (Object.keys(SAFETY_FLAG_LABELS) as FlagKey[])
    .filter((key) => flags[key] === true)
    .map((key) => SAFETY_FLAG_LABELS[key]);
}

function DiffRow({ entry }: { entry: HistoryDiffEntry }) {
  return (
    <li data-testid="anamnesis-diff-entry" className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex shrink-0 items-center gap-2 sm:w-48">
        <Badge variant={entry.change === 'REMOVED' ? 'muted' : entry.change === 'ADDED' ? 'warning' : 'secondary'}>
          {copy.change[entry.change]}
        </Badge>
        <span className="t-label text-muted">{copy.section[entry.section]}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="break-words font-medium text-ink">
          {entry.label}
          {entry.affirmative && (
            <Badge variant="danger" className="ml-2 align-middle">
              {copy.yes}
            </Badge>
          )}
        </p>
        <p className="break-words text-sm text-muted">
          {entry.before !== null && (
            <span className={cn(entry.after !== null && 'line-through')}>
              <span className="sr-only">{copy.before}: </span>
              {entry.before}
            </span>
          )}
          {entry.before !== null && entry.after !== null && <span aria-hidden> → </span>}
          {entry.after !== null && (
            // «Sin responder» (condición que la versión no recoge) va atenuado:
            // no es un hallazgo, es la falta de uno.
            <span className={entry.after === CONDITION_UNANSWERED_LABEL ? 'text-muted' : 'text-ink'}>
              <span className="sr-only">{copy.after}: </span>
              {entry.after}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

/**
 * Revisión de una anamnesis enviada por enlace (DX-099): diferencias frente a
 * la versión vigente (añadido, quitado, cambiado; los «Sí» primero), las
 * alertas que tendrá la ficha y las acciones. Aceptar y rechazar solo para
 * ADMIN y DENTIST (`canReview`): la asistente la ve sin botones.
 */
export function AnamnesisReviewView({
  token,
  submissionId,
  canReview,
}: {
  token: string;
  submissionId: string;
  canReview: boolean;
}) {
  const ids = useId();
  const [data, setData] = useState<AnamnesisReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<AnamnesisSubmission | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjusted, setAdjusted] = useState<ClinicalHistoryValue>({});
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  // DX-298: un 409 (ya revisada) relee la revisión; mientras, sin acciones.
  const [conflict, setConflict] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const conflictRef = useRef<string | null>(null);
  const showConflict = (message: string | null) => {
    conflictRef.current = message;
    setConflict(message);
  };
  // El bloque de resultado (o el aviso del 409) recibe el foco: el botón pulsado ya no existe.
  const outcomeRef = useRef<HTMLDivElement>(null);
  // La solicitud y su cita se pintan con el reloj de SU sede; la versión de la historia no trae sede (la de la pantalla).
  const stamp = useSedeStamp(token, [data?.submission.location.id]);

  useEffect(() => {
    let cancelled = false;
    getAnamnesisReview(token, submissionId)
      .then((review) => {
        if (cancelled) return;
        setData(review);
        setError(null);
        // Tras un 409, si la API dice que sigue por revisar, no era «ya revisada»:
        // el aviso pasa a error de la acción y vuelven los botones.
        const pendingConflict = conflictRef.current;
        if (pendingConflict !== null && review.submission.status === 'SUBMITTED') {
          setActionError(pendingConflict);
          showConflict(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 403 (otra sede o rol sin acceso) llega en español desde la API.
        setError(apiErrorMessage(err, { fallback: copy.loadError, byStatus: { 404: copy.notFound } }));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, submissionId, reloadKey]);

  useEffect(() => {
    if (result || conflict) outcomeRef.current?.focus();
  }, [result, conflict]);

  /** La bandeja y su contador del menú releen (DX-298, FE-073). */
  function announceReviewed() {
    window.dispatchEvent(new Event(WORK_QUEUES_CHANGED_EVENT));
  }

  function done(submission: AnamnesisSubmission) {
    setResult(submission);
    announceReviewed();
  }

  /** `true` si era un 409: se cierran los diálogos y se relee la revisión. */
  function handleConflict(err: unknown): boolean {
    if (!(err instanceof ApiError) || err.status !== 409) return false;
    setAdjustOpen(false);
    setRejectOpen(false);
    setActionError(null);
    showConflict(apiErrorMessage(err, copy.conflictFallback));
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    announceReviewed();
    return true;
  }

  async function handleAccept() {
    setAccepting(true);
    setActionError(null);
    try {
      done(await acceptAnamnesis(token, submissionId));
    } catch (err) {
      if (!handleConflict(err)) setActionError(apiErrorMessage(err, copy.acceptError));
    } finally {
      setAccepting(false);
    }
  }

  async function handleAdjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdjusting(true);
    setAdjustError(null);
    try {
      done(await acceptAnamnesis(token, submissionId, adjusted));
      setAdjustOpen(false);
    } catch (err) {
      if (!handleConflict(err)) setAdjustError(apiErrorMessage(err, copy.acceptError));
    } finally {
      setAdjusting(false);
    }
  }

  async function handleReject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setReasonError(copy.rejectReasonError);
      return;
    }
    setRejecting(true);
    setRejectError(null);
    try {
      done(await rejectAnamnesis(token, submissionId, reason.trim()));
      setRejectOpen(false);
    } catch (err) {
      if (!handleConflict(err)) setRejectError(apiErrorMessage(err, copy.rejectError));
    } finally {
      setRejecting(false);
    }
  }

  // FE-075 (3): el «volver» común de la app (`PageHeader back`), no un enlace propio.
  const back = { href: '/anamnesis-por-revisar', label: copy.back };

  /** Al cerrar un diálogo tras revisar, el foco va al resultado y no a `<body>`. */
  const focusOutcome = (event: Event) => {
    if (!outcomeRef.current) return;
    event.preventDefault();
    outcomeRef.current.focus();
  };

  if (loading) {
    return (
      <div className="flex flex-col">
        <PageHeader title={copy.loadingTitle} back={back} />
        <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col">
        <PageHeader title={copy.loadingTitle} back={back} />
        <SectionError
          description={error ?? copy.loadError}
          onRetry={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      </div>
    );
  }

  const { submission } = data;
  const name = submission.patient.fullName;
  const pending = submission.status === 'SUBMITTED' && !result && !conflict;
  const alerts = data.proposedFlags ? alertLines(data.proposedFlags.safetyFlags as SafetyFlags) : [];

  return (
    <div className="flex flex-col">
      <PageHeader
        back={back}
        title={copy.title(name)}
        meta={
          <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted tabular-nums">
            {submission.submittedAt && (
              <p>{copy.submitted(stamp.dateTime(submission.submittedAt, submission.location.id), submission.location.name)}</p>
            )}
            {submission.appointment && <p>{copy.appointment(stamp.dateTime(submission.appointment.start, submission.location.id))}</p>}
          </div>
        }
      />
      <SedeStampNote stamp={stamp} className="mb-4" />

      {result ? (
        <div ref={outcomeRef} tabIndex={-1} data-testid="anamnesis-review-outcome" className={OUTCOME_FOCUS}>
          <Callout
            tone="success"
            role="status"
            title={result.status === 'ACCEPTED' ? copy.acceptedTitle : copy.rejectedTitle}
            action={
              <Button asChild variant="secondary" className="min-h-11 sm:min-h-10">
                <Link href={`/patients/${submission.patient.id}?tab=clinical-history`}>{copy.goToPatient}</Link>
              </Button>
            }
          >
            {result.status === 'ACCEPTED' ? copy.acceptedText : null}
          </Callout>
        </div>
      ) : conflict ? (
        <div
          ref={outcomeRef}
          tabIndex={-1}
          data-testid="anamnesis-review-outcome"
          className={cn(OUTCOME_FOCUS, 'flex flex-col gap-4')}
        >
          <Callout tone="warning" role="status" title={copy.conflictTitle}>
            {conflict}
          </Callout>
          {refreshing ? (
            <p role="status" className="text-sm text-muted">
              {copy.refreshing}
            </p>
          ) : (
            <ReviewedSummary submission={submission} stamp={stamp} />
          )}
        </div>
      ) : !pending ? (
        <ReviewedSummary submission={submission} stamp={stamp} />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Lo que la ficha va a avisar si se acepta: el aviso de la pantalla. */}
          <Callout
            tone={alerts.length > 0 ? 'danger' : 'neutral'}
            role="status"
            title={alerts.length > 0 ? copy.alertsTitle : copy.noAlerts}
            titleAs="h2"
          >
            {alerts.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-2" data-testid="anamnesis-proposed-alerts">
                {alerts.map((line) => (
                  <li key={line}>
                    <Badge variant="danger">{line}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Callout>

          <section
            aria-labelledby={`${ids}-diff`}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:p-6"
          >
            <SectionHeader
              titleId={`${ids}-diff`}
              title={copy.diffTitle}
              description={
                <span className="tabular-nums">
                  {data.currentVersion
                    ? copy.diffAgainst(data.currentVersion.version, stamp.dateTime(data.currentVersion.createdAt))
                    : copy.diffNoPrevious}
                </span>
              }
            />
            {data.diff && data.diff.entries.length > 0 ? (
              <ul className="divide-y divide-border-subtle">
                {data.diff.entries.map((entry, i) => (
                  <DiffRow key={`${entry.section}-${entry.label}-${i}`} entry={entry} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink">{copy.noChanges}</p>
            )}
            {data.diff && data.diff.unchangedCount > 0 && (
              <p className="text-xs text-muted">{copy.unchanged(data.diff.unchangedCount)}</p>
            )}
          </section>

          {canReview ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">{copy.acceptHint}</p>
              {actionError && <InlineError variant="summary">{actionError}</InlineError>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  loading={accepting}
                  onClick={() => void handleAccept()}
                  className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                >
                  {copy.accept}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={accepting}
                  className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                  onClick={() => {
                    setAdjusted((data.proposed ?? {}) as ClinicalHistoryValue);
                    setAdjustError(null);
                    setAdjustOpen(true);
                  }}
                >
                  {copy.adjust}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={accepting}
                  className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                  onClick={() => {
                    setReason('');
                    setReasonError(null);
                    setRejectError(null);
                    setRejectOpen(true);
                  }}
                >
                  {copy.reject}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{copy.reviewOnly}</p>
          )}
        </div>
      )}

      <FormModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        title={copy.adjustTitle}
        description={copy.adjustDescription}
        onSubmit={handleAdjust}
        submitLabel={copy.adjustSubmit}
        submitting={adjusting}
        error={adjustError}
        size="lg"
        onCloseAutoFocus={focusOutcome}
      >
        <ClinicalHistoryFields value={adjusted} onChange={setAdjusted} />
      </FormModal>

      <FormModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={copy.rejectTitle}
        description={copy.rejectDescription}
        onSubmit={handleReject}
        submitLabel={copy.reject}
        submitting={rejecting}
        error={rejectError}
        destructive
        onCloseAutoFocus={focusOutcome}
      >
        <FormField htmlFor={`${ids}-reason`} label={copy.rejectReason} error={reasonError}>
          <Textarea
            id={`${ids}-reason`}
            value={reason}
            maxLength={500}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? fieldErrorId(`${ids}-reason`) : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(null);
            }}
          />
        </FormField>
      </FormModal>
    </div>
  );
}
