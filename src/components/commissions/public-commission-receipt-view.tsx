'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { CheckCircle2, Download, SearchX } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  COMMISSION_PAYMENT_LIMITS,
  downloadPublicCommissionReceipt,
  getPublicCommissionReceipt,
  markPublicCommissionReceiptOpened,
  percentText,
  signPublicCommissionReceipt,
  type PublicCommissionReceipt,
  type PublicCommissionReceiptLine,
} from '@/lib/commissions/commissions-api';
import { saveBlob } from '@/lib/files/save-blob';
import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT, moneyWithCode } from '@/lib/format/sede-number';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { useClinicBranding } from '@/components/brand/branding-context';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { PublicNotice, publicBrandStyle } from '@/components/shared/public-page';
import { SignaturePad } from '@/components/shared/signature-pad';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const publicCommissionReceiptCopy = {
  loading: 'Abriendo el recibo…',
  title: 'Recibo de pago de honorarios',
  intro: (name: string) => `${name}: revisa el pago y, si está bien, firma «Recibí conforme».`,
  period: 'Período',
  paidOn: 'Fecha del pago',
  method: 'Medio',
  reference: 'Referencia',
  location: 'Sede',
  periodValue: (from: string, to: string) => `${from} – ${to}`,
  linesLabel: 'Prestaciones pagadas',
  colPatient: 'Paciente',
  colItem: 'Procedimiento',
  colDay: 'Fecha',
  colBase: 'Base',
  colPercent: '%',
  colAmount: 'Honorario',
  adjustment: 'Ajuste',
  tooth: (t: string) => `Diente ${t}`,
  baseAt: (base: string, percent: string) => `Base ${base} al ${percent}`,
  total: 'Total pagado',
  signerName: 'Tu nombre completo',
  signature: 'Tu firma',
  signatureHint: 'Firma con el dedo o con el ratón.',
  accept: 'Recibí conforme el pago',
  acceptHint: 'Confirmas que recibiste este importe por los honorarios del recibo.',
  sign: 'Firmar',
  nameRequired: `Escribe tu nombre completo (al menos ${COMMISSION_PAYMENT_LIMITS.signerNameMin} caracteres).`,
  signatureRequired: 'Falta tu firma.',
  acceptRequired: 'Marca «Recibí conforme el pago» para firmar.',
  signError: 'No pudimos guardar tu firma. Intenta de nuevo.',
  signedTitle: 'Conformidad firmada',
  signedMessage: (name: string) => `Firmó ${name}. La clínica ya tiene tu conformidad junto al pago.`,
  downloadSigned: 'Descargar copia firmada',
  downloadError: 'No pudimos descargar la copia. Intenta de nuevo.',
  fileName: (id: string) => `conformidad-honorarios-${id.slice(0, 8)}.pdf`,
  notFoundTitle: 'Este enlace no es válido',
  notFoundMessage:
    'Este enlace no es válido o ya caducó. Puede que la clínica haya creado otro más reciente o que el pago se haya anulado: pídele uno nuevo.',
  loadError: 'No pudimos abrir el recibo. Revisa tu conexión.',
};

const copy = publicCommissionReceiptCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'notFound' }
  | { kind: 'ready'; data: PublicCommissionReceipt };

