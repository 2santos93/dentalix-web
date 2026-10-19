import * as React from 'react';
import Link from 'next/link';
import {
  cashSessionHref,
  type CashAdjustment,
  type CashSessionDetail,
} from '@/lib/cash-sessions/cash-sessions-api';
import { ADJUSTMENT_KIND_LABELS } from '@/lib/cash-sessions/arqueo';
import { moneyList, sessionStatusLabel } from '@/lib/cash-sessions/presentation';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDateTimeInZone } from '@/lib/format/date';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const copy = {
  titleClosed: 'Informe de cierre de caja',
  titleOpen: 'Turno de caja',
  status: 'Estado',
  location: 'Sede',
  openedBy: 'Abrió',
  closedBy: 'Cerró',
  at: (who: string, when: string) => `${who} · ${when}`,
  float: 'Fondo inicial',
  notes: 'Notas de la apertura',
  reopened: (n: number) => (n === 1 ? 'Reabierta 1 vez' : `Reabierta ${n} veces`),
  arqueoTitle: 'Arqueo por moneda y método',
  arqueoLabel: 'Arqueo por moneda y método',
  colLine: 'Moneda y método',
  colOpening: 'Fondo',
  colPayments: 'Cobros',
  colAdjustments: 'Ajustes',
  colExpected: 'Esperado',
  colCounted: 'Contado',
  colDifference: 'Diferencia',
  notCounted: 'Sin contar',
  noLines: 'Sin movimientos en este turno.',
  blind: 'Arqueo ciego: lo esperado y los cobros del turno se ven cuando la caja está cerrada.',
  differenceReason: 'Motivo de la diferencia',
  squared: 'El arqueo cuadra.',
  closingNotes: 'Notas del cierre',
  lockDate: 'Fecha de bloqueo sugerida',
  lockDateHint: 'Para el cierre contable de la sede (aún no bloquea nada).',
  blindClose: 'Cerrada con arqueo ciego.',
  paymentsTitle: 'Cobros del turno',
  paymentsLabel: 'Cobros del turno',
  colDate: 'Fecha',
  colPatient: 'Paciente',
  colReceipt: 'Recibo',
  colMethod: 'Método',
  colAmount: 'Importe',
  colBy: 'Registró',
  methodNone: 'Otro',
  noPayments: 'Sin cobros en este turno.',
  voidedTitle: 'Anulaciones',
  voidedLabel: 'Abonos anulados',
  colReason: 'Motivo',
  colVoidedBy: 'Anuló',
  bookedElsewhere: 'Anulado con la caja ya cerrada: aquí sigue contando y la anulación es un ajuste en otra caja.',
  noVoided: 'Sin anulaciones.',
  adjustmentsTitle: 'Ajustes en este turno',
  adjustmentsLabel: 'Ajustes en este turno',
  laterTitle: 'Ajustes posteriores a este cierre',
  laterLabel: 'Ajustes posteriores a este cierre',
  colKind: 'Tipo',
  colOrigin: 'Origen',
  colDestination: 'Cuenta en',
  fromSession: (who: string, when: string) => `Caja de ${who} del ${when}`,
  pending: 'Pendiente de la próxima caja de la sede',
  otherSession: 'Otra caja de la sede',
  noAdjustments: 'Sin ajustes.',
  historyTitle: 'Historial',
  closedEvent: (n: number, who: string, when: string) => `Cierre ${n}: ${who}, ${when}`,
  reopenedEvent: (n: number, who: string, when: string, reason: string) =>
    `Reapertura ${n}: ${who}, ${when}. Motivo: ${reason}`,
  signatures: 'Firmas',
  signOpened: 'Abrió',
  signClosed: 'Cerró',
};

interface ArqueoRow {
  key: string;
  currency: string;
  method: keyof typeof PAYMENT_METHOD_LABELS;
  opening: number;
  payments: number | null;
  adjustments: number | null;
  expected: number;
  counted: number | null;
  difference: number | null;
}

/**
 * Las filas del arqueo: las del cierre vigente (esperado, contado, diferencia,
 * inmutables) con el desglose de cobros y ajustes del cálculo actual, o, con
 * la caja abierta, solo lo esperado.
 */
