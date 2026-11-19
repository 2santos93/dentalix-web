'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import {
  PAYMENT_LINK_CONCEPT_LABELS,
  createPaymentLink,
  listPatientPaymentLinks,
  type CreatedPaymentLink,
  type PatientPaymentLink,
  type PaymentLinkChannel,
} from '@/lib/payment-links/payment-links-api';
import type { PaymentLinkTargetOption } from '@/lib/payment-links/payment-link-targets';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { ExternalLink } from '@/components/shared/external-link';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { FieldError } from '@/components/errors/field-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { endSentence } from '@/lib/format/text';

type ChannelChoice = PaymentLinkChannel | 'COPY';

export const sendPaymentLinkCopy = {
  title: 'Enviar enlace de pago',
  description:
    'El paciente ve lo que se le pide y los datos para pagar, y reporta su pago con el comprobante. La caja lo confirma en «Pagos por confirmar».',
  target: 'Qué paga',
  amount: 'Importe que se pide',
  suggestedInstallment: 'Precargado con la próxima cuota.',
  suggestedBalance: 'Precargado con el saldo.',
  currency: (code: string) => `En ${code}, la moneda de lo que paga.`,
  channel: 'Cómo enviarlo',
  channels: {
    EMAIL: 'Por email',
    WHATSAPP: 'Por WhatsApp',
    COPY: 'Solo copiar el enlace',
  } satisfies Record<ChannelChoice, string>,
  channelHint: 'El mensaje no lleva importes ni tratamientos.',
  submit: 'Crear enlace',
  close: 'Cerrar',
  amountRequired: 'Escribe el importe que se pide.',
  amountPositive: 'El importe tiene que ser mayor que 0.',
  genericError: 'No pudimos crear el enlace. Intenta de nuevo.',
  noTargets: 'Este paciente no tiene saldo pendiente que cobrar por enlace.',
  linkLabel: 'Enlace de pago',
  expires: (when: string) => `${endSentence(`Caduca el ${when}`)} Sirve para un solo reporte.`,
  copyLink: 'Copiar enlace',
  copied: 'Enlace copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
  whatsapp: 'Abrir WhatsApp',
  emailSent: (to: string) => `Enviado a ${to}.`,
  revoked: (n: number) =>
    n === 1
      ? 'Se anuló el enlace anterior de este mismo destino: ya no sirve.'
      : `Se anularon ${n} enlaces anteriores de este mismo destino: ya no sirven.`,
  historyHeading: 'Enlaces enviados',
  historyEmpty: 'Todavía no se le ha enviado ningún enlace de pago.',
  historyError: 'No pudimos cargar los enlaces',
  historyLoading: 'Cargando los enlaces enviados…',
  historyRow: (concept: string, amount: string, when: string) => `${concept} · ${amount} · ${when}`,
};
const copy = sendPaymentLinkCopy;

interface SendPaymentLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  targets: PaymentLinkTargetOption[];
  /** Desde una cuota: su plan y lo que queda de ella. */
  initial?: { key: string; amount: number } | null;
}

/**
 * «Enviar enlace de pago» (DX-569): recepción elige qué paga el paciente (un
 * plan o un saldo migrado), el importe (precargado con la próxima cuota o con
 * el saldo, en la moneda del destino) y cómo enviarlo. La URL solo existe en
 * la respuesta: se copia o se abre en WhatsApp aquí. Debajo, los enlaces que
 * ya se le enviaron con su estado. El padre lo monta con una `key` por apertura.
 */
export function SendPaymentLinkModal({ open, onOpenChange, token, patientId, targets, initial }: SendPaymentLinkModalProps) {
  const ids = useId();
  const initialTarget = targets.find((t) => t.key === initial?.key) ?? targets[0] ?? null;
  const [targetKey, setTargetKey] = useState(initialTarget?.key ?? '');
  const [amountText, setAmountText] = useState(() =>
    initialTarget ? moneyInputText(initial && initial.key === initialTarget.key ? initial.amount : initialTarget.suggestedAmount) : '',
  );
  const [channel, setChannel] = useState<ChannelChoice>('WHATSAPP');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedPaymentLink | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const amountRef = useRef<HTMLInputElement>(null);

  const target = targets.find((t) => t.key === targetKey) ?? null;
  const fromInstallment = initial?.key === targetKey || target?.suggestedFrom === 'installment';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    if (amountText.trim() === '') {
      setAmountError(copy.amountRequired);
      amountRef.current?.focus();
      return;
    }
    const parsed = parseMoneyInput(amountText, target.currency);
    if (!parsed.ok || parsed.value <= 0) {
      setAmountError(parsed.ok ? copy.amountPositive : parsed.message);
      amountRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const link = await createPaymentLink(token, patientId, {
        target: target.target,
        amount: parsed.value,
        currency: target.currency,
        channel: channel === 'COPY' ? null : channel,
      });
      setCreated(link);
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={!target}
      hideSubmit={created !== null}
      cancelLabel={created ? copy.close : undefined}
      error={error}
      touchTargets
    >
      {created ? (
        <CreatedLinkPanel token={token} link={created} />
      ) : targets.length === 0 ? (
        <p className="text-sm text-muted">{copy.noTargets}</p>
      ) : (
        <>
          <FormField htmlFor={`${ids}-target`} label={copy.target}>
            <NativeSelect
              id={`${ids}-target`}
              value={targetKey}
              onChange={(e) => {
                const next = targets.find((t) => t.key === e.target.value);
                setTargetKey(e.target.value);
                if (next) setAmountText(moneyInputText(next.suggestedAmount));
                setAmountError(null);
              }}
            >
              {targets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {target ? (
            <AmountField
              id={`${ids}-amount`}
              token={token}
              ref={amountRef}
              value={amountText}
              currency={target.currency}
              error={amountError}
              hint={`${fromInstallment ? copy.suggestedInstallment : copy.suggestedBalance} ${copy.currency(target.currency)}`}
              onChange={(text) => {
                setAmountText(text);
                if (amountError) setAmountError(null);
              }}
            />
          ) : null}
          <RadioGroup
            id={`${ids}-channel`}
            legend={copy.channel}
            hint={copy.channelHint}
            value={channel}
            onValueChange={(v) => setChannel(v as ChannelChoice)}
          >
            {(['WHATSAPP', 'EMAIL', 'COPY'] as const).map((c, i) => (
              <RadioOption key={c} id={i === 0 ? `${ids}-channel` : undefined} value={c} label={copy.channels[c]} />
            ))}
          </RadioGroup>
        </>
      )}
      <PatientLinksHistory key={historyKey} token={token} patientId={patientId} />
    </FormModal>
  );
}

const AmountField = React.forwardRef<
  HTMLInputElement,
  {
    id: string;
    token: string;
    value: string;
    currency: string;
    error: string | null;
    hint: string;
    onChange: (text: string) => void;
  }
>(function AmountField({ id, token, value, currency, error, hint, onChange }, ref) {
  const stamp = useSedeStamp(token);
  return (
    <FormField htmlFor={id} label={copy.amount} error={error} hint={hint}>
      <MoneyInput
        id={id}
        ref={ref}
        value={value}
        currency={currency}
        requirePositive
        money={stamp.money}
        onValueChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId(id) : undefined}
      />
    </FormField>
  );
});