/** El formato de la sede del pago, congelado en el recibo; sin él, «—» (nunca el del navegador). */
function receiptFormat(format: PublicCommissionReceipt['content']['format']): RegionalFormat | null {
  if (!format.locale || (format.hourCycle !== 'h12' && format.hourCycle !== 'h23')) return null;
  try {
    return regionalFormat({ locale: format.locale, hourCycle: format.hourCycle });
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

function lineColumns(
  civil: (day: string | null) => string,
  amount: (value: number) => string,
): DataListColumn<PublicCommissionReceiptLine>[] {
  return [
    { id: 'patient', header: copy.colPatient, mobile: 'hidden', cell: (l) => <span className="font-medium">{l.patientInitials}</span> },
    {
      id: 'item',
      header: copy.colItem,
      mobile: 'primary',
      cell: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="[overflow-wrap:anywhere]">
            {l.kind === 'ADJUSTMENT' ? `${copy.adjustment}: ${l.catalogLabel}` : l.catalogLabel}
          </span>
          <span className="t-caption text-muted">{copy.tooth(l.toothNumber)}</span>
        </span>
      ),
      mobileCell: (l) => (l.kind === 'ADJUSTMENT' ? `${copy.adjustment}: ${l.catalogLabel}` : l.catalogLabel),
    },
    {
      id: 'day',
      header: copy.colDay,
      cell: (l) => <span className="tabular-nums">{civil(l.day)}</span>,
      mobileCell: (l) => `${l.patientInitials} · ${copy.tooth(l.toothNumber)} · ${civil(l.day)}`,
    },
    {
      id: 'base',
      header: copy.colBase,
      numeric: true,
      align: 'end',
      cell: (l) => amount(l.base),
      mobileCell: (l) => copy.baseAt(amount(l.base), percentText(l.percent)),
    },
    {
      id: 'percent',
      header: copy.colPercent,
      numeric: true,
      align: 'end',
      mobile: 'hidden',
      cell: (l) => <span className="whitespace-nowrap">{percentText(l.percent)}</span>,
    },
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      align: 'end',
      mobile: 'trailing',
      cell: (l) => (
        <span className={cn('font-medium tabular-nums', l.amount < 0 && 'text-danger-text')}>{amount(l.amount)}</span>
      ),
    },
  ];
}

/**
 * Página pública `/conformidad/[token]` (DX-464): el profesional revisa el
 * recibo de un pago de sus honorarios (solo iniciales de los pacientes) y
 * firma «Recibí conforme». Abrirla avisa a la clínica (`opened`); firmar es
 * una sola vez. Firmado: confirmación y la copia firmada en PDF. Enlace
 * inválido, caducado o revocado: el aviso genérico. Móvil primero.
 */
