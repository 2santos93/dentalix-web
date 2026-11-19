'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getMovementCandidates,
  matchMovement,
  type BankMatch,
  type BankMovement,
  type CandidatePayment,
  type CandidateReport,
  type MovementCandidates,
} from '@/lib/bank-reconciliation/bank-reconciliation-api';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { FormModal } from '@/components/shared/form-modal';
import { SectionError } from '@/components/errors/section-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';

export const candidatesCopy = {
  title: 'Emparejar con un abono',
  description:
    'Abonos sin emparejar de los medios de esta cuenta, y pagos que reportaron los pacientes y aún esperan confirmación. Elige el que corresponde a este movimiento.',
  movement: 'Movimiento del banco',
  date: 'Fecha',
  reference: 'Referencia',
  amount: 'Importe',
  noReference: 'Sin referencia',
  legend: 'Abono o pago reportado',
  payments: 'Abonos registrados',
  reports: 'Pagos reportados por confirmar',
  sameReference: 'Misma referencia',
  receipt: (n: string) => `Recibo ${n}`,
  reported: 'Por confirmar',
  loadError: 'No pudimos cargar los abonos candidatos.',
  none: 'Ningún abono ni pago reportado casa con este movimiento (misma referencia o mismo importe, ±15 días).',
  register: 'Registrar abono',
  choose: 'Elige un abono o un pago reportado.',
  submitPayment: 'Emparejar',
  submitReport: 'Confirmar el pago reportado',
  genericError: 'No pudimos emparejar el movimiento. Intenta de nuevo.',
};
const copy = candidatesCopy;

interface MovementCandidatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  movement: BankMovement;
  stamp: SedeStamp;
  onMatched: (match: BankMatch) => void;
  /** Un reporte pendiente: el padre abre su confirmación y empareja el abono que crea. */
  onConfirmReport: (report: CandidateReport) => void;
  /** Ningún candidato sirve: registrar el abono del movimiento. */
  onRegister: () => void;
}

/**
 * DX-571: «Emparejar con un abono…» de un movimiento sin abono. Lista los
 * candidatos que da la API (abonos vivos sin emparejar y reportes de pago
 * pendientes de DX-569, la misma referencia primero) como tarjetas de una
 * sola elección; elegir un abono lo empareja, elegir un reporte lo confirma
 * antes (con el modal de la bandeja) y luego empareja el abono creado.
 */
export function MovementCandidatesModal({
  open,
  onOpenChange,
  token,
  movement,
  stamp,
  onMatched,
  onConfirmReport,
  onRegister,
}: MovementCandidatesModalProps) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: number; data: MovementCandidates | null; error: string | null } | null>(
    null,
  );
  const [choice, setChoice] = useState('');
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMovementCandidates(token, movement.id)
      .then((data) => {
        if (!cancelled) setResult({ key: attempt, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key: attempt, data: null, error: apiErrorMessage(err, copy.loadError) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, movement.id, open, attempt]);

  const loading = result?.key !== attempt;
  const data = !loading ? (result?.data ?? null) : null;
  const payments = data?.payments ?? [];
  const reports = data?.reports ?? [];
  const chosenReport = choice.startsWith('rep:') ? (reports.find((r) => `rep:${r.id}` === choice) ?? null) : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!choice) {
      setChoiceError(copy.choose);
      return;
    }
    if (chosenReport) {
      onConfirmReport(chosenReport);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onMatched(await matchMovement(token, movement.id, choice.slice('pay:'.length)));
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const paymentTitle = (p: CandidatePayment) =>
    `${p.patient.fullName} · ${stamp.money(p.collectedAmount, p.currency, p.location.id)}`;
  const paymentLine = (p: CandidatePayment) =>
    [
      stamp.civilDate(p.paidOn, p.location.id),
      p.paymentMethod?.name ?? null,
      p.reference ?? copy.noReference,
      p.receiptNumber ? copy.receipt(p.receiptNumber) : null,
    ]
      .filter((part): part is string => Boolean(part))
      // Cada dato entero en su línea: «Recibo PRI-000002» no se parte por el guion.
      .map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 ? ' · ' : null}
          <span className="whitespace-nowrap">{part}</span>
        </React.Fragment>
      ));

  const empty = !loading && !result?.error && payments.length === 0 && reports.length === 0;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={chosenReport ? copy.submitReport : copy.submitPayment}
      submitting={submitting}
      hideSubmit={loading || Boolean(result?.error) || empty}
      error={error}
      size="lg"
      touchTargets
    >
      <section aria-label={copy.movement} className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <p className="t-overline mb-2">{copy.movement}</p>
        <DescriptionList columns={3}>
          <DescriptionItem label={copy.date} numeric>
            {stamp.civilDate(movement.bookedOn)}
          </DescriptionItem>
          <DescriptionItem label={copy.reference}>
            <span className="font-mono">{movement.reference ?? copy.noReference}</span>
          </DescriptionItem>
          <DescriptionItem label={copy.amount} numeric>
            {stamp.money(movement.amount, movement.currency)}
          </DescriptionItem>
        </DescriptionList>
      </section>

      {loading ? (
        <div role="status" aria-label={copy.legend} className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : result?.error ? (
        <SectionError description={result.error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : empty ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{copy.none}</p>
          <div>
            <Button type="button" variant="secondary" onClick={onRegister} className="w-full sm:w-auto">
              {copy.register}
            </Button>
          </div>
        </div>
      ) : (
        <RadioGroup
          id="bank-candidates"
          legend={copy.legend}
          value={choice}
          onValueChange={(v) => {
            setChoice(v);
            setChoiceError(null);
          }}
          error={choiceError}
          optionsClassName="gap-2"
        >
          {payments.length > 0 ? <p className="t-overline mt-1">{copy.payments}</p> : null}
          {payments.map((p, i) => (
            <RadioCard
              key={p.id}
              id={i === 0 ? 'bank-candidates' : undefined}
              value={`pay:${p.id}`}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tnum">{paymentTitle(p)}</span>
                  {p.referenceMatches ? <Badge variant="success">{copy.sameReference}</Badge> : null}
                </span>
              }
              description={<span className="tnum">{paymentLine(p)}</span>}
            />
          ))}
          {reports.length > 0 ? <p className="t-overline mt-2">{copy.reports}</p> : null}
          {reports.map((r, i) => (
            <RadioCard
              key={r.id}
              id={payments.length === 0 && i === 0 ? 'bank-candidates' : undefined}
              value={`rep:${r.id}`}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tnum">
                    {r.patient.fullName} · {stamp.money(r.amount, r.currency)}
                  </span>
                  <Badge variant="warning">{copy.reported}</Badge>
                  {r.referenceMatches ? <Badge variant="success">{copy.sameReference}</Badge> : null}
                </span>
              }
              description={
                <span className="tnum">
                  {[stamp.civilDate(r.paidOn), r.paymentMethod.name, r.reference ?? copy.noReference].join(' · ')}
                </span>
              }
            />
          ))}
        </RadioGroup>
      )}
    </FormModal>
  );
}