/** La URL recién creada: copiar, abrir WhatsApp, a quién se envió y si anuló otro. */
function CreatedLinkPanel({ token, link }: { token: string; link: CreatedPaymentLink }) {
  const ids = useId();
  const stamp = useSedeStamp(token);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const when = stamp.maybe.dateTime(link.expiresAt);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyState('copied');
    } catch {
      inputRef.current?.select();
      setCopyState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3" data-testid="payment-link-created">
      <label htmlFor={`${ids}-url`} className="t-label text-muted">
        {copy.linkLabel}
      </label>
      <Input
        id={`${ids}-url`}
        ref={inputRef}
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs"
      />
      {when ? <p className="text-xs text-muted tabular-nums">{copy.expires(when)}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" onClick={() => void handleCopy()} className="w-full sm:w-auto">
          {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copyLink}
        </Button>
        {link.whatsapp ? (
          <Button asChild className="w-full sm:w-auto">
            <ExternalLink href={whatsAppUrl(link.whatsapp.phone, link.whatsapp.text)}>
              <MessageCircle aria-hidden /> {copy.whatsapp}
            </ExternalLink>
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="text-xs text-muted empty:hidden">
        {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
      </p>
      {link.emailSentTo ? <p className="text-sm text-ink">{copy.emailSent(link.emailSentTo)}</p> : null}
      {link.revokedPrevious > 0 ? (
        <Callout tone="neutral" role="status">
          {copy.revoked(link.revokedPrevious)}
        </Callout>
      ) : null}
    </div>
  );
}

type HistoryState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; links: PatientPaymentLink[] };

/** Los enlaces de pago del paciente, con su estado (sin URL: no se guarda). */
function PatientLinksHistory({ token, patientId }: { token: string; patientId: string }) {
  const ids = useId();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; value: HistoryState }>({ attempt: 0, value: { kind: 'loading' } });
  const current: HistoryState = state.attempt === attempt ? state.value : { kind: 'loading' };
  const links = current.kind === 'ready' ? current.links : [];
  const stamp = useSedeStamp(
    token,
    links.map((l) => l.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    listPatientPaymentLinks(token, patientId)
      .then((data) => {
        if (!cancelled) setState({ attempt, value: { kind: 'ready', links: data } });
      })
      .catch(() => {
        if (!cancelled) setState({ attempt, value: { kind: 'error' } });
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, attempt]);

  return (
    <section aria-labelledby={`${ids}-h`} className="flex flex-col gap-2 border-t border-border-subtle pt-4">
      <h3 id={`${ids}-h`} className="t-label text-ink">
        {copy.historyHeading}
      </h3>
      {current.kind === 'loading' ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{copy.historyLoading}</span>
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
      ) : current.kind === 'error' ? (
        <FieldError label={copy.historyError} className="w-full" onRetry={() => setAttempt((n) => n + 1)} />
      ) : links.length === 0 ? (
        <p className="text-sm text-muted">{copy.historyEmpty}</p>
      ) : (
        <>
          <SedeStampNote stamp={stamp} />
          <ul className="flex flex-col divide-y divide-border-subtle" aria-labelledby={`${ids}-h`}>
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 tabular-nums text-ink">
                  {copy.historyRow(
                    PAYMENT_LINK_CONCEPT_LABELS[l.concept],
                    stamp.money(l.amount, l.currency, l.locationId),
                    stamp.date(l.createdAt, l.locationId),
                  )}
                </span>
                <StatusBadge kind="paymentLink" status={l.status} className="shrink-0" />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