export function PublicCommissionReceiptView({ linkToken }: { linkToken: string }) {
  const branding = useClinicBranding();
  const ids = useId();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [nameDraft, setName] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; signature?: string; accepted?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicCommissionReceipt(linkToken)
      .then((data) => {
        if (cancelled) return;
        setState({ kind: 'ready', data });
        if (data.status === 'PENDING') void markPublicCommissionReceiptOpened(linkToken).catch(() => undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { kind: 'notFound' } : { kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, reloadKey]);

  const data = state.kind === 'ready' ? state.data : null;
  const fmt = useMemo(() => (data ? receiptFormat(data.content.format) : null), [data]);
  const money = (amount: number, currency: string) => (fmt ? moneyWithCode(amount, currency, fmt) : NO_SEDE_FORMAT);
  const civil = (day: string | null) => {
    if (!fmt || !day) return NO_SEDE_FORMAT;
    try {
      return fmt.civilDate(day.slice(0, 10));
    } catch {
      return NO_SEDE_FORMAT;
    }
  };
  const name = nameDraft ?? data?.content.professionalName ?? '';

  async function handleSign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, ' ');
    const next: typeof errors = {};
    if (Array.from(trimmed).length < COMMISSION_PAYMENT_LIMITS.signerNameMin) next.name = copy.nameRequired;
    if (!signature) next.signature = copy.signatureRequired;
    if (!accepted) next.accepted = copy.acceptRequired;
    setErrors(next);
    if (next.name || next.signature || next.accepted || !signature) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const signed = await signPublicCommissionReceipt(linkToken, { signerName: trimmed, signature, accepted: true });
      setState({ kind: 'ready', data: signed });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: 'notFound' });
      else setSubmitError(apiErrorMessage(err, copy.signError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload(current: PublicCommissionReceipt) {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, fileName } = await downloadPublicCommissionReceipt(linkToken);
      const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
      saveBlob(pdf, fileName ?? copy.fileName(current.content.payment.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: 'notFound' });
      else setDownloadError(copy.downloadError);
    } finally {
      setDownloading(false);
    }
  }

  const clinicName = branding.name ?? data?.content.clinicName ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas" style={publicBrandStyle(branding)}>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
        {clinicName ? <ClinicBrand name={clinicName} logoUrl={branding.logoUrl} variant="public" as="p" /> : null}

        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-10 w-64 rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
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

        {state.kind === 'notFound' && (
          <PublicNotice headingLevel={1} icon={SearchX} title={copy.notFoundTitle} message={copy.notFoundMessage} />
        )}

        {data ? (
          <>
            <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-6">
              <div className="flex flex-col gap-1">
                <h1 className="t-display break-words">{copy.title}</h1>
                <p className="text-sm text-muted">{copy.intro(data.content.professionalName)}</p>
              </div>
              <DescriptionList columns={2}>
                <DescriptionItem label={copy.period} numeric>
                  {copy.periodValue(civil(data.content.period.from), civil(data.content.period.to))}
                </DescriptionItem>
                <DescriptionItem label={copy.paidOn} numeric>
                  {civil(data.content.payment.paidOn)}
                </DescriptionItem>
                <DescriptionItem label={copy.method}>{PAYMENT_METHOD_LABELS[data.content.payment.method]}</DescriptionItem>
                {data.content.payment.reference ? (
                  <DescriptionItem label={copy.reference}>{data.content.payment.reference}</DescriptionItem>
                ) : null}
                <DescriptionItem label={copy.location}>{data.content.payment.locationName}</DescriptionItem>
              </DescriptionList>

              <DataList
                label={copy.linesLabel}
                rows={data.content.lines}
                columns={lineColumns(civil, (amount) => money(amount, data.content.payment.currency))}
                getRowKey={(l) => `${l.catalogCode}-${l.toothNumber}-${l.kind}-${data.content.lines.indexOf(l)}`}
              />
              <div className="flex items-baseline justify-end gap-3 border-t border-border pt-3">
                <span className="text-sm font-semibold text-ink">{copy.total}</span>
                <span className="text-base font-semibold tabular-nums text-ink" data-testid="receipt-total">
                  {money(data.content.payment.amount, data.content.payment.currency)}
                </span>
              </div>
            </section>

            {data.status === 'SIGNED' ? (
              <section role="status" className="flex flex-col gap-4">
                <PublicNotice
                  icon={CheckCircle2}
                  title={copy.signedTitle}
                  message={copy.signedMessage(data.signerName ?? data.content.professionalName)}
                />
                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full"
                  loading={downloading}
                  onClick={() => void handleDownload(data)}
                >
                  <Download aria-hidden /> {copy.downloadSigned}
                </Button>
                {downloadError ? <InlineError>{downloadError}</InlineError> : null}
              </section>
            ) : (
              <form
                noValidate
                onSubmit={(e) => void handleSign(e)}
                className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-6"
              >
                <FormField htmlFor={`${ids}-name`} label={copy.signerName} error={errors.name}>
                  <Input
                    id={`${ids}-name`}
                    value={name}
                    maxLength={COMMISSION_PAYMENT_LIMITS.signerNameMax}
                    autoComplete="name"
                    disabled={submitting}
                    aria-invalid={errors.name ? true : undefined}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                    }}
                  />
                </FormField>
                <div className="flex flex-col gap-1">
                  <SignaturePad
                    label={copy.signature}
                    hint={copy.signatureHint}
                    onChange={(value) => {
                      setSignature(value);
                      if (value) setErrors((x) => ({ ...x, signature: undefined }));
                    }}
                    disabled={submitting}
                    height={180}
                    canvasId={`${ids}-signature`}
                    errorId={errors.signature ? `${ids}-signature-error` : undefined}
                  />
                  {errors.signature ? <InlineError id={`${ids}-signature-error`}>{errors.signature}</InlineError> : null}
                </div>
                <Checkbox
                  id={`${ids}-accept`}
                  checked={accepted}
                  disabled={submitting}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    if (e.target.checked) setErrors((x) => ({ ...x, accepted: undefined }));
                  }}
                  label={copy.accept}
                  description={copy.acceptHint}
                  error={errors.accepted}
                />
                {submitError ? <InlineError id={fieldErrorId(`${ids}-submit`)}>{submitError}</InlineError> : null}
                <Button type="submit" size="lg" className="h-12 w-full" loading={submitting}>
                  {copy.sign}
                </Button>
              </form>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
