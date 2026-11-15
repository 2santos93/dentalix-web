'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, LinkIcon, ReceiptText } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  completePublicProofUpload,
  getPublicPaymentLink,
  markPublicPaymentLinkOpened,
  requestPublicProofUpload,
  submitPaymentReport,
  type PublicPaymentLink,
  type PublicPaymentMethod,
  type PublicStagedProof,
} from '@/lib/payment-links/payment-links-api';
import { PAYMENT_PROOF_ACCEPT, PAYMENT_PROOF_RULES } from '@/lib/payments/payment-proof-api';
import { filledInstructionFields, PAYMENT_INSTRUCTION_LABELS } from '@/lib/payments/payment-instructions';
import { documentFormat, documentTexts, type DocumentTexts } from '@/lib/format/document-format';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import type { SingleFileUploadRequest } from '@/lib/files/upload-single-file';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { SingleFileField, useSingleFileUpload } from '@/components/shared/single-file-field';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { DateLocaleProvider } from '@/components/ui/date-locale';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

// Copy como constantes (i18n-ready). Español neutro y de «tú», sin nada de un país.
export const publicPaymentCopy = {
  loading: 'Cargando tu enlace de pago…',
  // Sin «Intenta de nuevo.»: `SectionError` trae su botón.
  loadError: 'No pudimos cargar tu enlace de pago. Revisa tu conexión.',
  invalidTitle: 'Enlace no válido',
  invalidMessage: 'Este enlace ya no es válido. Pide a la clínica uno nuevo.',
  reportedTitle: 'Ya recibimos tu reporte de pago',
  reportedMessage: 'La clínica lo está revisando. Si necesitas reportar otro pago, pide un enlace nuevo.',
  fallbackClinic: 'Tu clínica',
  title: 'Reporta tu pago',
  greeting: (name: string | null) => (name ? `Hola, ${name}.` : 'Hola.'),
  amountLabel: 'Importe a pagar',
  equivalents: (parts: string[]) => `Equivale a ${parts.join(' · ')}`,
  rateOf: (day: string) => `con la tasa del ${day}.`,
  equivalentsUnavailable: 'Consulta el importe en otra moneda con la clínica.',
  noFormat: 'Consulta el importe con la clínica.',
  expires: (when: string) => `El enlace caduca el ${when}${when.endsWith('.') ? '' : '.'}`,
  howToPay: 'Cómo pagar',
  howToPayHint: 'Paga con uno de estos medios y después reporta el pago abajo, con el comprobante.',
  copy: 'Copiar',
  copied: 'Copiado',
  copyLabel: (label: string, method: string) => `Copiar ${label.toLowerCase()} de ${method}`,
  copiedAnnounce: (label: string) => `${label} copiado.`,
  copyFailed: 'No pudimos copiar: selecciona el dato y cópialo a mano.',
  reportHeading: 'Datos del pago que hiciste',
  method: 'Medio con que pagaste',
  currency: 'Moneda',
  amount: 'Importe pagado',
  reference: 'Referencia del pago',
  referenceRequired: 'Referencia del pago (obligatoria)',
  referenceOptional: 'Referencia del pago (opcional)',
  referenceHint: 'El número de la operación que te dio el banco o la aplicación.',
  paidOn: 'Fecha del pago',
  paidOnHint: (from: string, to: string) => `Entre el ${from} y el ${to}.`,
  proof: 'Comprobante',
  proofRequired: 'Comprobante (obligatorio)',
  proofOptional: 'Comprobante (opcional)',
  proofHint: 'La captura o el PDF del pago: JPG, PNG, WebP o PDF de hasta 10 MB. Solo lo ve la clínica.',
  proofStaged: (name: string) => `Comprobante recibido: ${name}.`,
  proofReplace: 'Subir otro',
  uploadsLeft: (n: number) => (n === 1 ? 'Puedes subir 1 comprobante más.' : `Puedes subir ${n} comprobantes más.`),
  uploadsExhausted: 'Ya no puedes subir más comprobantes con este enlace. Pide a la clínica uno nuevo si lo necesitas.',
  note: 'Nota para la clínica (opcional)',
  submit: 'Enviar reporte',
  submitting: 'Enviando…',
  errMethod: 'Elige el medio con que pagaste.',
  errCurrency: 'Elige la moneda del pago.',
  errAmount: 'Escribe el importe que pagaste.',
  errAmountPositive: 'El importe tiene que ser mayor que 0.',
  errReference: 'Escribe la referencia del pago.',
  errReferenceLong: 'La referencia admite hasta 60 caracteres.',
  errPaidOn: 'Escribe la fecha del pago.',
  errPaidOnRange: (from: string, to: string) => `La fecha tiene que estar entre el ${from} y el ${to}.`,
  errProof: 'Adjunta el comprobante del pago.',
  errProofBusy: 'Espera a que termine la subida del comprobante.',
  errNote: 'La nota admite hasta 280 caracteres.',
  missing: (n: number) => (n === 1 ? 'Falta 1 dato: revísalo arriba.' : `Faltan ${n} datos: revísalos arriba.`),
  submitError: 'No pudimos enviar tu reporte.',
  network: 'No pudimos enviar tu reporte. Revisa tu conexión e inténtalo de nuevo.',
  proofError: 'No pudimos guardar el comprobante.',
  doneTitle: 'Recibimos tu reporte de pago',
  doneMessage: (clinic: string) => `${clinic} lo revisará y te confirmará el pago. Ya puedes cerrar esta página.`,
  noMethods: 'La clínica no tiene medios de pago disponibles en este enlace. Contacta con ella para pagar.',
};
const copy = publicPaymentCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'reported' }
  | { kind: 'ready'; data: PublicPaymentLink };

