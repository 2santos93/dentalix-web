'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  acceptPlan,
  canAcceptPlan,
  EXPIRED_ACCEPTANCE_NOTE_MAX,
  EXPIRED_ACCEPTANCE_REASON_LABELS,
  EXPIRED_ACCEPTANCE_REASONS,
  getPlanQuote,
  planQuotePrintHref,
  previewAcceptanceRepricing,
  QUOTE_EXPIRED,
  type AcceptanceRepricePreview,
  type AcceptPlanInput,
  type ExpiredQuoteAcceptanceReason,
  type PlanQuote,
} from '@/lib/treatment-plans/plan-quote-api';
import { REPRICE_PREVIEW_STALE } from '@/lib/treatment-plans/plan-repricing-api';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { SignaturePad } from '@/components/shared/signature-pad';
import { SectionError } from '@/components/errors/section-error';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Wizard } from '@/components/ui/wizard';
import { RepricingPreviewView } from './reprice-plan-modal';

export const acceptPlanCopy = {
  title: 'Aceptar presupuesto con firma',
  description: 'Revisa el presupuesto con el paciente. Al firmar, queda aceptado tal como se muestra.',
  loading: 'Cargando el presupuesto…',
  loadError: 'No pudimos cargar el presupuesto.',
  summary: 'Presupuesto a firmar',
  tooth: (n: string) => `Diente ${n}`,
  total: (currency: string) => `Total (${currency})`,
  validity: (days: number, until: string) => `Válido ${days} días, hasta el ${until}`,
  viewFull: 'Ver el presupuesto completo',
  newTab: '(se abre en otra pestaña)',
  signerName: 'Nombre de quien firma',
  signerHint: 'El paciente o su representante.',
  signature: 'Firma del paciente',
  signatureHint: 'Firma con el dedo, el lápiz o el ratón.',
  immutableNote:
    'Al firmar se guardan la firma, la fecha y una huella del presupuesto; sus procedimientos y precios ya no se pueden cambiar.',
  submit: 'Aceptar y firmar',
  genericError: 'No pudimos guardar la aceptación. Intenta de nuevo.',
  // DX-379 (C): aceptar un presupuesto vencido.
  steps: { choose: 'Cómo aceptarlo', sign: 'Firma' },
  next: 'Continuar',
  expiredTitle: (date: string) => `El presupuesto venció el ${date}`,
  expiredLead: 'Sus precios ya no están garantizados. Antes de firmar, elige cómo aceptarlo.',
  modeLegend: 'Cómo aceptarlo',
  modeReprice: 'Actualizar los precios y aceptar',
  modeRepriceDescription:
    'Recomendada. Todos los procedimientos propuestos pasan al precio vigente y la validez se renueva; antes de firmar verás los cambios.',
  modeOriginal: 'Aceptar con los precios originales',
  modeOriginalDescription: 'Se firma el presupuesto tal como se presentó y queda registrado el motivo.',
  reasonLabel: 'Motivo',
  reasonPlaceholder: 'Elige el motivo',
  noteLabel: 'Nota (opcional)',
  noteLabelRequired: 'Nota',
  noteCount: (n: number) => `${n} de ${EXPIRED_ACCEPTANCE_NOTE_MAX} caracteres`,
  modeRequired: 'Elige cómo aceptar el presupuesto vencido.',
  reasonRequired: 'Elige el motivo para aceptarlo con los precios originales.',
  noteRequired: `Con el motivo «Otro», escribe una nota (hasta ${EXPIRED_ACCEPTANCE_NOTE_MAX} caracteres).`,
  suggestOriginal: 'Puedes aceptarlo con los precios originales indicando el motivo.',
  repricing: 'Calculando los precios vigentes…',
  repricingError: 'No pudimos calcular los precios vigentes.',
  repricedSummary: 'Presupuesto con los precios actualizados, a firmar',
  originalSummary: (reason: string) => `Se acepta con los precios del presupuesto vencido. Motivo: ${reason}.`,
};

const copy = acceptPlanCopy;

type ExpiredMode = 'REPRICE' | 'ORIGINAL_PRICES';
type Step = 'choose' | 'sign';

interface RepriceLoadError {
  message: string;
  retryable: boolean;
}

/** Un error del que no se sale reintentando lo mismo (el plan no admite recotizarse). */
function isFinalClientError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}

