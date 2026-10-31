'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
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
import { formatDateTime } from '@/lib/format/date';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { ClinicalHistoryFields } from '@/components/clinical/clinical-history-fields';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  reviewed: (status: string, who: string | null, when: string | null) =>
    [status, who ? `por ${who}` : null, when ? `el ${when}` : null].filter(Boolean).join(' '),
};

type FlagKey = keyof typeof SAFETY_FLAG_LABELS;

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
            <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
              {copy.yes}
            </span>
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

  useEffect(() => {
    let cancelled = false;
    getAnamnesisReview(token, submissionId)
      .then((review) => {
        if (cancelled) return;
        setData(review);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 403 (otra sede o rol sin acceso) llega en español desde la API.
        setError(apiErrorMessage(err, { fallback: copy.loadError, byStatus: { 404: copy.notFound } }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, submissionId, reloadKey]);

  async function handleAccept() {
    setAccepting(true);
    setActionError(null);
    try {
      setResult(await acceptAnamnesis(token, submissionId));
    } catch (err) {
      setActionError(apiErrorMessage(err, copy.acceptError));
    } finally {
      setAccepting(false);
    }
  }

  async function handleAdjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdjusting(true);
    setAdjustError(null);
    try {
      setResult(await acceptAnamnesis(token, submissionId, adjusted));
      setAdjustOpen(false);
    } catch (err) {
      setAdjustError(apiErrorMessage(err, copy.acceptError));
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
      setResult(await rejectAnamnesis(token, submissionId, reason.trim()));
      setRejectOpen(false);
    } catch (err) {
      setRejectError(apiErrorMessage(err, copy.rejectError));
    } finally {
      setRejecting(false);
    }
  }

  const backLink = (
    <Link
      href="/anamnesis-por-revisar"
      className="mb-4 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden className="size-4" /> {copy.back}
    </Link>
  );

  if (loading) {
    return (
      <div className="flex flex-col">
        {backLink}
        <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col">
        {backLink}
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
  const pending = submission.status === 'SUBMITTED' && !result;
  const alerts = data.proposedFlags ? alertLines(data.proposedFlags.safetyFlags as SafetyFlags) : [];

  return (
    <div className="flex flex-col">
      {backLink}
      <PageHeader
        title={copy.title(name)}
        meta={
          <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted tabular-nums">
            {submission.submittedAt && (
              <p>{copy.submitted(formatDateTime(submission.submittedAt), submission.location.name)}</p>
            )}
            {submission.appointment && <p>{copy.appointment(formatDateTime(submission.appointment.start))}</p>}
          </div>
        }
      />

      {result ? (
        <div
          role="status"
          className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-6"
        >
          <p className="flex items-center gap-2 text-base font-semibold text-ink">
            <CheckCircle2 aria-hidden className="size-5 text-success" />
            {result.status === 'ACCEPTED' ? copy.acceptedTitle : copy.rejectedTitle}
          </p>
          {result.status === 'ACCEPTED' && <p className="text-sm text-muted">{copy.acceptedText}</p>}
          <Button asChild variant="secondary" className="mt-2 min-h-11 sm:min-h-10">
            <Link href={`/patients/${submission.patient.id}?tab=clinical-history`}>{copy.goToPatient}</Link>
          </Button>
        </div>
      ) : !pending ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-6">
          <Badge variant="muted">{SUBMISSION_STATUS_LABELS[submission.status]}</Badge>
          <p className="text-sm text-muted">
            {copy.reviewed(
              SUBMISSION_STATUS_LABELS[submission.status],
              submission.reviewedByName,
              submission.reviewedAt ? formatDateTime(submission.reviewedAt) : null,
            )}
          </p>
          {submission.rejectReason && <p className="text-sm text-ink">{submission.rejectReason}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby={`${ids}-alerts`}
            className={cn(
              'flex flex-col gap-2 rounded-xl border p-4 sm:p-6',
              alerts.length > 0 ? 'border-danger/40 bg-danger/5' : 'border-border bg-surface',
            )}
          >
            <h2 id={`${ids}-alerts`} className="flex items-center gap-2 text-base font-semibold text-ink">
              {alerts.length > 0 && <AlertTriangle aria-hidden className="size-5 text-danger" />}
              {alerts.length > 0 ? copy.alertsTitle : copy.noAlerts}
            </h2>
            {alerts.length > 0 && (
              <ul className="flex flex-wrap gap-2" data-testid="anamnesis-proposed-alerts">
                {alerts.map((line) => (
                  <li key={line}>
                    <Badge variant="danger">{line}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby={`${ids}-diff`}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 sm:p-6"
          >
            <h2 id={`${ids}-diff`} className="text-base font-semibold text-ink">
              {copy.diffTitle}
            </h2>
            <p className="text-sm text-muted tabular-nums">
              {data.currentVersion
                ? copy.diffAgainst(data.currentVersion.version, formatDateTime(data.currentVersion.createdAt))
                : copy.diffNoPrevious}
            </p>
            {data.diff && data.diff.entries.length > 0 ? (
              <ul className="divide-y divide-hairline">
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
      >
        <FormField htmlFor={`${ids}-reason`} label={copy.rejectReason} error={reasonError}>
          <textarea
            id={`${ids}-reason`}
            className={cn(fieldClass, 'min-h-24')}
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
