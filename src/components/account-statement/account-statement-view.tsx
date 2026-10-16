'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CalendarClock, HandCoins, Lock, Printer, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  accountStatementPrintHref,
  getAccountStatement,
  type AccountStatement,
  type AccountStatementMovement,
  type AccountStatementSummary,
} from '@/lib/account-statement/account-statement-api';
import {
  installmentLabel,
  isEmptyStatement,
  methodLabel,
  planNamer,
  statementCopy,
  voidedDetail,
} from '@/lib/account-statement/presentation';
import {
  INSTALLMENT_STATUS_BADGE_VARIANT,
  INSTALLMENT_STATUS_LABELS,
} from '@/lib/payment-plans/installment-status';
import { PLAN_STATUS_BADGE_VARIANT, PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import { PAYMENT_METHOD_BADGE_VARIANT } from '@/lib/payments/payment-method';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { VoidPaymentModal } from '@/components/payments/void-payment-modal';
import {
  useVoidPayment,
  voidPaymentSubject,
  type VoidPaymentTarget,
} from '@/components/payments/use-void-payment';
import { RecordPaymentModal } from '@/components/payments/record-payment-modal';
import { StatementPaymentPlanModal } from './statement-payment-plan-modal';
import { canRecordPayments } from '@/lib/payments/billable-plans-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { cn } from '@/lib/utils';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  title: 'Estado de cuenta',
  description:
    'Lo presupuestado, lo abonado y lo que falta, por moneda. De toda la historia del paciente, en todas las sedes.',
  print: 'Imprimir',
  recordPayment: 'Registrar abono',
  paymentPlan: 'Plan de cuotas',
  printHint: '(se abre en otra pestaña)',
  summaryLabel: (currency: string) => `Resumen en ${currency}`,
  budgeted: 'Presupuestado',
  paid: 'Abonado',
  balance: 'Saldo',
  overdue: 'Vencido',
  nextInstallment: 'Próxima cuota',
  nextInstallmentValue: (date: string, amount: string) => `${date} · ${amount}`,
  plansHeading: 'Planes',
  plansTable: 'Planes del paciente',
  movementsHeading: 'Movimientos',
  movementsTable: 'Movimientos (abonos)',
  movementsEmpty: 'Todavía no hay abonos registrados.',
  installmentsHeading: 'Cuotas',
  installmentsTable: 'Calendario de cuotas',
  colPlan: 'Plan',
  colStatus: 'Estado',
  colBudgeted: 'Presupuestado',
  colPaid: 'Abonado',
  colBalance: 'Saldo',
  colDate: 'Fecha',
  colMethod: 'Método',
  colLocation: 'Sede',
  colAmount: 'Monto',
  colActions: 'Acciones',
  voidAction: 'Anular',
  voidActionLabel: (amount: string, date: string) => `Anular abono de ${amount} del ${date}`,
  colDue: 'Vencimiento',
  colInstallment: 'Cuota',
  colOutstanding: 'Pendiente',
  // Sin "Intenta de nuevo.": SectionError trae su propio botón.
  loadError: 'No pudimos cargar el estado de cuenta.',
  forbiddenTitle: 'Tu rol no tiene acceso al estado de cuenta.',
  forbiddenHint:
    'Es un dato financiero: lo ven administración y recepción. Pídele acceso a quien administra la clínica.',
};

interface AccountStatementViewProps {
  token: string;
  patientId: string;
}

/**
 * Pestaña «Estado de cuenta» de la ficha (DX-011): cuánto debe el paciente, en
 * segundos. Desde DX-067 también es donde se cobra: «Registrar abono» y «Plan
 * de cuotas» (solo PAYMENT_ROLES) eligen el plan entre los cobrables, sin
 * pasar por el plan de tratamiento. Patrón de carga de la app (estado local + `useEffect` +
 * `AsyncSection`); el 403 va aparte, como aviso sin reintento, igual que la caja.
 *
 * «Imprimir» abre la vista imprimible en otra pestaña, fuera del shell de la
 * app: un documento limpio (sin menús ni botones) que el navegador puede
 * «Guardar como PDF». Imprimir esta misma pantalla arrastraría el raíl, las
 * pestañas y los controles.
 */
