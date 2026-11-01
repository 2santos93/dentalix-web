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
import { formatCivilDate, formatDateTimeInZone, formatTimeInZone } from '@/lib/format/date';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';

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
  colOutflows: 'Salidas',
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
  // DX-516: ajustes por medio de pago que entran con los abonos.
  paymentAdjustments: (amount: string) => `${amount} por ajustes del medio`,
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
  outflowsTitle: 'Salidas de caja',
  outflowsLabel: 'Salidas de caja',
  voidedOutflowsLabel: 'Salidas anuladas',
  colTime: 'Hora',
  colCategory: 'Categoría',
  colSupplier: 'Proveedor',
  noOutflows: 'Sin salidas de caja en este turno.',
  // DX-253: devoluciones de saldo a favor en efectivo (restan en «Salidas»).
  creditRefundsLabel: 'Devoluciones de saldo a favor',
  colRefund: 'Comprobante',
  outflowBookedElsewhere:
    'Anulada con la caja ya cerrada: aquí sigue restando y la anulación es un ajuste en otra caja.',
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
  /** DX-516: ajustes por medio de pago de esos cobros, con signo (0 o null: ninguno). */
  paymentAdjustments: number | null;
  adjustments: number | null;
  outflows: number | null;
  expected: number;
  counted: number | null;
  difference: number | null;
}

/**
 * Las filas del arqueo: las del cierre vigente (esperado, contado, diferencia,
 * inmutables) con el desglose de cobros, ajustes y salidas del cálculo actual,
 * o, con la caja abierta, solo lo esperado.
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
        paymentAdjustments: breakdown?.paymentAdjustments ?? null,
        adjustments: breakdown?.adjustments ?? null,
        outflows: breakdown?.outflows ?? null,
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
    paymentAdjustments: line.paymentAdjustments,
    adjustments: line.adjustments,
    outflows: line.outflows,
    expected: line.expected,
    counted: null,
    difference: null,
  }));
}

interface CashSessionReportProps {
  session: CashSessionDetail;
  /** En la app, los ajustes enlazan con su caja de origen; en papel, no. */
  linkSessions?: boolean;
  /**
   * Nivel del título del documento: `h1` en la vista imprimible (es la página)
   * y `h2` dentro de la ficha del turno, que ya tiene su h1. Las secciones van
   * un nivel por debajo.
   */
  titleAs?: 'h1' | 'h2';
  /**
   * Ancho de hoja A4 (210 mm): la vista imprimible. En la ficha del turno el
   * documento usa el ancho de la columna, para que el arqueo (ocho columnas)
   * quepa sin desplazarse en escritorio.
   */
  paper?: boolean;
}

/**
 * El arqueo es una tabla de comparación: en el teléfono no se apila, se
 * desplaza de lado con «Moneda y método» fija (en papel no aplica).
 */
const STICKY_FIRST = 'max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:border-r max-sm:border-border-subtle max-sm:bg-surface print:static';

const HeadingLevel = React.createContext<'h2' | 'h3'>('h2');

/**
 * El turno de caja como DOCUMENTO (DX-027): lo mismo en la ficha del turno,
 * en la vista imprimible A4 y en el PDF. Fondo, cobros por moneda y método,
 * anulaciones, ajustes, contado, diferencia, quién abrió y cerró y la fecha de
 * bloqueo sugerida. Es papel: colores claros fijos también con el tema oscuro
 * (`.cash-report-print-root` fija los tokens del tema claro, como la tarjeta
 * de implante).
 */
