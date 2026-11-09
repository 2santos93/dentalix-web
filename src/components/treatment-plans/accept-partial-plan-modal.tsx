'use client';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  acceptPlan,
  canAcceptPlan,
  EXPIRED_ACCEPTANCE_REASON_LABELS,
  getPlanQuote,
  PARTIAL_PLAN_ALREADY_ACCEPTED,
  PARTIAL_PLAN_NOT_PRESENTED,
  previewPartialAcceptance,
  QUOTE_EXPIRED,
  REPRICE_INCOMPLETE,
  type AcceptPlanInput,
  type ExpiredQuoteAcceptanceReason,
  type PartialAcceptancePreview,
  type PlanQuote,
  type PlanQuoteItem,
} from '@/lib/treatment-plans/plan-quote-api';
import { REPRICE_PREVIEW_STALE } from '@/lib/treatment-plans/plan-repricing-api';
import { getPlan, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { useSedeStamp, type SedePainters } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { FormModal } from '@/components/shared/form-modal';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Skeleton } from '@/components/ui/skeleton';
import { Wizard } from '@/components/ui/wizard';
import {
  acceptPlanCopy,
  ExpiredChoice,
  isFinalClientError,
  LOCATION_TIMEZONE_REQUIRED,
  QuoteSummary,
  SignFields,
  type ExpiredMode,
} from './accept-plan-modal';
import { RowSelectCell } from './row-select-cell';

export const acceptPartialPlanCopy = {
  title: 'Aceptar en parte',
  description:
    'Elige con el paciente los procedimientos que acepta hoy. Lo demás queda en un presupuesto pendiente, enlazado a este.',
  steps: { items: 'Procedimientos', choose: 'Cómo aceptarlo', sign: 'Firma' },
  loading: 'Cargando el presupuesto…',
  loadError: 'No pudimos cargar el presupuesto.',
  itemsLabel: 'Procedimientos del presupuesto',
  procedure: 'Procedimiento',
  amount: 'Importe',
  tooth: (n: string) => `Diente ${n}`,
  select: (name: string) => `Aceptar ${name}`,
  forced: 'Ya aceptado o realizado: forma parte de lo aceptado.',
  totalsLabel: 'Totales de la aceptación parcial',
  accepted: 'Aceptado',
  pending: 'Pendiente',
  total: 'Total del presupuesto',
  previewing: 'Calculando los totales…',
  previewError: 'No pudimos calcular los totales.',
  repriceIncomplete:
    'Algún procedimiento del presupuesto, también entre los que no se aceptan ahora, no tiene precio vigente: no se pueden actualizar los precios. Acéptalo con los precios originales indicando el motivo.',
  originalPending: 'Lo pendiente quedará vencido hasta que actualices sus precios.',
  summary: 'Lo que se acepta y se firma',
  next: 'Continuar',
  submit: 'Aceptar en parte y firmar',
  genericError: 'No pudimos guardar la aceptación. Intenta de nuevo.',
  cannotAccept: 'No se puede aceptar en parte',
  // Ronda 1 (M-3): con abonos, cuotas o saldo a favor, la salida es aceptarlo entero.
  acceptWhole: 'Aceptar entero con firma',
  // Ronda 1 (M-2): los ya aceptados o realizados no cuentan como «aceptar en parte».
  chooseProposed: 'Elige al menos un procedimiento pendiente de aceptar.',
  // Ronda 1 (I-2): otra firma ganó; lo de este modal no se guardó.
  staleAccepted:
    'Otra persona aceptó el plan mientras tanto: no se guardó esta aceptación en parte ni la firma. Revisa el plan antes de seguir.',
  // Ronda 1 (M-1): con «Actualizar los precios» la vista previa tiene que traer la recotización.
  repricingMissing: 'No pudimos calcular los precios vigentes para firmar.',
};

const copy = acceptPartialPlanCopy;

/**
 * Espera sin tocar casillas antes de pedir la vista previa. Con «Actualizar
 * los precios» cada vista previa recotiza el plan entero en la API (lo bloquea
 * un instante): nunca una por clic.
 */
export const PARTIAL_PREVIEW_DEBOUNCE_MS = 300;

type Step = 'items' | 'choose' | 'sign';

/** Un problema de la vista previa de una selección: `hint` (400: la selección no vale) o `retry` (red, servidor). */
interface PreviewProblem {
  key: string;
  message: string;
  kind: 'hint' | 'retry';
}