interface AcceptPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  planId: string;
  /** El presupuesto ya aceptado (con la firma), para refrescar el plan. */
  onAccepted: (quote: PlanQuote) => void;
  /** DX-379 (C): el plan tiene el presupuesto vencido (`quoteExpired`, lo decide el servidor). */
  quoteExpired?: boolean;
  /** Quien firma: solo quien decide el plan pide la vista previa de los precios actualizados. */
  role: ClinicRole | null;
  /** La sede de la presentación (los importes y la validez de la recotización). */
  locationId?: string | null;
}

/**
 * «Aceptar con firma» (DX-012): enseña el presupuesto que se va a firmar
 * (procedimientos, total, validez), pide el nombre de quien firma y la firma
 * en el lienzo, y lo envía con la huella (`contentHash`) de lo mostrado. Si el
 * plan cambió entre medias, la API responde 409: se explica, se recarga el
 * presupuesto y se pide la firma de nuevo sobre lo nuevo.
 *
 * DX-379 (C): vencido, antes de la firma se elige cómo aceptarlo: con los
 * precios actualizados (la vista previa de la firma: se firma el presupuesto
 * recotizado) o con los originales (motivo y, con «Otro», nota). Si vence con
 * el modal abierto, la API responde 409 `QUOTE_EXPIRED` y el modal vuelve a
 * esa elección.
 */