function arqueoRows(session: CashSessionDetail): ArqueoRow[] {
  const expected = new Map((session.expected ?? []).map((l) => [`${l.currency}|${l.method}`, l]));
  if (session.closing) {
    return session.closing.lines.map((line) => {
      const key = `${line.currency}|${line.method}`;
      const breakdown = expected.get(key);
      return {
        key,
        currency: line.currency,
        method: line.method,
        opening: line.opening,
        payments: breakdown?.payments ?? null,
        adjustments: breakdown?.adjustments ?? null,
        expected: line.expected,
        counted: line.counted,
        difference: line.difference,
      };
    });
  }
  return (session.expected ?? []).map((line) => ({
    key: `${line.currency}|${line.method}`,
    currency: line.currency,
    method: line.method,
    opening: line.opening,
    payments: line.payments,
    adjustments: line.adjustments,
    expected: line.expected,
    counted: null,
    difference: null,
  }));
}

interface CashSessionReportProps {
  session: CashSessionDetail;
  /** En la app, los ajustes enlazan con su caja de origen; en papel, no. */
  linkSessions?: boolean;
}

/**
 * El turno de caja como DOCUMENTO (DX-027): lo mismo en la ficha del turno,
 * en la vista imprimible A4 y en el PDF. Fondo, cobros por moneda y método,
 * anulaciones, ajustes, contado, diferencia, quién abrió y cerró y la fecha de
 * bloqueo sugerida. Es papel: colores claros fijos también con el tema oscuro
 * (`.cash-report-print-root` fija los tokens del tema claro, como la tarjeta
 * de implante).
 */