interface AcceptPartialPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** El detalle del plan (con `items`: su estado dice cuáles ya están aceptados o realizados). */
  plan: TreatmentPlan;
  role: ClinicRole | null;
  /** Firmado: el presupuesto aceptado (con `acceptance.pendingPlanId`). */
  onAccepted: (quote: PlanQuote) => void;
  /** El plan cambió por otra vía (otra firma ganó): el padre lo recarga. */
  onStale: () => void;
  /** Ronda 1 (M-3): abrir la aceptación entera con firma (sin él, no se ofrece). */
  onAcceptWhole?: () => void;
}

function selectionKeyOf(ids: readonly string[], reprice: boolean): string {
  return `${ids.join(',')}|${reprice ? 'reprice' : 'original'}`;
}

function netOf(totals: readonly { currency: string; net: number }[], currency: string): number | null {
  return totals.find((t) => t.currency === currency)?.net ?? totals[0]?.net ?? null;
}

/**
 * «Aceptar en parte» (DX-417): el paciente acepta solo algunos procedimientos
 * del presupuesto presentado. Pasos: «Procedimientos» (casillas; los ya
 * aceptados o realizados van marcados y fijos; los totales los da la vista
 * previa del servidor) → «Cómo aceptarlo» (solo vencido, como DX-379 C) →
 * «Firma» sobre el presupuesto de lo aceptado (`accepted.contentHash`).
 * Lo no elegido pasa a un presupuesto pendiente enlazado.
 *
 * La vista previa va con espera y, como mucho, una en vuelo: con «Actualizar
 * los precios» (`reprice: true`, solo en la firma) cada una recotiza en la API
 * el plan entero.
 */
