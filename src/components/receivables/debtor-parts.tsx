'use client';
import * as React from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import type { RowAction } from '@/components/shared/row-actions';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDate } from '@/lib/format/date';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOfAge,
  collectionWhatsAppHref,
  telHref,
} from '@/lib/receivables/presentation';
import type { AgingCurrency, AgingRow } from '@/lib/receivables/receivables-api';
import { cn } from '@/lib/utils';
import { CHANNEL_LABELS, OUTCOME_LABELS } from '@/lib/collections/presentation';

export const debtorCopy = {
  days: (n: number) => (n === 1 ? '1 día' : `${n} días`),
  notDue: 'Por vencer',
  // Una sola nota al pie en vez de un chip en cada fila (crítica ops §5).
  approximateMark: '*',
  approximateSr: '(fecha aproximada)',
  approximateNote:
    '* Fecha aproximada: parte del saldo no está en cuotas y su antigüedad se cuenta desde la aceptación (o la creación) del plan.',
  credit: (amount: string) => `A favor: ${amount}`,
  noPayments: 'Sin abonos',
  noInstallment: 'Sin cuotas por vencer',
  noPhone: 'Sin teléfono',
  call: 'Llamar',
  callLabel: (name: string, phone: string) => `Llamar a ${name}: ${phone}`,
  callAction: (phone: string) => `Llamar al ${phone}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `WhatsApp a ${name}`,
  statement: 'Estado de cuenta',
  // DX-150: cobranza.
  noCollection: 'Sin gestiones',
  registerNote: 'Registrar gestión',
  promise: 'Compromiso de pago',
  promiseLine: (amount: string, day: string) => `${amount} para el ${day}`,
  // DX-215: estaba cumplido y se anuló el abono que lo cumplía.
  promiseReopened: 'Reabierto: se anuló el abono',
};

export function statementHref(patientId: string): string {
  return `/patients/${patientId}?tab=account-statement`;
}

// Neutral → warning → danger: solo lo más viejo pide atención (DESIGN.md → Status tones).
const AGE_BADGE: Record<ReturnType<typeof bucketOfAge>, 'neutral' | 'warning' | 'danger'> = {
  current: 'neutral',
  days0to30: 'neutral',
  days31to60: 'warning',
  days61to90: 'warning',
  over90: 'danger',
};

/** Los días con la marca «*» si la antigüedad es aproximada (la explica la nota al pie). */
function AgeDays({ row, plain = false }: { row: AgingRow; plain?: boolean }) {
  if (row.oldestAgeDays === null) return <span className="text-muted">{debtorCopy.notDue}</span>;
  return (
    <span className="whitespace-nowrap">
      <span className={cn('tabular-nums', !plain && 'font-medium text-ink')}>{debtorCopy.days(row.oldestAgeDays)}</span>
      {row.ageApproximate ? (
        <>
          <span aria-hidden className="text-muted">
            {debtorCopy.approximateMark}
          </span>
          <span className="sr-only"> {debtorCopy.approximateSr}</span>
        </>
      ) : null}
    </span>
  );
}

/** Días de la deuda vencida más antigua y su tramo, en una línea. */
export function AgeCell({ row }: { row: AgingRow }) {
  const bucket = bucketOfAge(row.oldestAgeDays);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <AgeDays row={row} />
      {row.oldestAgeDays !== null ? (
        <Badge variant={AGE_BADGE[bucket]} className="whitespace-nowrap">
          {BUCKET_LABELS[bucket]}
        </Badge>
      ) : null}
    </span>
  );
}

/** La antigüedad en la tarjeta del teléfono: texto corrido para la línea 2. */
export function AgeMeta({ row }: { row: AgingRow }) {
  const bucket = bucketOfAge(row.oldestAgeDays);
  if (row.oldestAgeDays === null) return <AgeDays row={row} plain />;
  return (
    <span>
      <AgeDays row={row} plain />{' '}
      <span className={cn(bucket === 'over90' && 'text-danger-text')}>({BUCKET_LABELS[bucket]})</span>
    </span>
  );
}

/** Deuda por moneda, con el saldo a favor aparte. */
export function DebtCell({ currencies, compact = false }: { currencies: AgingCurrency[]; compact?: boolean }) {
  // En la tarjeta del teléfono, solo lo que se debe: una moneda con solo saldo
  // a favor no pinta «0,00» junto al nombre.
  const shown = compact && currencies.some((c) => c.debt > 0) ? currencies.filter((c) => c.debt > 0) : currencies;
  const withCredit = !compact;
  return (
    <span className="flex flex-col gap-0.5">
      {shown.map((c) => (
        <span key={c.currency} className="whitespace-nowrap tabular-nums">
          <span className="font-medium text-ink">{formatCurrency(c.debt, c.currency)}</span>
          {withCredit && c.credit > 0 ? (
            <span className="block text-xs text-success-text">
              {debtorCopy.credit(formatCurrency(c.credit, c.currency))}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** Cuántos tramos con importe tiene la fila (en todas sus monedas). */
export function bucketLineCount(row: AgingRow): number {
  return row.currencies.reduce((n, c) => n + BUCKET_ORDER.filter((b) => c.buckets[b] > 0).length, 0);
}

/** Solo los tramos con importe, de más antiguo a más nuevo. */
export function BucketList({ currencies, className }: { currencies: AgingCurrency[]; className?: string }) {
  const lines = currencies.flatMap((c) =>
    [...BUCKET_ORDER]
      .reverse()
      .filter((bucket) => c.buckets[bucket] > 0)
      .map((bucket) => ({ key: `${c.currency}-${bucket}`, bucket, amount: formatCurrency(c.buckets[bucket], c.currency) })),
  );
  return (
    <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs', className)}>
      {lines.map((line) => (
        <React.Fragment key={line.key}>
          <dt className={cn('whitespace-nowrap text-left text-muted', line.bucket === 'over90' && 'text-danger-text')}>
            {BUCKET_LABELS[line.bucket]}
          </dt>
          <dd className="whitespace-nowrap text-right tabular-nums text-ink">{line.amount}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function LastPayment({ row }: { row: AgingRow }) {
  if (!row.lastPayment) return <span className="text-muted">{debtorCopy.noPayments}</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatCivilDate(row.lastPayment.paidOn)}
      <span className="block text-xs text-muted">
        {formatCurrency(row.lastPayment.amount, row.lastPayment.currency)}
      </span>
    </span>
  );
}

export function NextInstallment({ row }: { row: AgingRow }) {
  if (!row.nextInstallment) return <span className="block max-w-[8rem] text-muted">{debtorCopy.noInstallment}</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatCivilDate(row.nextInstallment.dueDate)}
      <span className="block text-xs text-muted">
        {formatCurrency(row.nextInstallment.amount, row.nextInstallment.currency)}
      </span>
    </span>
  );
}

/**
 * «Llamar» (tel:) y «WhatsApp» (wa.me con un mensaje sin importes) como dos
 * botones de icono, en la tabla. `relative z-10`: la fila entera es un enlace
 * estirado al estado de cuenta y estos dos tienen que quedar por encima.
 */
export function ContactButtons({ row, clinicName }: { row: AgingRow; clinicName: string | null }) {
  const { patient } = row;
  const whatsapp = collectionWhatsAppHref(patient, clinicName);
  if (!patient.phone) return <span className="whitespace-nowrap text-xs text-muted">{debtorCopy.noPhone}</span>;
  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      <Tooltip content={`${debtorCopy.call} · ${patient.phone}`}>
        <Button asChild variant="ghost" size="icon-sm">
          <a href={telHref(patient.phone)} aria-label={debtorCopy.callLabel(patient.fullName, patient.phone)}>
            <Phone aria-hidden />
          </a>
        </Button>
      </Tooltip>
      {whatsapp ? (
        <Tooltip content={debtorCopy.whatsapp}>
          <Button asChild variant="ghost" size="icon-sm">
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={debtorCopy.whatsappLabel(patient.fullName)}
            >
              <MessageCircle aria-hidden />
            </a>
          </Button>
        </Tooltip>
      ) : null}
    </span>
  );
}

/**
 * DX-150: la gestión, corta — el compromiso (estado, importe, fecha) si lo
 * hay; si no, la última gestión (canal · resultado, fecha). El historial entero
 * está en el estado de cuenta. DX-215: un compromiso reabierto lo dice.
 */
export function CollectionCell({ row, compact = false }: { row: AgingRow; compact?: boolean }) {
  const { lastNote, promise } = row;
  if (!lastNote && !promise) return <span className="text-muted">{debtorCopy.noCollection}</span>;
  const noteLabel = lastNote ? `${CHANNEL_LABELS[lastNote.channel]} · ${OUTCOME_LABELS[lastNote.outcome]}` : null;
  const promiseChip = promise ? (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5" data-testid="promise-status">
      <StatusBadge kind="paymentPromise" status={promise.status} className="whitespace-nowrap" />
      <span className="text-xs text-muted tabular-nums">
        {debtorCopy.promiseLine(formatCurrency(promise.amount, promise.currency), formatCivilDate(promise.dueDate))}
      </span>
    </span>
  ) : null;
  // Tarjeta del teléfono: una sola pieza, el compromiso o la gestión.
  if (compact) return promiseChip ?? <span>{noteLabel}</span>;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {promiseChip}
      {/* Si se volvió a cumplir con otro abono, ya no aplica. */}
      {promise?.reopenedAt && promise.status !== 'KEPT' ? (
        <span className="text-xs text-warning-text">{debtorCopy.promiseReopened}</span>
      ) : null}
      {lastNote && !promise ? (
        <span className="min-w-0 text-ink">
          <span>{noteLabel}</span>
          <span className="text-muted tabular-nums"> · {formatDate(lastNote.createdAt)}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Las acciones del «⋯». En el teléfono la tarjeta entera abre el estado de
 * cuenta y no caben botones dentro de un enlace: «Llamar» y «WhatsApp» van
 * aquí, primero. Sin compromiso nuevo mientras haya uno abierto (la API
 * respondería 409).
 */
export function debtorRowActions({
  row,
  clinicName,
  withContact,
  onStatement,
  onNote,
  onPromise,
}: {
  row: AgingRow;
  clinicName: string | null;
  withContact: boolean;
  onStatement: (row: AgingRow) => void;
  onNote: (row: AgingRow) => void;
  onPromise: (row: AgingRow) => void;
}): RowAction[] {
  const { patient } = row;
  const actions: RowAction[] = [];
  if (withContact && patient.phone) {
    const phone = patient.phone;
    actions.push({
      label: debtorCopy.callAction(phone),
      icon: <Phone aria-hidden />,
      onSelect: () => {
        window.location.href = telHref(phone);
      },
    });
    const whatsapp = collectionWhatsAppHref(patient, clinicName);
    if (whatsapp) {
      actions.push({
        label: debtorCopy.whatsapp,
        icon: <MessageCircle aria-hidden />,
        onSelect: () => {
          window.open(whatsapp, '_blank', 'noopener,noreferrer');
        },
      });
    }
  }
  actions.push({
    label: debtorCopy.statement,
    separatorBefore: actions.length > 0,
    onSelect: () => onStatement(row),
  });
  actions.push({ label: debtorCopy.registerNote, onSelect: () => onNote(row) });
  if (row.promise?.status !== 'OPEN') {
    actions.push({ label: debtorCopy.promise, onSelect: () => onPromise(row) });
  }
  return actions;
}