export function AcceptPlanModal({
  open,
  onOpenChange,
  token,
  patientId,
  planId,
  onAccepted,
  quoteExpired = false,
  role,
  locationId = null,
}: AcceptPlanModalProps) {
  // DX-522: importes con el formato de la sede y el código ISO; cargando, «—».
  const fmt = readyFormat(useSedeFormat(token));
  // DX-354b: el aviso único de la sede sin formato (importes y vigencia en «—»); un aviso por modal.
  const stamp = useSedeStamp(token);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // DX-379 (C): el vencido que la API descubrió al firmar (409 QUOTE_EXPIRED).
  const [expiredByServer, setExpiredByServer] = useState(false);
  const expired = quoteExpired || expiredByServer;
  const mayReprice = canAcceptPlan(role);
  // La recotización no es posible (409/403 de la vista previa): queda solo «precios originales».
  const [repriceBlocked, setRepriceBlocked] = useState<string | null>(null);
  const repriceOffered = mayReprice && repriceBlocked === null;
  // Sin tocar (null / undefined), el paso y la opción salen del plan al abrir: el modal sigue
  // montado entre aperturas y el plan puede vencer entre medias.
  const [stepState, setStep] = useState<Step | null>(null);
  const step: Step = stepState ?? (expired ? 'choose' : 'sign');
  const [modeState, setMode] = useState<ExpiredMode | null | undefined>(undefined);
  // La recomendada va marcada de inicio.
  const mode: ExpiredMode | null = modeState === undefined ? (repriceOffered ? 'REPRICE' : null) : modeState;
  const [reason, setReason] = useState<ExpiredQuoteAcceptanceReason | ''>('');
  const [note, setNote] = useState('');
  const [choiceErrors, setChoiceErrors] = useState<{ mode?: string; reason?: string; note?: string }>({});
  const [repriced, setRepriced] = useState<AcceptanceRepricePreview | null>(null);
  const [repriceError, setRepriceError] = useState<RepriceLoadError | null>(null);
  const [repriceKey, setRepriceKey] = useState(0);

  const choosing = expired && step === 'choose';
  const repricing = expired && step === 'sign' && mode === 'REPRICE';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPlanQuote(token, patientId, planId)
      .then((res) => {
        if (cancelled) return;
        setQuote(res);
        setLoadError(null);
        // Se propone el nombre del paciente; se puede cambiar (representante).
        setSignerName((current) => (current.trim() === '' ? res.patient.name : current));
      })
      .catch(() => {
        if (!cancelled) setLoadError(copy.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, planId, reloadKey]);

  // DX-379 (C): la vista previa de la firma con los precios actualizados (no escribe nada).
  useEffect(() => {
    if (!open || !repricing) return;
    let cancelled = false;
    previewAcceptanceRepricing(token, patientId, planId)
      .then((res) => {
        if (cancelled) return;
        setRepriced(res);
        setRepriceError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = apiErrorMessage(err, copy.repricingError);
        if (isFinalClientError(err)) {
          // REPRICE_INCOMPLETE, REPRICE_NOTHING_TO_APPLY, plan con abonos, tope de descuento
          // (403)…: recotizar no es posible; se vuelve a la elección con la otra salida.
          blockReprice(message);
        } else {
          setRepriceError({ message, retryable: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, repricing, token, patientId, planId, repriceKey]);

  function blockReprice(message: string) {
    setRepriceBlocked(message);
    setMode(null);
    setStep('choose');
    setRepriced(null);
    setRepriceError(null);
    setSignature(null);
    setSubmitError(`${message} ${copy.suggestOriginal}`);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Cada apertura empieza en limpio: otro plan, otra firma.
      setQuote(null);
      setLoadError(null);
      setSignerName('');
      setSignature(null);
      setSubmitError(null);
      setExpiredByServer(false);
      setRepriceBlocked(null);
      setStep(null);
      setMode(undefined);
      setReason('');
      setNote('');
      setChoiceErrors({});
      setRepriced(null);
      setRepriceError(null);
    }
    onOpenChange(next);
  }

  function validateChoice(): boolean {
    const errors: typeof choiceErrors = {};
    if (!mode) errors.mode = copy.modeRequired;
    else if (mode === 'ORIGINAL_PRICES') {
      if (!reason) errors.reason = copy.reasonRequired;
      else if (reason === 'OTHER' && note.trim() === '') errors.note = copy.noteRequired;
    }
    setChoiceErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goToChoice() {
    setStep('choose');
    setSignature(null);
    setRepriced(null);
    setRepriceError(null);
  }

  function expiredBody(): AcceptPlanInput['expired'] | undefined {
    if (!expired) return undefined;
    if (mode === 'REPRICE' && repriced) {
      return { mode: 'REPRICE', repricePreviewHash: repriced.repricing.previewHash };
    }
    const trimmed = note.trim();
    return {
      mode: 'ORIGINAL_PRICES',
      reason: reason as ExpiredQuoteAcceptanceReason,
      ...(trimmed ? { note: trimmed } : {}),
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choosing) {
      if (!quote || !validateChoice()) return;
      setSubmitError(null);
      setRepriced(null);
      setStep('sign');
      return;
    }
    // Lo que se firma: el presupuesto recotizado (REPRICE) o el del GET de siempre.
    const shown = repricing ? repriced?.quote : quote;
    if (!shown || !signature || signerName.trim() === '') return;
    setSubmitting(true);
    setSubmitError(null);
    const expiredChoice = expiredBody();
    try {
      const accepted = await acceptPlan(token, patientId, planId, {
        signerName: signerName.trim(),
        signature,
        contentHash: shown.contentHash,
        ...(expiredChoice ? { expired: expiredChoice } : {}),
      });
      onAccepted(accepted);
      handleOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericError);
      if (err instanceof ApiError && err.status === 409 && err.code === QUOTE_EXPIRED) {
        // Venció con el modal abierto: se vuelve a la elección con el presupuesto al día.
        setExpiredByServer(true);
        goToChoice();
        setReloadKey((k) => k + 1);
        setSubmitError(message);
      } else if (repricing && err instanceof ApiError && err.status === 409 && err.code === REPRICE_PREVIEW_STALE) {
        // Cambió un precio o la tasa: otra vista previa y otra firma sobre ella.
        setSignature(null);
        setRepriced(null);
        setRepriceKey((k) => k + 1);
        setSubmitError(message);
      } else if (repricing && err instanceof ApiError && err.status === 409 && err.code) {
        // REPRICE_INCOMPLETE, REPRICE_NOTHING_TO_APPLY…: recotizar ya no es posible.
        blockReprice(message);
      } else if (err instanceof ApiError && err.status === 409) {
        // Lo firmado tiene que ser lo mostrado: se recarga el presupuesto. Si
        // entre medias otra persona ya lo firmó, no hay nada que firmar: se
        // cierra y el plan se refresca con esa aceptación.
        const fresh = await getPlanQuote(token, patientId, planId).catch(() => null);
        if (fresh?.acceptance) {
          onAccepted(fresh);
          handleOpenChange(false);
          return;
        }
        setSignature(null);
        if (fresh) setQuote(fresh);
        else setReloadKey((k) => k + 1);
        if (repricing) {
          // El presupuesto recotizado también se vuelve a componer.
          setRepriced(null);
          setRepriceKey((k) => k + 1);
        }
        setSubmitError(message);
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const ready = quote !== null && !loadError;
  const signReady = repricing ? repriced !== null : ready;
  const originalReasonLabel = reason ? EXPIRED_ACCEPTANCE_REASON_LABELS[reason] : '';
  const quoteNames = useMemo(() => new Map((quote?.items ?? []).map((item) => [item.id, item.procedure])), [quote]);
  const sedeOf = locationId ?? quote?.location.id ?? null;

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={choosing ? copy.next : copy.submit}
      submitting={submitting}
      submitDisabled={choosing ? !ready : !signReady || !signature || signerName.trim() === ''}
      submitBusy={repricing && repriced === null && repriceError === null}
      error={submitError}
      size="lg"
    >
      {loadError ? (
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
      ) : expired ? (
        <Wizard
          steps={[
            { key: 'choose', label: copy.steps.choose },
            { key: 'sign', label: copy.steps.sign },
          ]}
          current={step === 'choose' ? 0 : 1}
          disabled={submitting}
          onStepChange={(i) => {
            if (submitting) return;
            if (i === 0 && step === 'sign') goToChoice();
            else if (i === 1 && step === 'choose' && validateChoice()) {
              setSubmitError(null);
              setStep('sign');
            }
          }}
        >
          {step === 'choose' ? (
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
              {mode === 'REPRICE' ? (
                repriceError ? (
                  <SectionError description={repriceError.message} onRetry={() => setRepriceKey((k) => k + 1)} />
                ) : !repriced ? (
                  <div role="status" className="flex flex-col gap-2">
                    <span className="sr-only">{copy.repricing}</span>
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                  </div>
                ) : (
                  <>
                    <RepricingPreviewView
                      base={repriced.repricing}
                      preview={repriced.repricing}
                      fresh
                      expired
                      nameOf={(itemId) => quoteNames.get(itemId) ?? repriced.quote.items.find((i) => i.id === itemId)?.procedure ?? ''}
                      role={role}
                      stamp={stamp}
                      locationId={sedeOf}
                      planCurrency={repriced.quote.currency}
                    />
                    <QuoteSummary
                      quote={repriced.quote}
                      fmt={fmt}
                      label={copy.repricedSummary}
                      patientId={patientId}
                      planId={planId}
                      showPrintLink={false}
                    />
                  </>
                )
              ) : (
                <>
                  <QuoteSummary quote={quote} fmt={fmt} label={copy.summary} patientId={patientId} planId={planId} />
                  <p data-testid="accept-original-reason" className="text-sm text-ink">
                    {copy.originalSummary(originalReasonLabel)}
                  </p>
                </>
              )}
              <SedeStampNote stamp={stamp} />
              {signReady ? (
                <SignFields
                  signerName={signerName}
                  onSignerNameChange={setSignerName}
                  signatureKey={(repricing ? repriced?.quote.contentHash : quote.contentHash) ?? ''}
                  onSignature={setSignature}
                  disabled={submitting}
                />
              ) : null}
            </div>
          )}
        </Wizard>
      ) : (
        <>
          <QuoteSummary quote={quote} fmt={fmt} label={copy.summary} patientId={patientId} planId={planId} />
          <SedeStampNote stamp={stamp} />
          <SignFields
            signerName={signerName}
            onSignerNameChange={setSignerName}
            signatureKey={quote.contentHash}
            onSignature={setSignature}
            disabled={submitting}
          />
        </>
      )}
    </FormModal>
  );
}

function QuoteSummary({
  quote,
  fmt,
  label,
  patientId,
  planId,
  showPrintLink = true,
}: {
  quote: PlanQuote;
  fmt: RegionalFormat | null;
  label: string;
  patientId: string;
  planId: string;
  /** El enlace imprime (y fija) el presupuesto guardado: no el recotizado que aún no existe. */
  showPrintLink?: boolean;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <ul className="max-h-48 divide-y divide-border-subtle overflow-y-auto text-sm">
        {quote.items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block break-words text-ink">{item.procedure}</span>
              <span className="block t-caption text-muted tabular-nums">{copy.tooth(item.toothNumber)}</span>
            </span>
            <span className="shrink-0 font-medium text-ink tabular-nums">
              {sedeMoney(item.subtotal, quote.currency, fmt)}
            </span>
          </li>
        ))}
      </ul>
      {quote.totals.map((total) => (
        <p
          key={total.currency}
          className="flex items-baseline justify-between gap-3 border-t border-border pt-2 font-semibold text-ink"
        >
          <span>{copy.total(total.currency)}</span>
          <span className="tabular-nums">{sedeMoney(total.net, total.currency, fmt)}</span>
        </p>
      ))}
      <p className="flex flex-wrap items-center justify-between gap-2 t-caption text-muted">
        <span className="tabular-nums">{copy.validity(quote.validityDays, sedeCivilDate(quote.validUntil, fmt))}</span>
        {showPrintLink ? (
          <Link
            href={planQuotePrintHref(patientId, planId)}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
          >
            {copy.viewFull}
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">{copy.newTab}</span>
          </Link>
        ) : null}
      </p>
    </section>
  );
}

function SignFields({
  signerName,
  onSignerNameChange,
  signatureKey,
  onSignature,
  disabled,
}: {
  signerName: string;
  onSignerNameChange: (name: string) => void;
  /** La huella de lo que se firma: si cambia, el lienzo se vacía. */
  signatureKey: string;
  onSignature: (signature: string | null) => void;
  disabled: boolean;
}) {
  return (
    <>
      <FormField htmlFor="accept-signer-name" label={copy.signerName} hint={copy.signerHint}>
        <Input
          id="accept-signer-name"
          value={signerName}
          maxLength={200}
          autoComplete="off"
          onChange={(e) => onSignerNameChange(e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <SignaturePad
        key={signatureKey}
        label={copy.signature}
        hint={copy.signatureHint}
        onChange={onSignature}
        disabled={disabled}
      />
      <p className="t-caption text-muted">{copy.immutableNote}</p>
    </>
  );
}

function ExpiredChoice({
  quote,
  fmt,
  repriceOffered,
  mode,
  onModeChange,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  errors,
  disabled,
}: {
  quote: PlanQuote;
  fmt: RegionalFormat | null;
  repriceOffered: boolean;
  mode: ExpiredMode | null;
  onModeChange: (mode: ExpiredMode) => void;
  reason: ExpiredQuoteAcceptanceReason | '';
  onReasonChange: (reason: ExpiredQuoteAcceptanceReason | '') => void;
  note: string;
  onNoteChange: (note: string) => void;
  errors: { mode?: string; reason?: string; note?: string };
  disabled: boolean;
}) {
  const noteRequired = reason === 'OTHER';
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Callout tone="warning" title={copy.expiredTitle(sedeCivilDate(quote.validUntil, fmt))} titleAs="h3">
        {copy.expiredLead}
      </Callout>
      <RadioGroup
        id="accept-expired-mode"
        legend={copy.modeLegend}
        value={mode ?? ''}
        onValueChange={(value) => onModeChange(value as ExpiredMode)}
        error={errors.mode ?? null}
        disabled={disabled}
        optionsClassName="flex flex-col gap-2"
      >
        {repriceOffered ? (
          <RadioCard
            id="accept-expired-mode"
            value="REPRICE"
            title={copy.modeReprice}
            description={copy.modeRepriceDescription}
          />
        ) : null}
        <RadioCard
          id={repriceOffered ? undefined : 'accept-expired-mode'}
          value="ORIGINAL_PRICES"
          title={copy.modeOriginal}
          description={copy.modeOriginalDescription}
        />
      </RadioGroup>
      {mode === 'ORIGINAL_PRICES' ? (
        <>
          <FormField htmlFor="accept-expired-reason" label={copy.reasonLabel} error={errors.reason ?? null}>
            <NativeSelect
              id="accept-expired-reason"
              value={reason}
              disabled={disabled}
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? 'accept-expired-reason-error' : undefined}
              onChange={(e) => onReasonChange(e.target.value as ExpiredQuoteAcceptanceReason | '')}
            >
              <option value="" disabled>
                {copy.reasonPlaceholder}
              </option>
              {EXPIRED_ACCEPTANCE_REASONS.map((value) => (
                <option key={value} value={value}>
                  {EXPIRED_ACCEPTANCE_REASON_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            htmlFor="accept-expired-note"
            label={noteRequired ? copy.noteLabelRequired : copy.noteLabel}
            error={errors.note ?? null}
            hint={copy.noteCount(note.length)}
            hintId="accept-expired-note-count"
          >
            <Textarea
              id="accept-expired-note"
              rows={3}
              autoGrow
              maxLength={EXPIRED_ACCEPTANCE_NOTE_MAX}
              value={note}
              disabled={disabled}
              aria-required={noteRequired || undefined}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? 'accept-expired-note-error' : 'accept-expired-note-count'}
              onChange={(e) => onNoteChange(e.target.value)}
            />
          </FormField>
        </>
      ) : null}
    </div>
  );
}