/**
 * Página pública `/pago/[token]` (DX-569): el paciente ve lo que se le pide
 * (concepto genérico, importe y sus equivalencias con la tasa del día ya
 * guardada), los datos para pagar de cada medio con «Copiar», y reporta su
 * pago con el comprobante. Nada clínico: ni tratamientos ni datos de salud.
 * 404 → enlace no válido; 410 → ya se reportó.
 */
export function PublicPaymentLinkView({ linkToken }: { linkToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const markedOpened = useRef(false);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  useEffect(() => {
    let cancelled = false;
    getPublicPaymentLink(linkToken)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 410) setState({ kind: 'reported' });
        else if (err instanceof ApiError && err.status === 404) setState({ kind: 'invalid' });
        else setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, reloadKey]);

  // La página (no un previsualizador) avisa de que se abrió; un fallo no se enseña.
  useEffect(() => {
    if (state.kind !== 'ready' || markedOpened.current) return;
    markedOpened.current = true;
    markPublicPaymentLinkOpened(linkToken).catch(() => undefined);
  }, [state.kind, linkToken]);

  const clinic = state.kind === 'ready' ? state.data.clinic : null;
  const clinicName = clinic?.name ?? copy.fallbackClinic;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-bg">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            description={copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'invalid' && (
          <Notice headingLevel={1} icon={LinkIcon} title={copy.invalidTitle} message={copy.invalidMessage} />
        )}
        {state.kind === 'reported' && (
          <Notice headingLevel={1} icon={ReceiptText} title={copy.reportedTitle} message={copy.reportedMessage} />
        )}

        {state.kind === 'ready' && (
          <>
            <header className="flex items-center gap-3">
              {clinic?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- logo de la clínica en un host arbitrario; next/image exigiría whitelistear cada dominio
                <img
                  src={clinic.logoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-lg object-contain"
                />
              )}
              <p className="min-w-0 break-words text-base font-semibold text-ink">{clinicName}</p>
            </header>

            {done ? (
              <div
                role="status"
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-6 py-12 text-center"
              >
                <span
                  aria-hidden
                  className="mb-1 flex size-10 items-center justify-center rounded-full bg-success-subtle text-success-text"
                >
                  <CheckCircle2 className="size-5" />
                </span>
                <h1 ref={doneRef} tabIndex={-1} className="text-lg font-semibold text-ink">
                  {copy.doneTitle}
                </h1>
                <p className="max-w-sm text-sm text-muted">{copy.doneMessage(clinicName)}</p>
              </div>
            ) : (
              <ReadyContent
                linkToken={linkToken}
                data={state.data}
                onSubmitted={() => setDone(true)}
                onGone={(kind) => setState({ kind })}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ReadyContent({
  linkToken,
  data,
  onSubmitted,
  onGone,
}: {
  linkToken: string;
  data: PublicPaymentLink;
  onSubmitted: () => void;
  onGone: (kind: 'invalid' | 'reported') => void;
}) {
  const format = documentFormat(data.regional);
  const texts = documentTexts(format);
  const equivalents = data.equivalents.map((e) => texts.amount(e.amount, e.currency));

  const content = (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="t-display text-ink">{copy.title}</h1>
        <p className="text-base text-ink">{copy.greeting(data.patientFirstName)}</p>
      </div>

      <section
        aria-labelledby="pago-importe"
        className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-4"
      >
        <p className="text-sm text-muted">{data.conceptLabel}</p>
        <h2 id="pago-importe" className="sr-only">
          {copy.amountLabel}
        </h2>
        <p className="t-display tabular-nums text-ink" data-testid="payment-amount">
          {texts.amount(data.amount, data.currency)}
        </p>
        {!format ? (
          <p className="text-sm text-muted">{copy.noFormat}</p>
        ) : equivalents.length > 0 ? (
          <p className="text-sm text-ink tabular-nums" data-testid="payment-equivalents">
            {copy.equivalents(equivalents)}
            {data.rateDate ? ` ${copy.rateOf(texts.civilDate(data.rateDate))}` : '.'}
          </p>
        ) : data.equivalentsUnavailable ? (
          <p className="text-sm text-muted">{copy.equivalentsUnavailable}</p>
        ) : null}
        {format ? (
          <p className="text-xs text-muted tabular-nums">{copy.expires(texts.dateTime(data.expiresAt))}</p>
        ) : null}
      </section>

      {data.methods.length === 0 ? (
        <InlineError variant="summary">{copy.noMethods}</InlineError>
      ) : (
        <>
          <HowToPay methods={data.methods} />
          <ReportForm
            linkToken={linkToken}
            data={data}
            texts={texts}
            fmt={format?.fmt ?? null}
            onSubmitted={onSubmitted}
            onGone={onGone}
          />
        </>
      )}
    </>
  );

  // Los campos de fecha con el locale y la zona de la sede del enlace, nunca los del navegador.
  return (
    <DateLocaleProvider locale={data.regional?.locale} hourCycle={data.regional?.hourCycle} timeZone={data.regional?.timeZone}>
      {content}
    </DateLocaleProvider>
  );
}

/** Los medios con sus datos para pagar; cada dato con su «Copiar». */
function HowToPay({ methods }: { methods: PublicPaymentMethod[] }) {
  const [announce, setAnnounce] = useState('');
  return (
    <section aria-labelledby="pago-como" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="pago-como" className="t-title text-ink">
          {copy.howToPay}
        </h2>
        <p className="text-sm text-muted">{copy.howToPayHint}</p>
      </div>
      {methods.map((method) => {
        const fields = filledInstructionFields(method.instructions);
        return (
          <section
            key={method.id}
            aria-label={method.name}
            className="flex flex-col rounded-xl border border-border bg-surface px-4 py-3"
          >
            <h3 className="py-1 text-base font-semibold text-ink">{method.name}</h3>
            <dl className="flex flex-col divide-y divide-border-subtle">
              {fields.map(({ field, value }) => (
                <div key={field} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <dt className="t-caption text-muted">{PAYMENT_INSTRUCTION_LABELS[field]}</dt>
                    <dd className={field === 'note' ? 'whitespace-pre-line text-sm text-ink' : 'break-words text-base text-ink tabular-nums'}>
                      {value}
                    </dd>
                  </div>
                  {field === 'note' ? null : (
                    <CopyButton
                      value={value}
                      label={copy.copyLabel(PAYMENT_INSTRUCTION_LABELS[field], method.name)}
                      onCopied={(ok) =>
                        setAnnounce(ok ? copy.copiedAnnounce(PAYMENT_INSTRUCTION_LABELS[field]) : copy.copyFailed)
                      }
                    />
                  )}
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}

function CopyButton({ value, label, onCopied }: { value: string; label: string; onCopied: (ok: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied(true);
    } catch {
      onCopied(false);
    }
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label={label}
      onClick={() => void handleCopy()}
      className="shrink-0 max-sm:min-h-11"
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? copy.copied : copy.copy}
    </Button>
  );
}

type FieldKey = 'method' | 'currency' | 'amount' | 'reference' | 'paidOn' | 'proof' | 'note';
const FIELD_ORDER: FieldKey[] = ['method', 'currency', 'amount', 'reference', 'paidOn', 'proof', 'note'];

function ReportForm({
  linkToken,
  data,
  texts,
  fmt,
  onSubmitted,
  onGone,
}: {
  linkToken: string;
  data: PublicPaymentLink;
  texts: DocumentTexts;
  fmt: RegionalFormat | null;
  onSubmitted: () => void;
  onGone: (kind: 'invalid' | 'reported') => void;
}) {
  const ids = useId();
  const id = (key: FieldKey) => `${ids}-${key}`;
  const [methodId, setMethodId] = useState(data.methods.length === 1 ? data.methods[0].id : '');
  const [currency, setCurrency] = useState(data.currency);
  const [amountText, setAmountText] = useState(moneyInputText(data.amount));
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState<string | null>(data.paidOnMax);
  const [note, setNote] = useState('');
  const [staged, setStaged] = useState<PublicStagedProof | null>(data.stagedProof);
  const [uploadsLeft, setUploadsLeft] = useState(data.proofUploadsLeft);
  const [proofError, setProofError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const method = data.methods.find((m) => m.id === methodId) ?? null;
  const proofPolicy = method?.proofPolicy ?? 'NONE';
  const paidOnFrom = texts.civilDate(data.paidOnMin);
  const paidOnTo = texts.civilDate(data.paidOnMax);

  const requestTicket = useCallback(
    async (request: SingleFileUploadRequest) => {
      const ticket = await requestPublicProofUpload(linkToken, request);
      setUploadsLeft((n) => Math.max(0, n - 1));
      return ticket;
    },
    [linkToken],
  );
  const upload = useSingleFileUpload(PAYMENT_PROOF_RULES, requestTicket);
  const uploadedId = upload.uploadId;
  const clearUpload = upload.clear;

  // Subido al almacén: la API lo comprueba por contenido y lo deja preparado en el enlace.
  useEffect(() => {
    if (!uploadedId) return;
    let cancelled = false;
    completePublicProofUpload(linkToken, uploadedId)
      .then((result) => {
        if (cancelled) return;
        setStaged(result);
        setProofError(null);
        setErrors((prev) => ({ ...prev, proof: undefined }));
        clearUpload();
      })
      .catch((err) => {
        if (cancelled) return;
        setProofError(apiErrorMessage(err, copy.proofError));
        clearUpload();
      });
    return () => {
      cancelled = true;
    };
  }, [uploadedId, linkToken, clearUpload]);

  function validate(): Partial<Record<FieldKey, string>> {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!method) next.method = copy.errMethod;
    if (!currency) next.currency = copy.errCurrency;
    if (amountText.trim() === '') next.amount = copy.errAmount;
    else {
      const parsed = parseMoneyInput(amountText, currency);
      if (!parsed.ok) next.amount = parsed.message;
      else if (parsed.value <= 0) next.amount = copy.errAmountPositive;
    }
    const ref = reference.trim();
    if (method?.requiresReference && ref === '') next.reference = copy.errReference;
    else if (ref.length > 60) next.reference = copy.errReferenceLong;
    if (!paidOn) next.paidOn = copy.errPaidOn;
    else if (paidOn < data.paidOnMin || paidOn > data.paidOnMax) next.paidOn = copy.errPaidOnRange(paidOnFrom, paidOnTo);
    if (proofPolicy !== 'NONE') {
      if (upload.busy) next.proof = copy.errProofBusy;
      else if (proofPolicy === 'REQUIRED' && !staged) next.proof = copy.errProof;
    }
    if (note.trim().length > 280) next.note = copy.errNote;
    return next;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    const found = validate();
    setErrors(found);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      const el = document.getElementById(id(first)) ?? summaryRef.current;
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus({ preventScroll: true });
      return;
    }
    const parsed = parseMoneyInput(amountText, currency);
    if (!method || !paidOn || !parsed.ok) return;
    setSubmitting(true);
    try {
      await submitPaymentReport(linkToken, {
        paymentMethodId: method.id,
        currency,
        amount: parsed.value,
        reference: reference.trim() || null,
        paidOn,
        proofUploadId: proofPolicy !== 'NONE' && staged ? staged.uploadId : null,
        note: note.trim() || null,
      });
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) return onGone('reported');
      if (err instanceof ApiError && err.status === 404) return onGone('invalid');
      setSubmitError(apiErrorMessage(err, { fallback: copy.submitError, network: copy.network }));
      summaryRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  function clearError(key: FieldKey) {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  const missing = FIELD_ORDER.filter((k) => errors[k]).length;
  const describe = (key: FieldKey) => (errors[key] ? fieldErrorId(id(key)) : undefined);

  return (
    <section aria-labelledby={`${ids}-heading`} className="flex flex-col gap-4">
      <h2 id={`${ids}-heading`} className="t-title text-ink">
        {copy.reportHeading}
      </h2>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-5">
        <RadioGroup
          id={id('method')}
          legend={copy.method}
          value={methodId}
          error={errors.method ?? null}
          onValueChange={(v) => {
            setMethodId(v);
            clearError('method');
          }}
        >
          {data.methods.map((m, i) => (
            <RadioOption key={m.id} id={i === 0 ? id('method') : undefined} value={m.id} label={m.name} />
          ))}
        </RadioGroup>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor={id('currency')} label={copy.currency} error={errors.currency ?? null}>
            <NativeSelect
              id={id('currency')}
              value={currency}
              aria-invalid={errors.currency ? true : undefined}
              onChange={(e) => {
                const next = e.target.value;
                setCurrency(next);
                // El importe pedido solo se precarga en su moneda.
                setAmountText(next === data.currency ? moneyInputText(data.amount) : '');
                clearError('currency');
              }}
            >
              {data.currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor={id('amount')} label={copy.amount} error={errors.amount ?? null}>
            <MoneyInput
              id={id('amount')}
              value={amountText}
              currency={currency}
              requirePositive
              money={texts.amount}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={describe('amount')}
              onValueChange={(text) => {
                setAmountText(text);
                clearError('amount');
              }}
            />
          </FormField>
        </div>

        <FormField
          htmlFor={id('reference')}
          label={method?.requiresReference ? copy.referenceRequired : copy.referenceOptional}
          hint={copy.referenceHint}
          error={errors.reference ?? null}
        >
          <Input
            id={id('reference')}
            value={reference}
            maxLength={60}
            autoComplete="off"
            aria-invalid={errors.reference ? true : undefined}
            aria-required={method?.requiresReference ? true : undefined}
            onChange={(e) => {
              setReference(e.target.value);
              clearError('reference');
            }}
          />
        </FormField>

        <FormField
          htmlFor={id('paidOn')}
          label={copy.paidOn}
          hint={copy.paidOnHint(paidOnFrom, paidOnTo)}
          error={errors.paidOn ?? null}
        >
          <DateField
            id={id('paidOn')}
            value={paidOn}
            min={data.paidOnMin}
            max={data.paidOnMax}
            isInvalid={!!errors.paidOn}
            onChange={(v) => {
              setPaidOn(v);
              clearError('paidOn');
            }}
          />
        </FormField>

        {proofPolicy !== 'NONE' ? (
          <div className="flex flex-col gap-2">
            {staged ? (
              <p className="text-sm text-ink" data-testid="proof-staged">
                {copy.proofStaged(staged.name)}
              </p>
            ) : null}
            {uploadsLeft > 0 ? (
              <SingleFileField
                id={id('proof')}
                label={proofPolicy === 'REQUIRED' ? copy.proofRequired : copy.proofOptional}
                hint={`${copy.proofHint} ${copy.uploadsLeft(uploadsLeft)}`}
                accept={PAYMENT_PROOF_ACCEPT}
                upload={upload}
                fmt={fmt}
              />
            ) : staged ? null : (
              <p className="text-sm text-muted">{copy.uploadsExhausted}</p>
            )}
            {proofError ? <InlineError className="text-xs">{proofError}</InlineError> : null}
            {errors.proof ? (
              <InlineError id={fieldErrorId(id('proof'))} className="text-xs">
                {errors.proof}
              </InlineError>
            ) : null}
          </div>
        ) : null}

        <FormField htmlFor={id('note')} label={copy.note} error={errors.note ?? null}>
          <Textarea
            id={id('note')}
            autoGrow
            value={note}
            maxLength={280}
            aria-invalid={errors.note ? true : undefined}
            onChange={(e) => {
              setNote(e.target.value);
              clearError('note');
            }}
          />
        </FormField>

        <div ref={summaryRef} tabIndex={-1} className="flex flex-col gap-3 focus-visible:outline-none">
          {missing > 0 && <InlineError variant="summary">{copy.missing(missing)}</InlineError>}
          {submitError && <InlineError variant="summary">{submitError}</InlineError>}
        </div>

        <Button type="submit" size="lg" loading={submitting} className="w-full sm:w-auto sm:self-start">
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </form>
    </section>
  );
}
