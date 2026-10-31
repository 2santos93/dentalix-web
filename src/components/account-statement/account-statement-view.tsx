'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, FileText, HandCoins, Lock, Printer, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  accountStatementPrintHref,
  getAccountStatement,
  type AccountStatement,
  type AccountStatementMovement,
  type AccountStatementPlan,
  type AccountStatementSummary,
} from '@/lib/account-statement/account-statement-api';
import {
  installmentLabel,
  isEmptyStatement,
  methodLabel,
  movementMediumName,
  movementReferenceLabel,
  movementDestination,
  openingAsOfLabel,
  openingNoteFor,
  planNamer,
  statementCopy,
  voidedDetail,
} from '@/lib/account-statement/presentation';
import {
  INSTALLMENT_STATUS_BADGE_VARIANT,
  INSTALLMENT_STATUS_LABELS,
} from '@/lib/payment-plans/installment-status';
import { PLAN_STATUS_BADGE_VARIANT, PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import { planQuotePrintHref } from '@/lib/treatment-plans/plan-quote-api';
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
import { PaymentReceiptDialog } from '@/components/payments/payment-receipt-dialog';
import {
  useVoidPayment,
  voidPaymentSubject,
  type VoidPaymentTarget,
} from '@/components/payments/use-void-payment';
import { RecordPaymentModal } from '@/components/payments/record-payment-modal';
import { StatementPaymentPlanModal } from './statement-payment-plan-modal';
import { PlanItemsBalance } from './plan-items-balance';
import { canRecordPayments } from '@/lib/payments/billable-plans-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { cn } from '@/lib/utils';
import { CreditBalanceSection } from '@/components/patient-credit/credit-balance-section';
import { CreditRefundDialog } from '@/components/patient-credit/credit-refund-dialog';
import { canMoveCredit, type CreditRefund } from '@/lib/patient-credit/patient-credit-api';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  title: 'Estado de cuenta',
  description:
    'Lo presupuestado, lo abonado y lo que falta, por moneda. De toda la historia del paciente, en todas las sedes.',
  print: 'Imprimir',
  // DX-203: un menor o un paciente sin email.
  addressee: (name: string) => `Sale a nombre de su responsable: ${name}.`,
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
  // QA D2: un abono va a un plan o a un saldo migrado.
  colDestination: 'Destino',
  colStatus: 'Estado',
  colBudgeted: 'Presupuestado',
  colPaid: 'Abonado',
  colBalance: 'Saldo',
  // Presupuesto imprimible del plan (DX-012): recepción lo imprime desde aquí,
  // sin entrar al plan de tratamiento (clínico).
  colQuote: 'Presupuesto',
  quoteLink: 'Presupuesto',
  quoteLinkSuffix: (plan: string) => ` · ${plan} (se abre en otra pestaña)`,
  // DX-051: cobrado y pendiente de cada ítem del plan, sin entrar al plan.
  colItems: 'Por ítem',
  itemsToggle: 'Ver por ítem',
  itemsToggleSuffix: (plan: string) => ` · ${plan}`,
  colDate: 'Fecha',
  colMethod: 'Método',
  colLocation: 'Sede',
  colAmount: 'Monto',
  colActions: 'Acciones',
  voidAction: 'Anular',
  voidActionLabel: (amount: string, date: string) => `Anular abono de ${amount} del ${date}`,
  receiptAction: 'Recibo',
  receiptActionLabel: (amount: string, date: string) =>
    `Recibo del abono de ${amount} del ${date}`,
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
  /**
   * Tras registrar o anular un abono, o crear un plan de cuotas: lo que en la
   * ficha depende del saldo (la marca de la cabecera y el bloque «Cobranza»,
   * cuyo compromiso un abono puede dar por cumplido, DX-150) se vuelve a leer.
   */
  onChanged?: () => void;
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
export function AccountStatementView({ token, patientId, onChanged }: AccountStatementViewProps) {
  const [data, setData] = useState<AccountStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const headingId = React.useId();
  // Anular (DX-057): «Anular» solo en movimientos con `canVoid` (lo calcula la
  // API para quien consulta); tras anular se recarga todo el estado de cuenta,
  // porque cambian el abonado, el saldo y las cuotas.
  const voiding = useVoidPayment(token, () => {
    setReloadKey((k) => k + 1);
    onChanged?.();
  });
  // Cobrar (DX-067): recepción registra abonos y planes de cuotas aquí, sin
  // entrar al plan de tratamiento (clínico). Tras cada uno se recarga todo.
  const canCharge = canRecordPayments(getTokenRole(token));
  const [chargeModal, setChargeModal] = useState<'payment' | 'payment-plan' | null>(null);
  const [chargeNotice, setChargeNotice] = useState<string | null>(null);
  // Recibo de caja (DX-136) de cualquier movimiento, también de los anulados
  // (sale marcado «ANULADO»).
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);
  // Saldo a favor (DX-253): traspaso y devolución (con su comprobante).
  const canCredit = canMoveCredit(getTokenRole(token));
  const [issuedRefund, setIssuedRefund] = useState<CreditRefund | null>(null);

  function openCharge(kind: 'payment' | 'payment-plan') {
    setChargeNotice(null);
    setChargeModal(kind);
  }

  function charged(notice: string) {
    setChargeModal(null);
    setChargeNotice(notice);
    setReloadKey((k) => k + 1);
    onChanged?.();
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
          {data?.addressee?.kind === 'RESPONSIBLE' ? (
            <p className="mt-1 text-sm text-ink" data-testid="statement-addressee">
              {copy.addressee(data.addressee.name)}
            </p>
          ) : null}
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
          {data ? (
            <StatementBody
              token={token}
              statement={data}
              onVoid={voiding.request}
              onReceipt={setReceiptPaymentId}
              canCredit={canCredit}
              onTransferred={charged}
              onRefunded={(refund) => {
                setIssuedRefund(refund);
                setChargeNotice(null);
                setReloadKey((k) => k + 1);
                onChanged?.();
              }}
            />
          ) : null}
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
            openingBalances={data?.openingBalances ?? []}
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

      <CreditRefundDialog
        refund={issuedRefund}
        onOpenChange={(open) => {
          if (!open) setIssuedRefund(null);
        }}
      />

      <PaymentReceiptDialog
        token={token}
        paymentId={receiptPaymentId}
        onOpenChange={(open) => {
          if (!open) setReceiptPaymentId(null);
        }}
      />

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
        splitLines={voiding.target?.splitLines ?? undefined}
      />
    </section>
  );
}