export function AcceptPartialPlanModal({
  open,
  onOpenChange,
  token,
  patientId,
  plan,
  role,
  onAccepted,
  onStale,
  onAcceptWhole,
}: AcceptPartialPlanModalProps) {
  const planId = plan.id;
  const fmt = readyFormat(useSedeFormat(token));
  const stamp = useSedeStamp(token);
  // Renovar la sesión no vuelve a pedir la vista previa.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [current, setCurrent] = useState<{ key: string; preview: PartialAcceptancePreview } | null>(null);
  const [problem, setProblem] = useState<PreviewProblem | null>(null);
  const inflightRef = useRef<Promise<unknown> | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  // El final es por abonos, cuotas o saldo a favor (409 sin código): se puede aceptar entero.
  const [wholeOffered, setWholeOffered] = useState(false);

  // Vencido (DX-379 C): lo dice el plan o lo descubre la firma (409 QUOTE_EXPIRED).
  const [expiredByServer, setExpiredByServer] = useState(false);
  const [notExpiredByServer, setNotExpiredByServer] = useState(false);
  const expired = (plan.quoteExpired && !notExpiredByServer) || expiredByServer;
  const [repriceBlocked, setRepriceBlocked] = useState<string | null>(null);
  const repriceOffered = canAcceptPlan(role) && repriceBlocked === null;
  const [modeState, setMode] = useState<ExpiredMode | null | undefined>(undefined);
  const mode: ExpiredMode | null = modeState === undefined ? (repriceOffered ? 'REPRICE' : null) : modeState;
  const [reason, setReason] = useState<ExpiredQuoteAcceptanceReason | ''>('');
  const [note, setNote] = useState('');
  const [choiceErrors, setChoiceErrors] = useState<{ mode?: string; reason?: string; note?: string }>({});
  const [step, setStep] = useState<Step>('items');

  // Los ya aceptados o realizados van siempre a lo aceptado (la API: 400 si faltan).
  const forced = useMemo(
    () => new Set((plan.items ?? []).filter((i) => i.status === 'ACCEPTED' || i.status === 'DONE').map((i) => i.id)),
    [plan.items],
  );
  const selectedIds = useMemo(
    () => [...new Set([...chosen, ...forced])].filter((id) => quote?.items.some((i) => i.id === id)).sort(),
    [chosen, forced, quote],
  );
  // La recotización solo al firmar: «Procedimientos» va con los precios del presupuesto y,
  // elegido «Actualizar los precios», la vista previa se repite con `reprice: true`.
  const reprice = step === 'sign' && expired && mode === 'REPRICE' && repriceOffered;
  const key = selectionKeyOf(selectedIds, reprice);
  const fresh = current && current.key === key ? current.preview : null;
  // M-2/M-4: sin ningún propuesto elegido no hay nada que aceptar en parte: se dice aquí, sin pedir nada.
  const proposedChosen = selectedIds.some((id) => !forced.has(id));
  const localHint: PreviewProblem | null =
    quote && !proposedChosen ? { key, message: copy.chooseProposed, kind: 'hint' } : null;
  const problemNow = localHint ?? (problem && problem.key === key ? problem : null);
  const sedeOf = plan.presentedLocationId ?? quote?.location.id ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPlanQuote(tokenRef.current, patientId, planId)
      .then((res) => {
        if (cancelled) return;
        setQuote(res);
        setLoadError(null);
        setSignerName((name) => (name.trim() === '' ? res.patient.name : name));
      })
      .catch(() => {
        if (!cancelled) setLoadError(copy.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [open, patientId, planId, reloadKey]);

  // La vista previa de la selección: con espera y una sola en vuelo.
  const currentKey = current?.key ?? null;
  const problemKey = problem?.key ?? null;
  useEffect(() => {
    if (!open || !quote || fatalError || step === 'choose' || !proposedChosen) return;
    if (currentKey === key || problemKey === key) return;
    let cancelled = false;
    const ids = selectedIds;
    const withReprice = reprice;
    const timer = setTimeout(() => {
      void (async () => {
        // Una sola en vuelo: la anterior termina antes de mandar otra (su respuesta ya no pinta).
        const previous = inflightRef.current;
        if (previous) await previous.catch(() => undefined);
        if (cancelled) return;
        const request = previewPartialAcceptance(tokenRef.current, patientId, planId, {
          itemIds: ids,
          ...(withReprice ? { reprice: true } : {}),
        });
        inflightRef.current = request;
        try {
          const res = await request;
          if (cancelled) return;
          if (withReprice && !res.repricing) {
            // M-1: sin la recotización no se firma «Actualizar los precios»; se vuelve a pedir.
            setProblem({ key, message: copy.repricingMissing, kind: 'retry' });
            return;
          }
          setCurrent({ key, preview: res });
          setProblem(null);
        } catch (err) {
          if (!cancelled) await handlePreviewError(err, key, withReprice);
        } finally {
          if (inflightRef.current === request) inflightRef.current = null;
        }
      })();
    }, PARTIAL_PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // La clave resume la selección y el modo; `handlePreviewError` solo escribe estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote, key, step, currentKey, problemKey, fatalError, proposedChosen, patientId, planId]);

  /** Otra firma ganó (o el plan ya está aceptado): se cierra y el padre recarga. */
  function closeStale() {
    // I-2: lo que se eligió y firmó aquí no se guardó; el plan quedó aceptado por otra vía.
    toast.warning(copy.staleAccepted, { duration: Infinity });
    onStale();
    handleOpenChange(false, true);
  }

  async function handlePreviewError(err: unknown, forKey: string, withReprice: boolean) {
    const message = apiErrorMessage(err, copy.previewError);
    if (!(err instanceof ApiError) || !isFinalClientError(err)) {
      setProblem({ key: forKey, message, kind: 'retry' });
      return;
    }
    if (err.code === PARTIAL_PLAN_ALREADY_ACCEPTED) {
      closeStale();
      return;
    }
    if (err.code === LOCATION_TIMEZONE_REQUIRED) {
      setFatalError(message);
      return;
    }
    if (withReprice && ((err.status === 409 && err.code && err.code !== PARTIAL_PLAN_NOT_PRESENTED) || err.status === 403)) {
      // REPRICE_INCOMPLETE mira TODOS los ítems del plan, también los no elegidos.
      blockReprice(err.code === REPRICE_INCOMPLETE ? copy.repriceIncomplete : `${message} ${acceptPlanCopy.suggestOriginal}`);
      return;
    }
    if (withReprice && err.status === 400 && (await stillExpired()) === false) return;
    if (err.status === 400) {
      // Ninguno, todos, o un aceptado/realizado fuera: el texto del servidor junto al botón.
      setProblem({ key: forKey, message, kind: 'hint' });
      return;
    }
    // Saldo a favor, abonos, cuotas (409 sin código), no presentado, sede sin zona, 404…
    setWholeOffered(err.status === 409 && !err.code);
    setFatalError(message);
  }

  /** M-1 de C: ¿sigue vencido? Si otro lo volvió a presentar, se sigue sin elegir cómo. */
  async function stillExpired(): Promise<boolean | null> {
    const fresh = await getPlan(tokenRef.current, planId).catch(() => null);
    if (!fresh) return null;
    if (fresh.acceptance) {
      closeStale();
      return false;
    }
    if (!fresh.quoteExpired) {
      setNotExpiredByServer(true);
      setExpiredByServer(false);
      setSignature(null);
      setSubmitError(acceptPlanCopy.notExpiredAnymore);
      if (step === 'choose') setStep('sign');
      return false;
    }
    return true;
  }

  function blockReprice(message: string) {
    setRepriceBlocked(message);
    setMode(null);
    setSignature(null);
    setSubmitError(message);
    if (step === 'sign') setStep('choose');
  }

  function handleOpenChange(next: boolean, force = false) {
    if (!next && submittingRef.current && !force) return;
    if (!next) {
      setQuote(null);
      setLoadError(null);
      setChosen(new Set());
      setCurrent(null);
      setProblem(null);
      setSignerName('');
      setSignature(null);
      setSubmitError(null);
      setFatalError(null);
      setWholeOffered(false);
      setExpiredByServer(false);
      setNotExpiredByServer(false);
      setRepriceBlocked(null);
      setMode(undefined);
      setReason('');
      setNote('');
      setChoiceErrors({});
      setStep('items');
    }
    onOpenChange(next);
  }

  function validateChoice(): boolean {
    const errors: typeof choiceErrors = {};
    if (!mode) errors.mode = acceptPlanCopy.modeRequired;
    else if (mode === 'ORIGINAL_PRICES') {
      if (!reason) errors.reason = acceptPlanCopy.reasonRequired;
      else if (reason === 'OTHER' && note.trim() === '') errors.note = acceptPlanCopy.noteRequired;
    }
    setChoiceErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goTo(next: Step) {
    if (next !== 'sign') setSignature(null);
    setStep(next);
  }

  function expiredBody(preview: PartialAcceptancePreview): AcceptPlanInput['expired'] | undefined {
    if (!expired) return undefined;
    if (mode === 'REPRICE') {
      // M-1: nunca se cae en «precios originales» sin que se eligiera (signReady ya lo impide).
      if (!preview.repricing) throw new Error('vista previa sin recotización');
      return { mode: 'REPRICE', repricePreviewHash: preview.repricing.previewHash };
    }
    const trimmed = note.trim();
    return {
      mode: 'ORIGINAL_PRICES',
      reason: reason as ExpiredQuoteAcceptanceReason,
      ...(trimmed ? { note: trimmed } : {}),
    };
  }

  const itemsReady = fresh !== null && !problemNow;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (step === 'items') {
      if (!itemsReady) return;
      setSubmitError(null);
      goTo(expired ? 'choose' : 'sign');
      return;
    }
    if (step === 'choose') {
      if (!validateChoice()) return;
      setSubmitError(null);
      goTo('sign');
      return;
    }
    if (!fresh || !signReady || !signature || signerName.trim() === '') return;
    const preview = fresh;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const expiredChoice = expiredBody(preview);
    try {
      const accepted = await acceptPlan(tokenRef.current, patientId, planId, {
        signerName: signerName.trim(),
        signature,
        contentHash: preview.accepted.contentHash,
        ...(expiredChoice ? { expired: expiredChoice } : {}),
        partial: { itemIds: selectedIds },
      });
      submittingRef.current = false;
      onAccepted(accepted);
      handleOpenChange(false, true);
    } catch (err) {
      submittingRef.current = false;
      await handleSubmitError(err);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleSubmitError(err: unknown) {
    const message = apiErrorMessage(err, copy.genericError);
    if (!(err instanceof ApiError)) {
      setSubmitError(message);
      return;
    }
    if (err.code === PARTIAL_PLAN_ALREADY_ACCEPTED) {
      closeStale();
      return;
    }
    if (err.code === LOCATION_TIMEZONE_REQUIRED || err.code === PARTIAL_PLAN_NOT_PRESENTED || err.status === 404) {
      setFatalError(message);
      return;
    }
    if (err.status === 409 && err.code === QUOTE_EXPIRED) {
      // Venció con el modal abierto: se elige cómo aceptarlo.
      setNotExpiredByServer(false);
      setExpiredByServer(true);
      goTo('choose');
      setSubmitError(message);
      return;
    }
    if (err.status === 409 && (err.code === REPRICE_PREVIEW_STALE || !err.code)) {
      // El presupuesto cambió (o los precios vigentes): otra vista previa y otra firma.
      // Si lo que cambió no tiene arreglo (abonos, cuotas…), la vista previa lo dirá.
      setSignature(null);
      setCurrent(null);
      setProblem(null);
      setSubmitError(message);
      return;
    }
    if (reprice && ((err.status === 409 && err.code) || err.status === 403)) {
      blockReprice(err.code === REPRICE_INCOMPLETE ? copy.repriceIncomplete : `${message} ${acceptPlanCopy.suggestOriginal}`);
      return;
    }
    if (expired && err.status === 400 && (await stillExpired()) === false) return;
    setSubmitError(message);
  }

  const steps = expired
    ? [
        { key: 'items', label: copy.steps.items },
        { key: 'choose', label: copy.steps.choose },
        { key: 'sign', label: copy.steps.sign },
      ]
    : [
        { key: 'items', label: copy.steps.items },
        { key: 'sign', label: copy.steps.sign },
      ];
  const stepIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === step),
  );

  function handleStepChange(i: number) {
    if (submitting) return;
    const target = steps[i]?.key as Step | undefined;
    if (!target || target === step) return;
    if (i < stepIndex) {
      goTo(target);
      return;
    }
    // Hacia delante, solo de uno en uno y con lo de este paso resuelto.
    if (i !== stepIndex + 1) return;
    if (step === 'items' && !itemsReady) return;
    if (step === 'choose' && !validateChoice()) return;
    setSubmitError(null);
    goTo(target);
  }

  const previewing = quote !== null && !fresh && !problemNow && !fatalError && step !== 'choose';
  const signReady = fresh !== null && !problemNow && (!reprice || fresh.repricing !== null);
  const submitDisabled =
    step === 'items' ? !itemsReady : step === 'choose' ? false : !signReady || !signature || signerName.trim() === '';
  const submitHint = problemNow?.kind === 'hint' ? problemNow.message : step === 'items' ? null : undefined;

  return (
    <FormModal
      open={open}
      onOpenChange={(next) => handleOpenChange(next)}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={step === 'sign' ? copy.submit : copy.next}
      submitting={submitting}
      submitDisabled={submitDisabled}
      submitBusy={previewing && step !== 'items'}
      submitHint={fatalError ? undefined : submitHint}
      error={fatalError ? null : submitError}
      hideSubmit={fatalError !== null}
      size="lg"
    >
      {fatalError ? (
        <SectionError
          title={copy.cannotAccept}
          description={fatalError}
          secondaryAction={
            wholeOffered && onAcceptWhole ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  handleOpenChange(false, true);
                  onAcceptWhole();
                }}
              >
                {copy.acceptWhole}
              </Button>
            ) : undefined
          }
        />
      ) : loadError ? (
        <SectionError
          description={loadError}
          onRetry={() => {
            setLoadError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : !quote ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{copy.loading}</span>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : (
        <Wizard steps={steps} current={stepIndex} disabled={submitting} onStepChange={handleStepChange}>
          {step === 'items' ? (
            <div className="flex min-w-0 flex-col gap-4">
              <ItemsSelection
                quote={quote}
                preview={fresh}
                forced={forced}
                selected={new Set(selectedIds)}
                onToggle={(id, checked) =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
                stamp={stamp}
                locationId={sedeOf}
                disabled={submitting}
              />
              <PreviewTotals
                preview={fresh}
                currency={quote.currency}
                problem={problemNow}
                onRetry={() => setProblem(null)}
                stamp={stamp}
                locationId={sedeOf}
              />
              <SedeStampNote stamp={stamp} />
            </div>
          ) : step === 'choose' ? (
            <ExpiredChoice
              quote={quote}
              fmt={fmt}
              repriceOffered={repriceOffered}
              mode={mode}
              onModeChange={(next) => {
                setMode(next);
                setChoiceErrors({});
              }}
              reason={reason}
              onReasonChange={(next) => {
                setReason(next);
                setChoiceErrors((e) => ({ ...e, reason: undefined, note: undefined }));
              }}
              note={note}
              onNoteChange={(next) => {
                setNote(next);
                setChoiceErrors((e) => ({ ...e, note: undefined }));
              }}
              errors={choiceErrors}
              disabled={submitting}
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              {fresh ? (
                <>
                  <QuoteSummary
                    quote={fresh.accepted}
                    fmt={fmt}
                    label={copy.summary}
                    patientId={patientId}
                    planId={planId}
                    showPrintLink={false}
                  />
                  <PreviewTotals
                    preview={fresh}
                    currency={quote.currency}
                    problem={null}
                    onRetry={() => setProblem(null)}
                    stamp={stamp}
                    locationId={sedeOf}
                  />
                </>
              ) : (
                <PreviewTotals
                  preview={null}
                  currency={quote.currency}
                  problem={problemNow}
                  onRetry={() => setProblem(null)}
                  stamp={stamp}
                  locationId={sedeOf}
                />
              )}
              {expired && mode === 'ORIGINAL_PRICES' ? (
                <>
                  <p data-testid="accept-original-reason" className="text-sm text-ink">
                    {acceptPlanCopy.originalSummary(reason ? EXPIRED_ACCEPTANCE_REASON_LABELS[reason] : '')}
                  </p>
                  <Callout tone="warning">{copy.originalPending}</Callout>
                </>
              ) : null}
              <SedeStampNote stamp={stamp} />
              {signReady && fresh ? (
                <SignFields
                  signerName={signerName}
                  onSignerNameChange={setSignerName}
                  signatureKey={fresh.accepted.contentHash}
                  onSignature={setSignature}
                  disabled={submitting}
                />
              ) : null}
            </div>
          )}
        </Wizard>
      )}
    </FormModal>
  );
}

function ItemsSelection({
  quote,
  preview,
  forced,
  selected,
  onToggle,
  stamp,
  locationId,
  disabled,
}: {
  quote: PlanQuote;
  preview: PartialAcceptancePreview | null;
  forced: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  stamp: SedePainters;
  locationId: string | null;
  disabled: boolean;
}) {
  // Con los precios actualizados, el importe de cada línea es el de la vista previa.
  const previewed = new Map(
    [...(preview?.accepted.items ?? []), ...(preview?.pending.items ?? [])].map((item) => [item.id, item.subtotal]),
  );
  const currency = preview?.accepted.currency ?? quote.currency;
  const forcedNoteId = (id: string) => `partial-forced-${id}`;
  const columns: DataListColumn<PlanQuoteItem>[] = [
    {
      id: 'procedure',
      header: copy.procedure,
      mobile: 'primary',
      cell: (item) => (
        <span className="block min-w-0 break-words">
          <span className="block text-ink">{item.procedure}</span>
          {item.toothNumber ? (
            <span className="block t-caption text-muted tabular-nums">{copy.tooth(item.toothNumber)}</span>
          ) : null}
          {forced.has(item.id) ? (
            <span id={forcedNoteId(item.id)} className="block t-caption text-muted">
              {copy.forced}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'amount',
      header: copy.amount,
      numeric: true,
      mobile: 'trailing',
      cell: (item) => stamp.money(previewed.get(item.id) ?? item.subtotal, currency, locationId),
    },
  ];
  return (
    <DataList
      label={copy.itemsLabel}
      rows={quote.items}
      columns={columns}
      getRowKey={(item) => item.id}
      leading={(item) => (
        <RowSelectCell
          testId="partial-item-select"
          label={copy.select(item.procedure)}
          checked={selected.has(item.id)}
          disabled={disabled || forced.has(item.id)}
          describedBy={forced.has(item.id) ? forcedNoteId(item.id) : undefined}
          onToggle={(checked) => onToggle(item.id, checked)}
        />
      )}
    />
  );
}

/** «Aceptado · Pendiente · Total del presupuesto», del servidor (la web no suma). */
function PreviewTotals({
  preview,
  currency,
  problem,
  onRetry,
  stamp,
  locationId,
}: {
  preview: PartialAcceptancePreview | null;
  currency: string;
  problem: PreviewProblem | null;
  onRetry: () => void;
  stamp: SedePainters;
  locationId: string | null;
}) {
  if (problem?.kind === 'retry') return <SectionError description={problem.message} onRetry={onRetry} />;
  // El texto de un 400 va junto al botón (`submitHint`); aquí no hay totales que enseñar.
  if (problem?.kind === 'hint') return null;
  if (!preview) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{copy.previewing}</span>
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    );
  }
  const money = (amount: number | null) => (amount === null ? '—' : stamp.money(amount, currency, locationId));
  return (
    <section aria-label={copy.totalsLabel} className="rounded-lg border border-border p-4">
      <DescriptionList columns={3}>
        <DescriptionItem label={copy.accepted} numeric>
          {money(netOf(preview.accepted.totals, currency))}
        </DescriptionItem>
        <DescriptionItem label={copy.pending} numeric>
          {money(netOf(preview.pending.totals, currency))}
        </DescriptionItem>
        <DescriptionItem label={copy.total} numeric>
          {money(netOf(preview.original.totals, currency))}
        </DescriptionItem>
      </DescriptionList>
    </section>
  );
}
