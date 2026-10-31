'use client';
import * as React from 'react';
import Link from 'next/link';
import { FileText, HandCoins, MessageCircle, NotebookPen, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
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
import {
  CHANNEL_LABELS,
  OUTCOME_LABELS
} from '@/lib/collections/presentation';

export const debtorCopy = {
  days: (n: number) => (n === 1 ? '1 día' : `${n} días`),
  notDue: 'Por vencer',
  approximate: 'Fecha aproximada',
  approximateHint:
    'Parte del saldo no está en cuotas: su antigüedad se cuenta desde la aceptación (o la creación) del plan, no desde un vencimiento.',
  credit: (amount: string) => `A favor: ${amount}`,
  noPayments: 'Sin abonos',
  noInstallment: 'Sin cuotas por vencer',
  lastPayment: 'Último abono',
  nextInstallment: 'Próxima cuota',
  noPhone: 'Sin teléfono',
  call: 'Llamar',
  callLabel: (name: string, phone: string) => `Llamar a ${name}: ${phone}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `WhatsApp a ${name}`,
  noWhatsApp: 'El teléfono no sirve para WhatsApp',
  statement: 'Estado de cuenta',
  statementLabel: (name: string) => `Estado de cuenta de ${name}`,
  // DX-150: cobranza.
  collection: 'Gestión',
  noCollection: 'Sin gestiones',
  registerNote: 'Registrar gestión',
  registerNoteLabel: (name: string) => `Registrar gestión de cobro con ${name}`,
  promise: 'Compromiso de pago',
  promiseShort: 'Compromiso',
  promiseLabel: (name: string) => `Compromiso de pago de ${name}`,
  promiseLine: (amount: string, day: string) => `${amount} para el ${day}`,
  // DX-215: estaba cumplido y se anuló el abono que lo cumplía.
  promiseReopened: 'Reabierto: se anuló el abono',
};

export function statementHref(patientId: string): string {
  return `/patients/${patientId}?tab=account-statement`;
}

const AGE_BADGE: Record<ReturnType<typeof bucketOfAge>, 'muted' | 'warning' | 'danger'> = {
  current: 'muted',
  days0to30: 'muted',
  days31to60: 'warning',
  days61to90: 'warning',
  over90: 'danger',
};

/** Días de la deuda vencida más antigua, su tramo y la marca de fecha aproximada. */
export function AgeCell({ row }: { row: AgingRow }) {
  const bucket = bucketOfAge(row.oldestAgeDays);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.oldestAgeDays === null ? (
        <span className="text-muted">{debtorCopy.notDue}</span>
      ) : (
        <>
          <span className="font-medium tabular-nums text-ink">{debtorCopy.days(row.oldestAgeDays)}</span>
          <Badge variant={AGE_BADGE[bucket]} className="whitespace-nowrap">
            {BUCKET_LABELS[bucket]}
          </Badge>
        </>
      )}
      {row.ageApproximate ? (
        <Badge variant="outline" title={debtorCopy.approximateHint} className="whitespace-nowrap">
          {debtorCopy.approximate}
        </Badge>
      ) : null}
    </div>
  );
}

/** Deuda por moneda, con el saldo a favor aparte. */
export function DebtCell({ currencies }: { currencies: AgingCurrency[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {currencies.map((c) => (
        <li key={c.currency} className="tabular-nums">
          <span className="font-medium text-ink">{formatCurrency(c.debt, c.currency)}</span>
          {c.credit > 0 ? (
            <span className="block text-xs text-success-text">
              {debtorCopy.credit(formatCurrency(c.credit, c.currency))}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
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
    <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm', className)}>
      {lines.map((line) => (
        <React.Fragment key={line.key}>
          <dt className={cn('whitespace-nowrap text-muted', line.bucket === 'over90' && 'text-danger-text')}>{BUCKET_LABELS[line.bucket]}</dt>
          <dd className="whitespace-nowrap text-right font-medium tabular-nums text-ink">{line.amount}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function LastPayment({ row }: { row: AgingRow }) {
  if (!row.lastPayment) return <span className="text-muted">{debtorCopy.noPayments}</span>;
  return (
    <span className="tabular-nums">
      {formatCivilDate(row.lastPayment.paidOn)}
      <span className="block text-xs text-muted">
        {formatCurrency(row.lastPayment.amount, row.lastPayment.currency)}
      </span>
    </span>
  );
}

export function NextInstallment({ row }: { row: AgingRow }) {
  if (!row.nextInstallment) return <span className="text-muted">{debtorCopy.noInstallment}</span>;
  return (
    <span className="tabular-nums">
      {formatCivilDate(row.nextInstallment.dueDate)}
      <span className="block text-xs text-muted">
        {formatCurrency(row.nextInstallment.amount, row.nextInstallment.currency)}
      </span>
    </span>
  );
}

/**
 * «Llamar» (tel:), «WhatsApp» (wa.me con un mensaje sin importes) y el estado
 * de cuenta. En móvil (`stretch`) los botones se reparten el ancho y miden 44px:
 * al alcance del pulgar.
 */
export function DebtorActions({
  row,
  clinicName,
  stretch = false,
}: {
  row: AgingRow;
  clinicName: string | null;
  stretch?: boolean;
}) {
  const { patient } = row;
  const whatsapp = collectionWhatsAppHref(patient, clinicName);
  const button = stretch ? 'h-11 flex-1' : undefined;
  return (
    <div className={cn('flex items-center gap-2', stretch ? 'flex-wrap' : 'flex-nowrap justify-end')}>
      {patient.phone ? (
        <Button asChild variant="outline" size="sm" className={button}>
          <a href={telHref(patient.phone)} aria-label={debtorCopy.callLabel(patient.fullName, patient.phone)}>
            <Phone aria-hidden />
            {debtorCopy.call}
          </a>
        </Button>
      ) : null}
      {whatsapp ? (
        <Button asChild variant="outline" size="sm" className={button}>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={debtorCopy.whatsappLabel(patient.fullName)}
          >
            <MessageCircle aria-hidden />
            {debtorCopy.whatsapp}
          </a>
        </Button>
      ) : null}
      {/* En la tabla, solo el icono (el nombre del paciente ya enlaza ahí). */}
      <Button asChild variant="ghost" size="sm" className={button}>
        <Link
          href={statementHref(patient.id)}
          aria-label={debtorCopy.statementLabel(patient.fullName)}
          title={stretch ? undefined : debtorCopy.statement}
        >
          <FileText aria-hidden />
          {stretch ? debtorCopy.statement : null}
        </Link>
      </Button>
      {!patient.phone ? <span className={cn('text-xs text-muted', stretch && 'w-full')}>{debtorCopy.noPhone}</span> : null}
      {patient.phone && !whatsapp ? (
        <span className={cn('text-xs text-muted', stretch && 'w-full')}>{debtorCopy.noWhatsApp}</span>
      ) : null}
    </div>
  );
}

/**
 * DX-150: la última gestión (canal · resultado, fecha) y el último compromiso
 * de pago con su estado (Abierto, Cumplido o Incumplido). DX-215: si estaba
 * cumplido y se anuló el abono que lo cumplía, lo dice.
 */
export function CollectionCell({ row }: { row: AgingRow }) {
  const { lastNote, promise } = row;
  if (!lastNote && !promise) return <span className="text-muted">{debtorCopy.noCollection}</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      {lastNote ? (
        <span className="min-w-0">
          <span className="text-ink">
            {CHANNEL_LABELS[lastNote.channel]} · {OUTCOME_LABELS[lastNote.outcome]}
          </span>
          <span className="block text-xs text-muted tabular-nums">
            {formatDate(lastNote.createdAt)}
          </span>
        </span>
      ) : null}
      {promise ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="promise-status">
          <StatusBadge kind="paymentPromise" status={promise.status} className="whitespace-nowrap" />
          <span className="text-xs text-muted tabular-nums">
            {debtorCopy.promiseLine(formatCurrency(promise.amount, promise.currency), formatCivilDate(promise.dueDate))}
          </span>
          {/* Si se volvió a cumplir con otro abono, ya no aplica. */}
          {promise.reopenedAt && promise.status !== 'KEPT' ? (
            <span className="basis-full text-xs text-warning-text">{debtorCopy.promiseReopened}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * DX-150: «Registrar gestión» y «Compromiso de pago». Sin compromiso nuevo
 * mientras haya uno abierto (la API respondería 409).
 */
export function CollectionActions({
  row,
  onNote,
  onPromise,
  stretch = false,
}: {
  row: AgingRow;
  onNote: (row: AgingRow) => void;
  onPromise: (row: AgingRow) => void;
  stretch?: boolean;
}) {
  const name = row.patient.fullName;
  const button = stretch ? 'h-11 flex-1' : undefined;
  const openPromise = row.promise?.status === 'OPEN';
  return (
    <div className={cn('flex items-center gap-2', stretch ? 'flex-wrap' : 'flex-nowrap justify-end')}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={button}
        onClick={() => onNote(row)}
        aria-label={debtorCopy.registerNoteLabel(name)}
      >
        <NotebookPen aria-hidden />
        {stretch ? debtorCopy.registerNote : debtorCopy.collection}
      </Button>
      {openPromise ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={button}
          onClick={() => onPromise(row)}
          aria-label={debtorCopy.promiseLabel(name)}
        >
          <HandCoins aria-hidden />
          {stretch ? debtorCopy.promise : debtorCopy.promiseShort}
        </Button>
      )}
    </div>
  );
}
