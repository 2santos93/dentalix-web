'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Lock, Mail, Printer, ReceiptText } from 'lucide-react';
import type { CalendarDate } from '@internationalized/date';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { todayDate, type IsoRange } from '@/lib/dates/iso';
import {
  getReceiptsSummary,
  receiptsSummaryPrintHref,
  sendReceiptsSummary,
  type ReceiptsSummary,
  type SendReceiptsSummaryResult,
} from '@/lib/payments/receipts-summary-api';
import {
  SUMMARY_PRESETS,
  activeSummaryPreset,
  defaultSummaryRange,
  summaryRangeError,
} from '@/lib/payments/receipts-summary-range';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { ExternalLink } from '@/components/shared/external-link';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { cn } from '@/lib/utils';
import { receiptsSummaryCopy } from './receipts-summary-copy';

const copy = receiptsSummaryCopy;

interface ReceiptsSummaryDialogProps {
  token: string;
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Recibo resumen de un periodo (DX-401): elige el periodo (por defecto, del
 * día 1 del mes de la sede a hoy), enseña los recibos con el total por moneda
 * (los anulados, marcados y fuera del total) y ofrece imprimirlo (vista
 * imprimible en otra pestaña) o enviarlo por email. Solo PAYMENT_ROLES: quien
 * lo monta decide; la API vuelve a comprobarlo (403).
 */
export function ReceiptsSummaryDialog({ token, patientId, open, onOpenChange }: ReceiptsSummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-w-2xl gap-4 p-4 sm:p-6" fullScreenOnMobile>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <SummaryBody token={token} patientId={patientId} onClose={() => onOpenChange(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function SummaryBody({ token, patientId, onClose }: { token: string; patientId: string; onClose: () => void }) {
  // «Hoy» es el de la sede (DX-097), nunca el del navegador.
  const zone = useSedeTimeZone(token);
  if (zone.status === 'loading') {
    return (
      <p role="status" className="py-8 text-sm text-muted">
        {copy.preparing}
      </p>
    );
  }
  if (zone.status === 'error') {
    return <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />;
  }
  return (
    <SummaryForm token={token} patientId={patientId} today={todayDate(zone.timeZone)} onClose={onClose} />
  );
}

/** Pausa de tecleo antes de pedir otro periodo. */
const TYPING_PAUSE_MS = 400;

type Load =
  | { status: 'loading' }
  | { status: 'ready'; data: ReceiptsSummary }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

/** Lo que se sabe de un periodo (`key` = «desde/hasta»): solo se pinta si es el elegido. */
type Keyed<T> = T & { key: string };

type SendOutcome = { status: 'sent'; result: SendReceiptsSummaryResult } | { status: 'failed'; message: string };

function SummaryForm({
  token,
  patientId,
  today,
  onClose,
}: {
  token: string;
  patientId: string;
  today: CalendarDate;
  onClose: () => void;
}) {
  const ids = React.useId();
  const fromId = `${ids}-from`;
  const toId = `${ids}-to`;
  const [initial] = useState(() => defaultSummaryRange(today));
  const [from, setFrom] = useState<string | null>(initial.from);
  const [to, setTo] = useState<string | null>(initial.to);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<Keyed<Load> | null>(null);
  // El periodo que se pide en el acto (el de partida, un atajo, un reintento); lo tecleado espera la pausa.
  const immediateKey = React.useRef<string | null>(`${initial.from}/${initial.to}`);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Keyed<SendOutcome> | null>(null);
  const fmt = readyFormat(useSedeFormat(token));

  const rangeError = summaryRangeError(from, to);
  const range: IsoRange | null = rangeError === null && from && to ? { from, to } : null;
  const rangeKey = range ? `${range.from}/${range.to}` : null;

  useEffect(() => {
    if (!rangeKey) return;
    const [f, t] = rangeKey.split('/');
    let cancelled = false;
    // Cada consulta queda en la auditoría: mientras se teclea una fecha (cada
    // segmento es un día válido) se espera a que la persona pare.
    const wait = immediateKey.current === rangeKey ? 0 : TYPING_PAUSE_MS;
    const timer = setTimeout(() => {
      setLoad({ status: 'loading', key: rangeKey });
      getReceiptsSummary(token, patientId, { from: f, to: t })
        .then((data) => {
          if (!cancelled) setLoad({ status: 'ready', data, key: rangeKey });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 403) setLoad({ status: 'forbidden', key: rangeKey });
          else setLoad({ status: 'error', message: apiErrorMessage(err, { fallback: copy.loadError }), key: rangeKey });
        });
    }, wait);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, patientId, rangeKey, reloadKey]);

  function pick(next: IsoRange) {
    immediateKey.current = `${next.from}/${next.to}`;
    setFrom(next.from);
    setTo(next.to);
  }

  async function send() {
    if (!range || !rangeKey) return;
    setSending(true);
    setOutcome(null);
    try {
      const result = await sendReceiptsSummary(token, patientId, range);
      setOutcome({ status: 'sent', result, key: rangeKey });
    } catch (err) {
      // Escalón 4: falló el envío que se acaba de pedir; la vista previa sigue bien.
      setOutcome({ status: 'failed', message: apiErrorMessage(err, { fallback: copy.sendError }), key: rangeKey });
    } finally {
      setSending(false);
    }
  }