export function CashSessionReport({ session, linkSessions = true, titleAs: Title = 'h1', paper = true }: CashSessionReportProps) {
  const zone = session.timeZone;
  const when = (iso: string) => formatDateTimeInZone(iso, zone);
  const closing = session.closing;
  const rows = arqueoRows(session);

  return (
    <HeadingLevel.Provider value={Title === 'h1' ? 'h2' : 'h3'}>
    <article
      data-testid="cash-session-report"
      aria-labelledby="cash-report-title"
      className={cn(
        'cash-report-print-root mx-auto w-full bg-surface',
        paper && 'max-w-[210mm]',
        'px-4 py-6 text-sm text-ink sm:px-10 sm:py-10 print:max-w-none print:p-0',
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Title id="cash-report-title" className="t-display">
            {closing ? copy.titleClosed : copy.titleOpen}
          </Title>
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

      <DescriptionList className="gap-y-3 border-b border-border py-4">
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
      </DescriptionList>

      <Section title={copy.arqueoTitle}>
        {session.blindHidden ? (
          <p className="text-muted">{copy.blind}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted">{copy.noLines}</p>
        ) : (
          <div className="border-y border-border-subtle">
            <Table aria-label={copy.arqueoLabel} stack={false}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col" className={STICKY_FIRST}>{copy.colLine}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colOpening}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colPayments}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colAdjustments}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.colOutflows}</TableHead>
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
                      <TableCell className={cn('font-medium whitespace-nowrap', STICKY_FIRST)}>
                        {PAYMENT_METHOD_LABELS[row.method]} · {row.currency}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.opening)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.payments)}
                        {/* DX-516: impuestos y recargos (+) o descuentos (−) cobrados con esos abonos. */}
                        {row.paymentAdjustments ? (
                          <span className="block t-caption text-muted">
                            {copy.paymentAdjustments(
                              `${row.paymentAdjustments > 0 ? '+' : '−'}${formatCurrency(Math.abs(row.paymentAdjustments), row.currency)}`,
                            )}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.adjustments)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {/* Se restan: con signo, para que la fila se lea como una suma. */}
                        {money(row.outflows ? -row.outflows : row.outflows)}
                      </TableCell>
                      <TableCell
                       
                        className={cn('text-right font-medium tabular-nums', row.expected < 0 && 'text-danger-text')}
                      >
                        {money(row.expected)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.counted === null ? copy.notCounted : money(row.counted)}
                      </TableCell>
                      <TableCell
                       
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          row.difference !== null && row.difference !== 0 && 'text-danger-text',
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
          <DescriptionList className="mt-4 gap-y-3">
            <Fact label={copy.differenceReason}>
              {closing.hasDifference ? closing.differenceReason : copy.squared}
            </Fact>
            <Fact label={copy.lockDate}>
              <span className="tabular-nums">{formatCivilDate(closing.suggestedLockDate)}</span>
              <span className="block text-xs text-muted">{copy.lockDateHint}</span>
            </Fact>
            {closing.notes ? <Fact label={copy.closingNotes}>{closing.notes}</Fact> : null}
          </DescriptionList>
        ) : null}
        {closing?.blind ? <p className="mt-3 text-xs text-muted">{copy.blindClose}</p> : null}
      </Section>

      {session.payments ? (
        <Section title={copy.paymentsTitle}>
          {session.payments.length === 0 ? (
            <p className="text-muted">{copy.noPayments}</p>
          ) : (
            <div className="border-y border-border-subtle">
              <Table aria-label={copy.paymentsLabel} stack={false}>
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
                      <TableCell className="tabular-nums">
                        {formatCivilDate(p.paidOn)}
                      </TableCell>
                      <TableCell>{p.patient.fullName}</TableCell>
                      <TableCell className="tabular-nums">
                        {p.receiptNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        {p.method ? PAYMENT_METHOD_LABELS[p.method] : copy.methodNone}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
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
          <ul className="divide-y divide-border-subtle border-y border-border-subtle" aria-label={copy.voidedLabel}>
            {session.voidedPayments.map((p) => (
              <li key={p.id} className="cash-report-row flex flex-col gap-1 py-2">
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
                {p.bookedAsAdjustment ? <p className="text-xs text-warning-text">{copy.bookedElsewhere}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={copy.outflowsTitle}>
        <OutflowList session={session} when={when} />
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
    </HeadingLevel.Provider>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <DescriptionItem label={label}>{children}</DescriptionItem>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  const level = React.useContext(HeadingLevel);
  return (
    <section aria-labelledby={id} className="cash-report-section border-b border-border py-4 last:border-b-0">
      {React.createElement(level, { id, className: 't-title mb-2' }, title)}
      {children}
    </section>
  );
}

/** «Mensajería · Mensajeros Ya», o solo la categoría sin proveedor. */
function outflowSubject(outflow: { category: string; supplier: string | null }): string {
  return outflow.supplier ? `${outflow.category} · ${outflow.supplier}` : outflow.category;
}

/**
 * Salidas de caja menor del turno (DX-274): se ven también con arqueo ciego
 * (R6), porque no dicen cuánto se espera. Las anuladas van aparte, con su
 * título, el importe tachado (como los abonos anulados) y su motivo.
 */
function OutflowList({ session, when }: { session: CashSessionDetail; when: (iso: string) => string }) {
  const zone = session.timeZone;
  const { outflows, voidedOutflows } = session;
  const creditRefunds = session.creditRefunds ?? [];
  const voidedId = React.useId();
  if (outflows.length === 0 && voidedOutflows.length === 0 && creditRefunds.length === 0) {
    return <p className="text-muted">{copy.noOutflows}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {creditRefunds.length > 0 ? (
        <div className="border-y border-border-subtle">
          <Table aria-label={copy.creditRefundsLabel} stack={false}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">{copy.colTime}</TableHead>
                <TableHead scope="col">{copy.colRefund}</TableHead>
                <TableHead scope="col">{copy.colPatient}</TableHead>
                <TableHead scope="col">{copy.colBy}</TableHead>
                <TableHead scope="col" className="text-right">{copy.colAmount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditRefunds.map((r) => (
                <TableRow key={r.id} className="cash-report-row">
                  <TableCell className="tabular-nums">
                    {formatTimeInZone(r.createdAt, zone)}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.number}</TableCell>
                  <TableCell>{r.patient.fullName}</TableCell>
                  <TableCell>{r.createdBy.fullName ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(r.amount, r.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {outflows.length > 0 ? (
        <div className="border-y border-border-subtle">
          <Table aria-label={copy.outflowsLabel} stack={false}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">{copy.colTime}</TableHead>
                <TableHead scope="col">{copy.colCategory}</TableHead>
                <TableHead scope="col">{copy.colSupplier}</TableHead>
                <TableHead scope="col">{copy.colBy}</TableHead>
                <TableHead scope="col" className="text-right">{copy.colAmount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outflows.map((o) => (
                <TableRow key={o.id} className="cash-report-row">
                  <TableCell className="tabular-nums">
                    {formatTimeInZone(o.createdAt, zone)}
                  </TableCell>
                  <TableCell>{o.category}</TableCell>
                  <TableCell>{o.supplier ?? '—'}</TableCell>
                  <TableCell>{o.createdBy.fullName ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(o.amount, o.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {voidedOutflows.length > 0 ? (
        <>
          <VoidedHeading id={voidedId}>{copy.voidedOutflowsLabel}</VoidedHeading>
          <ul className="divide-y divide-border-subtle border-y border-border-subtle" aria-labelledby={voidedId}>
            {voidedOutflows.map((o) => (
              <li key={o.id} className="cash-report-row flex flex-col gap-1 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {formatTimeInZone(o.createdAt, zone)} · {outflowSubject(o)}
                  </span>
                  <span className="font-medium tabular-nums line-through decoration-1">
                    {formatCurrency(o.amount, o.currency)}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {copy.colReason}: {o.voidReason ?? '—'} · {copy.colBy}: {o.createdBy.fullName ?? '—'} ·{' '}
                  {copy.colVoidedBy}: {o.voidedBy?.fullName ?? '—'}
                  {o.voidedAt ? ` · ${when(o.voidedAt)}` : ''}
                </p>
                {o.bookedAsAdjustment ? <p className="text-xs text-warning-text">{copy.outflowBookedElsewhere}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
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
    <ul className="divide-y divide-border-subtle border-y border-border-subtle" aria-label={label}>
      {items.map((a) => {
        const origin = a.originalSession;
        const originText = origin ? copy.fromSession(origin.openedBy.fullName ?? '—', when(origin.openedAt)) : null;
        return (
          <li key={a.id} className="cash-report-row flex flex-col gap-1 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {ADJUSTMENT_KIND_LABELS[a.kind]}
                <span className="ml-2 text-xs text-muted">
                  {PAYMENT_METHOD_LABELS[a.method]} · {a.currency}
                </span>
              </span>
              <span className={cn('font-semibold tabular-nums', a.amount < 0 && 'text-danger-text')}>
                {formatCurrency(a.amount, a.currency)}
              </span>
            </div>
            <p className="text-xs text-muted">
              {a.payment ? `${a.payment.patient.fullName}${a.payment.receiptNumber ? ` · ${a.payment.receiptNumber}` : ''} · ` : ''}
              {a.expensePayment ? `${outflowSubject(a.expensePayment)} · ` : ''}
              {a.reason ? `${a.reason} · ` : ''}
              {a.createdBy.fullName ?? '—'} · {when(a.createdAt)}
            </p>
            {mode === 'origin' && origin ? (
              <p className="text-xs">
                {copy.colOrigin}:{' '}
                {linkSessions ? (
                  <Link href={cashSessionHref(origin.id)} className="text-primary-text underline-offset-4 hover:underline">
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
                  <Link href={cashSessionHref(a.sessionId)} className="text-primary-text underline-offset-4 hover:underline">
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

/** «Salidas anuladas»: un nivel por debajo de la sección en la que va. */
function VoidedHeading({ id, children }: { id: string; children: React.ReactNode }) {
  const section = React.useContext(HeadingLevel);
  return React.createElement(section === 'h2' ? 'h3' : 'h4', { id, className: 't-label mt-1 text-muted' }, children);
}