export function AccountStatementView({ token, patientId }: AccountStatementViewProps) {
  const [data, setData] = useState<AccountStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const headingId = React.useId();
  // Anular (DX-057): «Anular» solo en movimientos con `canVoid` (lo calcula la
  // API para quien consulta); tras anular se recarga todo el estado de cuenta,
  // porque cambian el abonado, el saldo y las cuotas.
  const voiding = useVoidPayment(token, () => setReloadKey((k) => k + 1));
  // Cobrar (DX-067): recepción registra abonos y planes de cuotas aquí, sin
  // entrar al plan de tratamiento (clínico). Tras cada uno se recarga todo.
  const canCharge = canRecordPayments(getTokenRole(token));
  const [chargeModal, setChargeModal] = useState<'payment' | 'payment-plan' | null>(null);
  const [chargeNotice, setChargeNotice] = useState<string | null>(null);

  function openCharge(kind: 'payment' | 'payment-plan') {
    setChargeNotice(null);
    setChargeModal(kind);
  }

  function charged(notice: string) {
    setChargeModal(null);
    setChargeNotice(notice);
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getAccountStatement(token, patientId);
        if (cancelled) return;
        setData(res);
        setError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setError(copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  const empty = data ? isEmptyStatement(data) : false;
  const showPrint = !loading && !error && data !== null && !empty;
  // Cobrar no depende de que haya movimientos (un paciente nuevo con su primer
  // plan aceptado todavía no tiene ninguno); sí de poder ver el estado.
  const showCharge = canCharge && !forbidden;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="t-title text-ink">
            {copy.title}
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm text-muted">{copy.description}</p>
        </div>
        {showCharge || showPrint ? (
          <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:flex-wrap sm:justify-end">
            {showCharge ? (
              <>
                <Button type="button" className="w-full sm:w-auto" onClick={() => openCharge('payment')}>
                  <HandCoins aria-hidden />
                  {copy.recordPayment}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => openCharge('payment-plan')}
                >
                  <CalendarClock aria-hidden />
                  {copy.paymentPlan}
                </Button>
              </>
            ) : null}
            {showPrint ? (
              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <a href={accountStatementPrintHref(patientId)} target="_blank" rel="noopener">
                  <Printer aria-hidden />
                  {copy.print}
                  <span className="sr-only"> {copy.printHint}</span>
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {forbidden ? (
        <EmptyState
          role="status"
          icon={<Lock aria-hidden />}
          title={copy.forbiddenTitle}
          description={copy.forbiddenHint}
        />
      ) : (
        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={empty}
          emptyTitle={statementCopy.emptyTitle}
          emptyDescription={statementCopy.emptyDescription}
          emptyIcon={<Wallet aria-hidden />}
          skeleton={<TableSkeleton rows={3} />}
        >
          {data ? <StatementBody statement={data} onVoid={voiding.request} /> : null}
        </AsyncSection>
      )}

      {/* Avisos de la última anulación y del último cobro: fuera de
          AsyncSection para que la recarga no los borre. */}
      <p role="status" className={voiding.notice ? 'text-sm text-success' : 'sr-only'}>
        {voiding.notice}
      </p>
      <p role="status" className={chargeNotice ? 'text-sm text-success' : 'sr-only'}>
        {chargeNotice}
      </p>

      {showCharge ? (
        <>
          <RecordPaymentModal
            open={chargeModal === 'payment'}
            onOpenChange={(open) => setChargeModal(open ? 'payment' : null)}
            token={token}
            patientId={patientId}
            onRecorded={charged}
          />
          <StatementPaymentPlanModal
            open={chargeModal === 'payment-plan'}
            onOpenChange={(open) => setChargeModal(open ? 'payment-plan' : null)}
            token={token}
            patientId={patientId}
            onCreated={charged}
          />
        </>
      ) : null}

      {/* `key` por abono: cada anulación empieza con el motivo en blanco. */}
      <VoidPaymentModal
        key={voiding.target?.id ?? 'none'}
        open={voiding.target !== null}
        onOpenChange={(open) => {
          if (!open) voiding.close();
        }}
        onConfirm={(reason) => void voiding.confirm(reason)}
        submitting={voiding.submitting}
        error={voiding.error}
        // Pinta el aviso de la ventana de recepción; la regla la aplica la API.
        restrictedToOwnToday={getTokenRole(token) !== 'ADMIN'}
        subject={voiding.target ? voidPaymentSubject(voiding.target) : undefined}
      />
    </section>
  );
}

function StatementBody({
  statement,
  onVoid,
}: {
  statement: AccountStatement;
  onVoid: (target: VoidPaymentTarget) => void;
}) {
  const planName = planNamer(statement.plans);
  // La columna de acciones solo existe si hay algo que anular.
  const anyVoidable = statement.movements.some((m) => m.canVoid);
  return (
    <div className="flex flex-col gap-8">
      {statement.summary.length > 0 ? (
        <div className="flex flex-col gap-3">
          {statement.summary.map((row) => (
            <CurrencySummary key={row.currency} row={row} />
          ))}
        </div>
      ) : null}

      {statement.plans.length > 0 ? (
        <SubSection title={copy.plansHeading}>
          <Card className="overflow-hidden p-0 shadow-none">
            <Table aria-label={copy.plansTable}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">{copy.colPlan}</TableHead>
                  <TableHead scope="col">{copy.colStatus}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colBudgeted}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colPaid}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colBalance}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium" data-label={copy.colPlan}>
                      {planName(plan.id)}
                    </TableCell>
                    <TableCell data-label={copy.colStatus}>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Badge variant={PLAN_STATUS_BADGE_VARIANT[plan.status]}>
                          {PLAN_STATUS_LABELS[plan.status]}
                        </Badge>
                        {!plan.countsTowardsBalance ? (
                          <span className="text-xs text-muted">{statementCopy.notCounted}</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-label={copy.colBudgeted}>
                      {formatCurrency(plan.budgeted, plan.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-label={copy.colPaid}>
                      {formatCurrency(plan.paid, plan.currency)}
                      {plan.paidOtherCurrencies.map((o) => (
                        <span key={o.currency} className="block text-xs text-muted">
                          + {formatCurrency(o.amount, o.currency)}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell
                      className="text-right font-medium tabular-nums"
                      data-label={copy.colBalance}
                    >
                      {formatCurrency(plan.balance, plan.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </SubSection>
      ) : null}

      {statement.installments.length > 0 ? (
        <SubSection title={copy.installmentsHeading}>
          <Card className="overflow-hidden p-0 shadow-none">
            <Table aria-label={copy.installmentsTable}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">{copy.colDue}</TableHead>
                  <TableHead scope="col">{copy.colInstallment}</TableHead>
                  <TableHead scope="col">{copy.colPlan}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colAmount}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colOutstanding}
                  </TableHead>
                  <TableHead scope="col">{copy.colStatus}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.installments.map((inst) => (
                  <TableRow key={`${inst.paymentPlanId}-${inst.kind}-${inst.sequence ?? 0}`}>
                    <TableCell className="tabular-nums" data-label={copy.colDue}>
                      {formatCivilDate(inst.dueDate)}
                    </TableCell>
                    <TableCell className="tabular-nums" data-label={copy.colInstallment}>
                      {installmentLabel(inst)}
                    </TableCell>
                    <TableCell className="text-muted" data-label={copy.colPlan}>
                      {planName(inst.treatmentPlanId)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-label={copy.colAmount}>
                      {formatCurrency(inst.amount, inst.currency)}
                    </TableCell>
                    <TableCell
                      className="text-right font-medium tabular-nums"
                      data-label={copy.colOutstanding}
                    >
                      {formatCurrency(inst.outstanding, inst.currency)}
                    </TableCell>
                    <TableCell data-label={copy.colStatus}>
                      <Badge
                        variant={INSTALLMENT_STATUS_BADGE_VARIANT[inst.status]}
                        data-testid="installment-status"
                      >
                        {INSTALLMENT_STATUS_LABELS[inst.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </SubSection>
      ) : null}

      <SubSection title={copy.movementsHeading}>
        {statement.movements.length > 0 ? (
          <Card className="overflow-hidden p-0 shadow-none">
            <Table aria-label={copy.movementsTable}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">{copy.colDate}</TableHead>
                  <TableHead scope="col">{copy.colPlan}</TableHead>
                  <TableHead scope="col">{copy.colMethod}</TableHead>
                  <TableHead scope="col">{copy.colLocation}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colAmount}
                  </TableHead>
                  {anyVoidable ? (
                    <TableHead scope="col">
                      <span className="sr-only">{copy.colActions}</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.movements.map((m) => (
                  <TableRow key={m.id} className={cn(m.voided && 'text-muted')}>
                    <TableCell className="tabular-nums" data-label={copy.colDate}>
                      {formatCivilDate(m.paidAt)}
                    </TableCell>
                    <TableCell className="text-muted" data-label={copy.colPlan}>
                      {planName(m.treatmentPlanId)}
                      <VoidedDetail movement={m} />
                    </TableCell>
                    <TableCell data-label={copy.colMethod}>
                      {m.method ? (
                        <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[m.method]}>
                          {methodLabel(m.method)}
                        </Badge>
                      ) : (
                        <span className="text-muted">{methodLabel(null)}</span>
                      )}
                    </TableCell>
                    <TableCell data-label={copy.colLocation}>{m.location.name}</TableCell>
                    <TableCell className="text-right tabular-nums" data-label={copy.colAmount}>
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        {m.voided ? <Badge variant="muted">{statementCopy.voided}</Badge> : null}
                        <span
                          className={cn(
                            'font-medium',
                            m.voided ? 'text-muted line-through' : 'text-ink',
                          )}
                        >
                          {formatCurrency(m.amount, m.currency)}
                        </span>
                      </span>
                    </TableCell>
                    {anyVoidable ? (
                      <TableCell className="text-right" data-label={copy.colActions}>
                        {m.canVoid ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={copy.voidActionLabel(
                              formatCurrency(m.amount, m.currency),
                              formatCivilDate(m.paidAt),
                            )}
                            onClick={() =>
                              onVoid({
                                id: m.id,
                                amount: m.amount,
                                currency: m.currency,
                                paidAt: m.paidAt,
                              })
                            }
                          >
                            {copy.voidAction}
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <p className="text-sm text-muted">{copy.movementsEmpty}</p>
        )}
      </SubSection>

      <p className="max-w-[68ch] text-xs text-muted">{statementCopy.footnote}</p>
    </div>
  );
}

/**
 * «Anulado por X: motivo» (SEC-013) bajo el plan del movimiento: es la columna
 * de texto, con ancho para un motivo. Nada para un abono activo.
 */
function VoidedDetail({ movement }: { movement: AccountStatementMovement }) {
  const detail = voidedDetail(movement);
  return detail ? <p className="mt-0.5 max-w-[40ch] text-xs text-muted">{detail}</p> : null;
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-base font-semibold text-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Resumen de UNA moneda como registro —etiqueta arriba, cifra tabular debajo,
 * celdas separadas por filete—, no como tarjetas de métrica sueltas (DESIGN.md
 * prohíbe el patrón "número grande / etiqueta pequeña" como estructura). Dos
 * columnas hasta `lg`, cuatro desde ahí; una moneda por bloque, a todo el ancho. Lo vencido es lo único que se
 * tiñe, y solo cuando hay algo vencido.
 */
function CurrencySummary({ row }: { row: AccountStatementSummary }) {
  const hasOverdue = row.overdueCount > 0;
  const inFavor = row.balance < 0;
  return (
    <section
      aria-label={copy.summaryLabel(row.currency)}
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-hairline px-4 py-3 sm:px-6">
        <p className="t-label text-muted">
          {row.currency}
        </p>
        {row.nextInstallment ? (
          <p className="text-right text-xs text-muted">
            <span>{copy.nextInstallment}</span>{' '}
            <span className="font-medium text-ink tabular-nums">
              {copy.nextInstallmentValue(
                formatCivilDate(row.nextInstallment.dueDate),
                formatCurrency(row.nextInstallment.amount, row.currency),
              )}
            </span>
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        <Figure label={copy.budgeted} testId="budgeted">
          {formatCurrency(row.budgeted, row.currency)}
        </Figure>
        <Figure label={copy.paid} testId="paid">
          {formatCurrency(row.paid, row.currency)}
        </Figure>
        <Figure label={copy.balance} testId="balance" emphasis>
          {formatCurrency(Math.abs(row.balance), row.currency)}
          {inFavor ? (
            <span className="ml-1 text-xs font-normal text-success">{statementCopy.inFavor}</span>
          ) : null}
        </Figure>
        <Figure
          label={copy.overdue}
          testId="overdue"
          className={hasOverdue ? 'bg-danger/5 text-danger' : undefined}
        >
          {hasOverdue ? (
            <>
              {formatCurrency(row.overdueAmount, row.currency)}
              <span className="block text-xs font-normal">
                {statementCopy.overdueCount(row.overdueCount)}
              </span>
            </>
          ) : (
            <span className="text-sm font-normal text-muted">{statementCopy.noOverdue}</span>
          )}
        </Figure>
      </dl>
    </section>
  );
}

function Figure({
  label,
  testId,
  emphasis = false,
  className,
  children,
}: {
  label: string;
  testId: string;
  emphasis?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'border-hairline px-4 py-3 sm:px-6',
        // Filetes de la rejilla: 2 columnas hasta `lg` (con el raíl, una
        // tablet no tiene ancho para cuatro importes), 4 desde ahí.
        'max-lg:odd:border-r max-lg:[&:nth-child(n+3)]:border-t lg:[&:not(:first-child)]:border-l',
        className,
      )}
      data-testid={testId}
    >
      <dt className="t-label text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 break-words tabular-nums',
          emphasis ? 'text-base font-semibold sm:text-lg' : 'font-medium',
        )}
      >
        {children}
      </dd>
    </div>
  );
}
