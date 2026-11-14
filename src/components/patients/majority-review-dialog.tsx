'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import {
  getMajorityReview,
  MAJORITY_REVIEW_NOTE_MAX,
  submitMajorityReview,
  type MajorityReviewDecision,
  type MajorityReviewView,
} from '@/lib/patients/majority-review-api';
import { RELATIONSHIP_LABELS } from '@/lib/patients/responsible-parties-api';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RESPONSIBLES_ANCHOR } from './data-section';


export const majorityReviewCopy = {
  title: 'Revisar a quién van sus avisos',
  description: (name: string, date: string) =>
    `${name} cumplió la mayoría de edad el ${date}. Mientras no lo revises, sus avisos y recibos no van a su responsable.`,
  descriptionNoDate: (name: string) =>
    `${name} cumplió la mayoría de edad. Mientras no lo revises, sus avisos y recibos no van a su responsable.`,
  loading: 'Cargando la revisión…',
  loadError: 'No pudimos cargar los responsables del paciente.',
  responsiblesHeading: 'Responsables registrados',
  responsiblesListLabel: 'Responsables del paciente',
  noResponsibles: 'No tiene responsables registrados.',
  receivesNotices: 'Recibe avisos',
  payer: 'Pagador',
  editResponsibles: 'Editar responsables en la ficha',
  legend: '¿A quién van sus avisos y recibos desde ahora?',
  patientSelfTitle: 'El paciente gestiona sus avisos',
  patientSelfDescription:
    'Los recordatorios, avisos y recibos le llegan a él, a su email o móvil. Su responsable sigue registrado, pero ya no los recibe.',
  keepTitle: 'Mantener al responsable como destino',
  keepDescription:
    'Elige esta opción solo si el paciente está de acuerdo: todo sigue llegando a su responsable, como cuando era menor.',
  decisionRequired: 'Elige a quién van sus avisos.',
  note: 'Nota (opcional)',
  noteHint: 'Por ejemplo, con quién lo hablaste. Queda en el registro de la revisión.',
  counter: (n: number) => `${n}/${MAJORITY_REVIEW_NOTE_MAX}`,
  noteTooLong: `La nota admite hasta ${MAJORITY_REVIEW_NOTE_MAX} caracteres.`,
  submit: 'Guardar revisión',
  saveError: 'No pudimos guardar la revisión. Intenta de nuevo.',
  saved: (name: string) => `Revisión guardada: ${name}.`,
  reviewedBy: (name: string, when: string) => `Revisado por ${name} el ${when}.`,
  reviewedNoName: (when: string) => `Revisado el ${when}.`,
  reviewedDecision: (decision: MajorityReviewDecision) =>
    decision === 'PATIENT_SELF'
      ? 'Decisión: el paciente gestiona sus avisos.'
      : 'Decisión: sus avisos siguen yendo al responsable.',
  reviewedAgain: 'Puedes cambiar la decisión: queda registrada como una revisión nueva.',
  notApplicable: 'Este paciente no tiene una revisión de mayoría de edad pendiente.',
};
const copy = majorityReviewCopy;

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; view: MajorityReviewView };

interface MajorityReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  patientName: string;
  /** Pinta la fecha de mayoría de edad y la de la revisión con el formato de la sede. */
  stamp: SedePainters;
  /** Tras guardar: quien abre refresca su aviso o su lista. */
  onReviewed: (view: MajorityReviewView) => void;
}

/**
 * DX-342: la revisión del paso a la mayoría de edad. Lee los responsables del
 * paciente (`GET /patients/:id/majority-review`), explica las dos salidas y
 * guarda la decisión (`POST`). Si ya se revisó, dice quién y cuándo, y deja
 * cambiarla. Un 409/422/403 de la API se dice arriba del formulario con su
 * mensaje en español.
 */