export function CashSessionReport({ session, linkSessions = true }: CashSessionReportProps) {
  const zone = session.timeZone;
  const when = (iso: string) => formatDateTimeInZone(iso, zone);
  const closing = session.closing;
  const rows = arqueoRows(session);

  return (
    <article
      data-testid="cash-session-report"
      aria-labelledby="cash-report-title"
      className="cash-report-print-root mx-auto w-full max-w-[210mm] bg-surface px-4 py-6 text-sm text-ink sm:px-10 sm:py-10 print:max-w-none print:p-0"
    >
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 id="cash-report-title" className="text-xl font-semibold tracking-tight">
            {closing ? copy.titleClosed : copy.titleOpen}
          </h1>
          <p className="mt-1 text-muted">
            {copy.location}: <span className="font-medium text-ink">{session.location.name}</span>
          </p>
        </div>
        <p className="text-sm sm:text-right">
          <span className="text-muted">{copy.status}: </span>
          <span className="font-semibold">{sessionStatusLabel(session)}</span>
          {session.reopenCount > 0 ? (
            <span className="block text-xs text-muted">{copy.reopened(session.reopenCount)}</span>
          ) : null}
        </p>
      </header>

      <dl className="grid gap-x-6 gap-y-2 border-b border-border py-4 sm:grid-cols-2">
        <Fact label={copy.openedBy}>
          {copy.at(session.openedBy.fullName ?? '—', when(session.openedAt))}
        </Fact>
        <Fact label={copy.closedBy}>
          {closing ? copy.at(closing.closedBy.fullName ?? '—', when(closing.closedAt)) : '—'}
        </Fact>
        <Fact label={copy.float}>
          <span className="tabular-nums">{moneyList(session.floats)}</span>
        </Fact>
        {session.notes ? <Fact label={copy.notes}>{session.notes}</Fact> : null}
      </dl>

      <Section title={copy.arqueoTitle}>
        {session.blindHidden ? (
          <p className="text-muted">{copy.blind}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted">{copy.noLines}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table aria-label={copy.arqueoLabel}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">{copy.colLine}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colOpening}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colPayments}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colAdjustments}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colExpected}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colCounted}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colDifference}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const money = (n: number | null) => (n === null ? '—' : formatCurrency(n, row.currency));
                  return (
                    <TableRow key={row.key} className="cash-report-row">
                      <TableCell data-label={copy.colLine} className="font-medium">
                        {PAYMENT_METHOD_LABELS[row.method]} · {row.currency}
                      </TableCell>
                      <TableCell data-label={copy.colOpening} className="text-right tabular-nums">
                        {money(row.opening)}
                      </TableCell>
                      <TableCell data-label={copy.colPayments} className="text-right tabular-nums">
                        {money(row.payments)}
                      </TableCell>
                      <TableCell data-label={copy.colAdjustments} className="text-right tabular-nums">
                        {money(row.adjustments)}
                      </TableCell>
                      <TableCell data-label={copy.colExpected} className="text-right font-medium tabular-nums">
                        {money(row.expected)}
                      </TableCell>
                      <TableCell data-label={copy.colCounted} className="text-right tabular-nums">
                        {row.counted === null ? copy.notCounted : money(row.counted)}
                      </TableCell>
                      <TableCell
                        data-label={copy.colDifference}
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          row.difference !== null && row.difference !== 0 && 'text-danger',
                        )}
                      >
                        {money(row.difference)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {closing ? (
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Fact label={copy.differenceReason}>
              {closing.hasDifference ? closing.differenceReason : copy.squared}
            </Fact>
            <Fact label={copy.lockDate}>
              <span className="tabular-nums">{formatCivilDate(closing.suggestedLockDate)}</span>
              <span className="block text-xs text-muted">{copy.lockDateHint}</span>
            </Fact>
            {closing.notes ? <Fact label={copy.closingNotes}>{closing.notes}</Fact> : null}
            {closing.blind ? <p className="text-xs text-muted">{copy.blindClose}</p> : null}
          </dl>
        ) : null}
      </Section>

      {session.payments ? (
        <Section title={copy.paymentsTitle}>
          {session.payments.length === 0 ? (
            <p className="text-muted">{copy.noPayments}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table aria-label={copy.paymentsLabel}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{copy.colDate}</TableHead>
                    <TableHead scope="col">{copy.colPatient}</TableHead>
                    <TableHead scope="col">{copy.colReceipt}</TableHead>
                    <TableHead scope="col">{copy.colMethod}</TableHead>
                    <TableHead scope="col" className="text-right">{copy.colAmount}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {session.payments.map((p) => (
                    <TableRow key={p.id} className="cash-report-row">
                      <TableCell data-label={copy.colDate} className="tabular-nums">
                        {formatCivilDate(p.paidOn)}
                      </TableCell>
                      <TableCell data-label={copy.colPatient}>{p.patient.fullName}</TableCell>
                      <TableCell data-label={copy.colReceipt} className="tabular-nums">
                        {p.receiptNumber ?? '—'}
                      </TableCell>
                      <TableCell data-label={copy.colMethod}>
                        {p.method ? PAYMENT_METHOD_LABELS[p.method] : copy.methodNone}
                      </TableCell>
                      <TableCell data-label={copy.colAmount} className="text-right font-medium tabular-nums">
                        {formatCurrency(p.amount, p.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      ) : null}

      <Section title={copy.voidedTitle}>
        {session.voidedPayments.length === 0 ? (
          <p className="text-muted">{copy.noVoided}</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-border" aria-label={copy.voidedLabel}>
            {session.voidedPayments.map((p) => (
              <li key={p.id} className="cash-report-row flex flex-col gap-1 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {p.patient.fullName}
                    {p.receiptNumber ? <span className="ml-2 text-xs text-muted tabular-nums">{p.receiptNumber}</span> : null}
                  </span>
                  <span className="font-medium tabular-nums line-through decoration-1">
                    {formatCurrency(p.amount, p.currency)}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {copy.colReason}: {p.voidReason ?? '—'} · {copy.colVoidedBy}: {p.voidedBy?.fullName ?? '—'}
                  {p.voidedAt ? ` · ${when(p.voidedAt)}` : ''}
                </p>
                {p.bookedAsAdjustment ? <p className="text-xs text-warning">{copy.bookedElsewhere}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={copy.adjustmentsTitle}>
        <AdjustmentList
          items={session.adjustments}
          label={copy.adjustmentsLabel}
          when={when}
          linkSessions={linkSessions}
          mode="origin"
        />
      </Section>

      {session.laterAdjustments.length > 0 ? (
        <Section title={copy.laterTitle}>
          <AdjustmentList
            items={session.laterAdjustments}
            label={copy.laterLabel}
            when={when}
            linkSessions={linkSessions}
            mode="destination"
          />
        </Section>
      ) : null}

      {session.closings.length > 1 || session.reopenings.length > 0 ? (
        <Section title={copy.historyTitle}>
          <ul className="flex flex-col gap-1 text-sm">
            {[
              ...session.closings.map((c) => ({
                at: c.closedAt,
                text: copy.closedEvent(c.sequence, c.closedBy.fullName ?? '—', when(c.closedAt)),
              })),
              ...session.reopenings.map((r) => ({
                at: r.reopenedAt,
                text: copy.reopenedEvent(r.sequence, r.reopenedBy.fullName ?? '—', when(r.reopenedAt), r.reason),
              })),
            ]
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((event) => (
                <li key={`${event.at}-${event.text}`}>{event.text}</li>
              ))}
          </ul>
        </Section>
      ) : null}

      <section className="cash-report-signatures mt-8 grid gap-8 sm:grid-cols-2" aria-label={copy.signatures}>
        {[
          { label: copy.signOpened, name: session.openedBy.fullName },
          { label: copy.signClosed, name: closing?.closedBy.fullName ?? null },
        ].map((sig) => (
          <div key={sig.label} className="border-t border-ink pt-2 text-xs">
            <span className="text-muted">{sig.label}: </span>
            <span className="font-medium">{sig.name ?? ''}</span>
          </div>
        ))}
      </section>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="t-label text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="cash-report-section border-b border-border py-4 last:border-b-0">
      <h2 id={id} className="mb-2 text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AdjustmentList({
  items,
  label,
  when,
  linkSessions,
  mode,
}: {
  items: CashAdjustment[];
  label: string;
  when: (iso: string) => string;
  linkSessions: boolean;
  /** `origin`: de qué caja viene; `destination`: en qué caja cuenta. */
  mode: 'origin' | 'destination';
}) {
  if (items.length === 0) return <p className="text-muted">{copy.noAdjustments}</p>;
  return (
    <ul className="divide-y divide-hairline rounded-lg border border-border" aria-label={label}>
      {items.map((a) => {
        const origin = a.originalSession;
        const originText = origin ? copy.fromSession(origin.openedBy.fullName ?? '—', when(origin.openedAt)) : null;
        return (
          <li key={a.id} className="cash-report-row flex flex-col gap-1 px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {ADJUSTMENT_KIND_LABELS[a.kind]}
                <span className="ml-2 text-xs text-muted">
                  {PAYMENT_METHOD_LABELS[a.method]} · {a.currency}
                </span>
              </span>
              <span className={cn('font-semibold tabular-nums', a.amount < 0 && 'text-danger')}>
                {formatCurrency(a.amount, a.currency)}
              </span>
            </div>
            <p className="text-xs text-muted">
              {a.payment ? `${a.payment.patient.fullName}${a.payment.receiptNumber ? ` · ${a.payment.receiptNumber}` : ''} · ` : ''}
              {a.reason ? `${a.reason} · ` : ''}
              {a.createdBy.fullName ?? '—'} · {when(a.createdAt)}
            </p>
            {mode === 'origin' && origin ? (
              <p className="text-xs">
                {copy.colOrigin}:{' '}
                {linkSessions ? (
                  <Link href={cashSessionHref(origin.id)} className="text-primary underline-offset-4 hover:underline">
                    {originText}
                  </Link>
                ) : (
                  originText
                )}
              </p>
            ) : null}
            {mode === 'destination' ? (
              <p className="text-xs">
                {copy.colDestination}:{' '}
                {a.sessionId === null ? (
                  copy.pending
                ) : linkSessions ? (
                  <Link href={cashSessionHref(a.sessionId)} className="text-primary underline-offset-4 hover:underline">
                    {copy.otherSession}
                  </Link>
                ) : (
                  copy.otherSession
                )}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