function StatementBody({
  token,
  statement,
  onVoid,
  onReceipt,
  canCredit,
  onTransferred,
  onRefunded,
}: {
  token: string;
  statement: AccountStatement;
  onVoid: (target: VoidPaymentTarget) => void;
  /** Abre el recibo de caja del abono (DX-136). */
  onReceipt: (paymentId: string) => void;
  /** DX-253: ADMIN y recepción ven «Aplicar a otro plan» y «Devolver». */
  canCredit: boolean;
  onTransferred: (notice: string) => void;
  onRefunded: (refund: CreditRefund) => void;
}) {
  const planName = planNamer(statement.plans);
  return (
    <div className="flex flex-col gap-8">
      {statement.summary.length > 0 ? (
        <div className="flex flex-col gap-3">
          {statement.summary.map((row) => (
            <CurrencySummary key={row.currency} row={row} />
          ))}
        </div>
      ) : null}

      <CreditBalanceSection
        token={token}
        statement={statement}
        planName={planName}
        canAct={canCredit}
        onTransferred={onTransferred}
        onRefunded={onRefunded}
      />

      {statement.openingBalances.length > 0 ? (
        <SubSection title={statementCopy.openingHeading}>
          <Card className="overflow-hidden p-0 shadow-none">
            <Table aria-label={statementCopy.openingTable}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{statementCopy.colConcept}</TableHead>
                  <TableHead scope="col">{statementCopy.colAsOf}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colAmount}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {statementCopy.colOpeningPaid}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {statementCopy.colOpeningPending}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.openingBalances.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell
                      className="font-medium break-words"
                      data-label={statementCopy.colConcept}
                    >
                      {o.concept}
                    </TableCell>
                    <TableCell className="tabular-nums" data-label={statementCopy.colAsOf}>
                      {openingAsOfLabel(o)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-label={copy.colAmount}>
                      {formatCurrency(o.amount, o.currency)}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      data-label={statementCopy.colOpeningPaid}
                    >
                      {formatCurrency(o.paid, o.currency)}
                    </TableCell>
                    <TableCell
                      className="text-right font-medium tabular-nums"
                      data-label={statementCopy.colOpeningPending}
                    >
                      {formatCurrency(o.pending, o.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <p className="max-w-prose text-xs text-muted">{openingNoteFor(statement.openingBalances)}</p>
        </SubSection>
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
                  <TableHead scope="col">
                    <span className="sr-only">{copy.colItems}</span>
                  </TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">{copy.colQuote}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.plans.map((plan) => (
                  <PlanRows
                    key={plan.id}
                    token={token}
                    plan={plan}
                    planName={planName(plan.id)}
                    quoteHref={planQuotePrintHref(statement.patient.id, plan.id)}
                  />
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
                  <TableHead scope="col">{copy.colDestination}</TableHead>
                  <TableHead scope="col">{copy.colMethod}</TableHead>
                  <TableHead scope="col">{copy.colLocation}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {copy.colAmount}
                  </TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">{copy.colActions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.movements.map((m) => (
                  <TableRow key={m.id} className={cn(m.voided && 'text-muted')}>
                    <TableCell className="tabular-nums" data-label={copy.colDate}>
                      {formatCivilDate(m.paidOn)}
                    </TableCell>
                    <TableCell className="text-muted" data-label={copy.colDestination}>
                      {movementDestination(m, planName, statement.openingBalances)}
                      <VoidedDetail movement={m} />
                    </TableCell>
                    <TableCell data-label={copy.colMethod}>
                      {/* DX-395: el medio de la clínica (no el método antiguo) y la referencia. */}
                      {m.method ? (
                        <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[m.method]}>
                          {movementMediumName(m)}
                        </Badge>
                      ) : (
                        <span className="text-muted">{methodLabel(null)}</span>
                      )}
                      {movementReferenceLabel(m) ? (
                        <span className="mt-1 block font-mono text-xs text-muted">
                          <span className="sr-only"> · </span>
                          {movementReferenceLabel(m)}
                        </span>
                      ) : null}
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
                    <TableCell className="text-right" data-label={copy.colActions}>
                      <span className="inline-flex flex-wrap items-center justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={copy.receiptActionLabel(
                            formatCurrency(m.amount, m.currency),
                            formatCivilDate(m.paidOn),
                          )}
                          onClick={() => onReceipt(m.id)}
                        >
                          {copy.receiptAction}
                        </Button>
                        {m.canVoid ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={copy.voidActionLabel(
                              formatCurrency(m.amount, m.currency),
                              formatCivilDate(m.paidOn),
                            )}
                            onClick={() =>
                              onVoid({
                                id: m.id,
                                amount: m.amount,
                                currency: m.currency,
                                paidOn: m.paidOn,
                                splitLines: m.splitLines,
                              })
                            }
                          >
                            {copy.voidAction}
                          </Button>
                        ) : null}
                      </span>
                    </TableCell>
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

/** Columnas de la tabla de planes: la fila del detalle por ítem las abarca todas. */
const PLAN_COLUMNS = 7;

/**
 * La fila de un plan y, justo debajo, su detalle «Ver por ítem» (DX-051).
 *
 * Un `<details>` no puede vivir dentro de un `<tr>`: el desplegable es un
 * botón con `aria-expanded`/`aria-controls` en la fila del plan y una fila
 * siguiente de ancho completo (`colSpan`) que, a 390 px, la tabla apila como
 * una tarjeta bajo la del plan. La fila existe siempre (a `aria-controls` no
 * le falta su destino) y se oculta con `hidden`; el detalle se monta la
 * primera vez que se abre —es entonces cuando carga— y se queda montado al
 * plegarlo, para no volver a pedirlo.
 */
function PlanRows({
  token,
  plan,
  planName,
  quoteHref,
}: {
  token: string;
  plan: AccountStatementPlan;
  planName: string;
  quoteHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const detailId = React.useId();

  function toggle() {
    setOpen((o) => !o);
    setOpened(true);
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium" data-label={copy.colPlan}>
          {planName}
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
        {/* Sin `data-label`: en la tarjeta móvil, «Por ítem» encima de «Ver
            por ítem» repetiría lo mismo. */}
        <TableCell className="text-right">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={toggle}
            className="max-sm:min-h-11"
          >
            {copy.itemsToggle}
            <span className="sr-only">{copy.itemsToggleSuffix(planName)}</span>
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
            />
          </Button>
        </TableCell>
        <TableCell className="text-right" data-label={copy.colQuote}>
          <a
            href={quoteHref}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-0"
          >
            <FileText aria-hidden className="size-4" />
            {copy.quoteLink}
            <span className="sr-only">{copy.quoteLinkSuffix(planName)}</span>
          </a>
        </TableCell>
      </TableRow>
      <TableRow id={detailId} hidden={!open} className="bg-bg/40 hover:bg-bg/40">
        {/* `max-sm:block`: sin `data-label`, la celda no lleva etiqueta en
            móvil; el detalle ocupa la tarjeta entera. */}
        <TableCell colSpan={PLAN_COLUMNS} className="max-sm:block max-sm:py-2">
          {opened ? <PlanItemsBalance token={token} planId={plan.id} /> : null}
        </TableCell>
      </TableRow>
    </>
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
      {row.openingPending > 0 ? (
        <p
          data-testid="opening"
          className="border-t border-hairline px-4 py-2 text-xs text-muted sm:px-6"
        >
          {statementCopy.openingIncluded}{' '}
          <span className="font-medium tabular-nums text-ink">
            {formatCurrency(row.openingPending, row.currency)}
          </span>
        </p>
      ) : null}
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