export function MajorityReviewDialog({
  open,
  onOpenChange,
  token,
  patientId,
  patientName,
  stamp,
  onReviewed,
}: MajorityReviewDialogProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [decision, setDecision] = useState<MajorityReviewDecision | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ decision?: string; note?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cada apertura empieza en blanco y vuelve a leer.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLoad({ status: 'loading' });
      setDecision('');
      setNote('');
      setErrors({});
      setSubmitError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMajorityReview(token, patientId)
      .then((view) => {
        if (cancelled) return;
        setLoad({ status: 'ready', view });
        setDecision((d) => d || view.decision || '');
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: apiErrorMessage(err, { fallback: copy.loadError }) });
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, reloadKey]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = note.trim();
    const next: typeof errors = {};
    if (!decision) next.decision = copy.decisionRequired;
    if (trimmed.length > MAJORITY_REVIEW_NOTE_MAX) next.note = copy.noteTooLong;
    setErrors(next);
    if (Object.keys(next).length > 0 || !decision) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const view = await submitMajorityReview(token, patientId, {
        decision,
        ...(trimmed ? { note: trimmed } : {}),
      });
      toast.success(copy.saved(patientName));
      onReviewed(view);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSubmitting(false);
    }
  }

  const view = load.status === 'ready' ? load.view : null;
  const majorityDay = view?.majorityDate ? stamp.maybe.civilDate(view.majorityDate) : null;
  const length = note.trim().length;
  const canSubmit = !!view && view.status !== 'NOT_APPLICABLE';

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={majorityDay ? copy.description(patientName, majorityDay) : copy.descriptionNoDate(patientName)}
      onSubmit={(e) => void submit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      submitBusy={load.status === 'loading'}
      hideSubmit={load.status === 'error' || (!!view && !canSubmit)}
      error={submitError}
      touchTargets
      ownValidation
    >
      {load.status === 'loading' ? (
        <div role="status" className="flex flex-col gap-2" data-testid="majority-review-loading">
          <span className="sr-only">{copy.loading}</span>
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : load.status === 'error' ? (
        <SectionError
          description={load.message}
          onRetry={() => {
            setLoad({ status: 'loading' });
            setReloadKey((k) => k + 1);
          }}
          className="py-8"
        />
      ) : view ? (
        <>
          {view.status === 'REVIEWED' && view.reviewedAt ? (
            <Callout tone="success" data-testid="majority-review-reviewed">
              <p>
                {view.reviewedByName
                  ? copy.reviewedBy(view.reviewedByName, stamp.dateTime(view.reviewedAt))
                  : copy.reviewedNoName(stamp.dateTime(view.reviewedAt))}{' '}
                {view.decision ? copy.reviewedDecision(view.decision) : null}
              </p>
              <p className="text-muted">{copy.reviewedAgain}</p>
            </Callout>
          ) : null}
          {view.status === 'NOT_APPLICABLE' ? <Callout tone="neutral">{copy.notApplicable}</Callout> : null}

          <section aria-labelledby="mr-responsibles-heading" className="flex flex-col gap-2">
            <h3 id="mr-responsibles-heading" className="t-label text-ink">
              {copy.responsiblesHeading}
            </h3>
            {view.responsibles.length === 0 ? (
              <p className="text-sm text-muted">{copy.noResponsibles}</p>
            ) : (
              <ul
                aria-label={copy.responsiblesListLabel}
                className="divide-y divide-border-subtle rounded-lg border border-border"
              >
                {view.responsibles.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-3 py-2.5" data-testid="majority-review-responsible">
                    <span className="min-w-0 break-words text-sm">
                      <span className="font-medium text-ink">{r.name}</span>
                      <span className="text-muted"> · {RELATIONSHIP_LABELS[r.relationship] ?? r.relationship}</span>
                    </span>
                    {r.receivesNotices || r.isPayer ? (
                      <span className="flex flex-wrap gap-1.5">
                        {r.receivesNotices ? <Badge variant="neutral">{copy.receivesNotices}</Badge> : null}
                        {r.isPayer ? <Badge variant="neutral">{copy.payer}</Badge> : null}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/patients/${encodeURIComponent(patientId)}?tab=data#${RESPONSIBLES_ANCHOR}`}
              onClick={() => onOpenChange(false)}
              className="inline-flex w-fit items-center rounded-sm text-sm font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-sm:min-h-11"
            >
              {copy.editResponsibles}
            </Link>
          </section>

          {canSubmit ? (
            <>
              <RadioGroup
                id="mr-decision"
                legend={copy.legend}
                value={decision}
                onValueChange={(v) => {
                  setDecision(v as MajorityReviewDecision);
                  setErrors((prev) => ({ ...prev, decision: undefined }));
                }}
                error={errors.decision}
                optionsClassName="flex flex-col gap-2"
              >
                <RadioCard
                  id="mr-decision"
                  value="PATIENT_SELF"
                  title={copy.patientSelfTitle}
                  description={copy.patientSelfDescription}
                />
                <RadioCard value="KEEP_RESPONSIBLE" title={copy.keepTitle} description={copy.keepDescription} />
              </RadioGroup>

              <FormField htmlFor="mr-note" label={copy.note} hint={copy.noteHint} error={errors.note}>
                <Textarea
                  id="mr-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  autoGrow
                  aria-invalid={errors.note ? true : undefined}
                  aria-describedby={cn('mr-note-counter', errors.note && fieldErrorId('mr-note'))}
                />
                <p
                  id="mr-note-counter"
                  className={cn(
                    'text-right text-xs tabular-nums',
                    length > MAJORITY_REVIEW_NOTE_MAX ? 'text-danger-text' : 'text-muted',
                  )}
                >
                  {copy.counter(length)}
                </p>
              </FormField>
            </>
          ) : null}
        </>
      ) : null}
    </FormModal>
  );
}