  const preset = from && to ? activeSummaryPreset({ from, to }, today) : null;
  // Solo vale lo del periodo elegido (no lo del anterior mientras se teclea); sin uno nuevo aún, «cargando».
  const current: Load | null = rangeKey === null ? null : load?.key === rangeKey ? load : { status: 'loading' };
  const data = current?.status === 'ready' ? current.data : null;
  const sent = outcome?.key === rangeKey && outcome.status === 'sent' ? outcome.result : null;
  const sendError = outcome?.key === rangeKey && outcome.status === 'failed' ? outcome.message : null;
  const hasReceipts = (data?.receipts.length ?? 0) > 0;
  const canPrint = range !== null && data !== null;
  const canSend = range !== null && hasReceipts && !sending;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField htmlFor={fromId} label={copy.from} error={rangeError?.field === 'from' ? rangeError.message : null}>
            <DatePicker
              id={fromId}
              value={from}
              onChange={setFrom}
              aria-invalid={rangeError?.field === 'from' ? true : undefined}
              aria-describedby={rangeError?.field === 'from' ? fieldErrorId(fromId) : undefined}
            />
          </FormField>
          <FormField htmlFor={toId} label={copy.to} error={rangeError?.field === 'to' ? rangeError.message : null}>
            <DatePicker
              id={toId}
              value={to}
              onChange={setTo}
              aria-invalid={rangeError?.field === 'to' ? true : undefined}
              aria-describedby={rangeError?.field === 'to' ? fieldErrorId(toId) : undefined}
            />
          </FormField>
        </div>
        <div role="group" aria-label={copy.presets} className="flex flex-wrap gap-2">
          {SUMMARY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => pick(p.range(today))}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-[0.8125rem] font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-sm:min-h-11 pointer-coarse:min-h-11',
                // Elegido = superficie hundida + tinta (como `SegmentedControl`), nunca el acento.
                preset === p.id
                  ? 'border-border-input bg-surface-active text-ink'
                  : 'border-border bg-surface text-muted hover:bg-surface-sunken hover:text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="min-w-0">
        {current?.status === 'loading' ? (
          <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted">
            <ReceiptText aria-hidden className="size-4" />
            {copy.loading}
          </p>
        ) : current?.status === 'forbidden' ? (
          <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : current?.status === 'error' ? (
          <SectionError
            description={current.message}
            onRetry={() => {
              immediateKey.current = rangeKey;
              setReloadKey((k) => k + 1);
            }}
          />
        ) : data ? (
          <SummaryPreview summary={data} fmt={fmt} />
        ) : null}
      </div>

      {sent ? (
        <p role="status" className="text-sm text-success-text" data-testid="receipts-summary-sent">
          {sent.sentToResponsible ? copy.sentToResponsible(sent.sentTo) : copy.sent(sent.sentTo)}
        </p>
      ) : null}
      {sendError ? <InlineError variant="summary">{sendError}</InlineError> : null}

      <DialogFooter className="max-sm:[&>*]:min-h-11">
        <Button type="button" variant="ghost" onClick={onClose}>
          {copy.close}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void send()} disabled={!canSend}>
          <Mail aria-hidden />
          {sending ? copy.sending : copy.send}
        </Button>
        {canPrint ? (
          <Button asChild>
            <ExternalLink href={receiptsSummaryPrintHref(patientId, range)}>
              <Printer aria-hidden />
              {copy.print}
            </ExternalLink>
          </Button>
        ) : (
          <Button type="button" disabled>
            <Printer aria-hidden />
            {copy.print}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** La vista previa: lista apilada (cabe en 390 px sin tabla ancha) y totales por moneda. */
export function SummaryPreview({ summary, fmt }: { summary: ReceiptsSummary; fmt: RegionalFormat | null }) {
  if (summary.receipts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {summary.restrictedToLocations ? <p className="text-sm text-muted">{copy.restricted}</p> : null}
        <EmptyState role="status" icon={<ReceiptText aria-hidden />} title={copy.emptyTitle} description={copy.emptyHint} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="receipts-summary-preview">
      {summary.restrictedToLocations ? <p className="text-sm text-muted">{copy.restricted}</p> : null}
      <ul aria-label={copy.listLabel} className="divide-y divide-border rounded-lg border border-border">
        {summary.receipts.map((r, i) => (
          <li
            key={`${r.paymentId}-${i}`}
            data-testid="receipts-summary-row"
            data-voided={r.voided || undefined}
            className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                <span className="tabular-nums">{r.receiptNumber}</span>
                {r.voided ? <Badge variant="neutral">{copy.voided}</Badge> : null}
              </p>
              <p className="text-sm text-muted [overflow-wrap:anywhere]">
                <span className="tabular-nums">{sedeCivilDate(r.issuedOn, fmt)}</span>
                {` · ${r.locationName} · ${r.methodLabel}`}
              </p>
              {r.voided && r.voidReason ? (
                <p className="text-xs text-muted [overflow-wrap:anywhere]">{copy.voidReason(r.voidReason)}</p>
              ) : null}
            </div>
            <p
              className={cn(
                'shrink-0 text-sm font-medium tabular-nums sm:text-right',
                r.voided ? 'text-muted line-through' : 'text-ink',
              )}
            >
              {sedeMoney(r.amount, r.currency, fmt)}
            </p>
          </li>
        ))}
      </ul>
      <dl aria-label={copy.totalsLabel} className="flex flex-col gap-1.5" data-testid="receipts-summary-totals">
        {summary.totals.map((t) => (
          <div key={t.currency} className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-sm text-muted">
              {copy.total(t.currency)} <span className="text-xs">({copy.receiptCount(t.count)})</span>
            </dt>
            <dd className="text-base font-semibold tabular-nums text-ink" data-testid={`receipts-summary-total-${t.currency}`}>
              {sedeMoney(t.amount, t.currency, fmt)}
            </dd>
          </div>
        ))}
      </dl>
      {summary.voidedCount > 0 ? <p className="text-xs text-muted">{copy.voidedExcluded(summary.voidedCount)}</p> : null}
      <p className="text-xs text-muted">{summary.notice}</p>
    </div>
  );
}
