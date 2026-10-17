'use client';
import * as React from 'react';
import Link from 'next/link';
import { FileText, MessageCircle, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOfAge,
  collectionWhatsAppHref,
  telHref,
} from '@/lib/receivables/presentation';
import type { AgingCurrency, AgingRow } from '@/lib/receivables/receivables-api';
import { cn } from '@/lib/utils';

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
            <span className="block text-xs text-success">
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
          <dt className={cn('whitespace-nowrap text-muted', line.bucket === 'over90' && 'text-danger')}>{BUCKET_LABELS[line.bucket]}</dt>
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
