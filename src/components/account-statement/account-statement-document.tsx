import * as React from 'react';
import type { AccountStatement } from '@/lib/account-statement/account-statement-api';
import {
  installmentLabel,
  isEmptyStatement,
  movementMethodLabel,
  movementDestination,
  openingAsOfLabel,
  planNamer,
  statementCopy,
  voidedDetail,
} from '@/lib/account-statement/presentation';
import { INSTALLMENT_STATUS_LABELS } from '@/lib/payment-plans/installment-status';
import { PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import { ClinicLogo } from '@/components/brand/clinic-brand';

const copy = {
  title: 'Estado de cuenta',
  issuedAt: 'Fecha de emisión',
  patient: 'Paciente',
  document: 'Documento',
  noDocument: '—',
  // DX-203: el de un menor o un paciente sin email, a nombre del responsable.
  addressee: 'A nombre de',
  addresseeValue: (name: string) => `${name} (responsable)`,
  summaryHeading: 'Resumen',
  summaryTable: 'Resumen por moneda',
  plansHeading: 'Planes',
  plansTable: 'Planes del paciente',
  movementsHeading: 'Movimientos',
  movementsTable: 'Movimientos (abonos)',
  movementsRange: (from: string | null, to: string | null) => {
    if (from && to) return `Movimientos del ${formatCivilDate(from)} al ${formatCivilDate(to)}.`;
    if (from) return `Movimientos desde el ${formatCivilDate(from)}.`;
    return `Movimientos hasta el ${formatCivilDate(to)}.`;
  },
  movementsEmpty: 'Sin abonos registrados.',
  installmentsHeading: 'Cuotas',
  installmentsTable: 'Calendario de cuotas',
  colCurrency: 'Moneda',
  colBudgeted: 'Presupuestado',
  colPaid: 'Abonado',
  colBalance: 'Saldo',
  colOverdue: 'Vencido',
  colNext: 'Próxima cuota',
  colPlan: 'Plan',
  // QA D2: un abono va a un plan o a un saldo migrado.
  colDestination: 'Destino',
  colStatus: 'Estado',
  colDate: 'Fecha',
  colMethod: 'Método',
  colLocation: 'Sede',
  colAmount: 'Monto',
  colDue: 'Vencimiento',
  colInstallment: 'Cuota',
  colOutstanding: 'Pendiente',
  overdueValue: (amount: string, n: number) => `${amount} (${n})`,
  none: '—',
};

interface AccountStatementDocumentProps {
  statement: AccountStatement;
}

/**
 * El estado de cuenta como DOCUMENTO para entregar en papel o PDF (DX-011):
 * cabecera de la clínica, datos del paciente, fecha de emisión, resumen y
 * detalle. Sin botones ni controles: solo lo que va al papel.
 *
 * Excepción de fidelidad de impresión (la misma que el comprobante de abono,
 * ver `payment-receipt.tsx`): usa colores claros explícitos (papel blanco,
 * tinta oscura) en vez de los tokens del tema, porque un documento impreso es
 * blanco aunque el usuario tenga el modo oscuro. Las tablas no se apilan como
 * en la app: en A4 caben y un documento se lee como tabla; en un teléfono, el
 * marco se desplaza de lado sin que la página crezca.
 */
export function AccountStatementDocument({ statement }: AccountStatementDocumentProps) {
  const planName = planNamer(statement.plans);
  const { clinic, patient, range } = statement;
  // M1: con saldo migrado, el «Saldo» no es solo presupuestado − abonado.
  const withOpening = statement.summary.some((row) => row.openingBalance > 0);
  const filtered = range.from !== null || range.to !== null;

  return (
    <div className="statement-print-root mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header
        data-testid="statement-header"
        className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex items-center gap-3">
          {clinic.logoUrl ? <ClinicLogo src={clinic.logoUrl} alt={clinic.name} variant="paper" /> : null}
          <div>
            <p className="text-base font-semibold">{clinic.name}</p>
            <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          </div>
        </div>
        <p className="text-sm text-[#4b5563] sm:text-right">
          {copy.issuedAt}
          <br />
          <span className="font-medium text-[#111827] tabular-nums">
            {formatDateTime(statement.issuedAt)}
          </span>
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">
            {copy.patient}
          </dt>
          <dd className="font-medium">{`${patient.firstName} ${patient.lastName}`}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">
            {copy.document}
          </dt>
          <dd className="tabular-nums">
            {documentText(dtoDocTypeName(patient), patient.docNumber) ?? copy.noDocument}
          </dd>
        </div>
        {statement.addressee?.kind === 'RESPONSIBLE' ? (
          <div data-testid="statement-addressee">
            <dt className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">
              {copy.addressee}
            </dt>
            <dd className="font-medium">{copy.addresseeValue(statement.addressee.name)}</dd>
          </div>
        ) : null}
      </dl>

      {isEmptyStatement(statement) ? (
        <p className="mt-8 text-sm">{statementCopy.emptyDescription}</p>
      ) : (
        <>
          {statement.summary.length > 0 ? (
            <DocSection title={copy.summaryHeading}>
              <DocTable label={copy.summaryTable}>
                <thead>
                  <tr>
                    <Th>{copy.colCurrency}</Th>
                    <Th right>{copy.colBudgeted}</Th>
                    {withOpening ? <Th right>{statementCopy.openingHeading}</Th> : null}
                    <Th right>{copy.colPaid}</Th>
                    <Th right>{copy.colBalance}</Th>
                    <Th right>{copy.colOverdue}</Th>
                    <Th>{copy.colNext}</Th>
                  </tr>
                </thead>
                <tbody>
                  {statement.summary.map((row) => (
                    <tr key={row.currency}>
                      <Th scope="row">{row.currency}</Th>
                      <Td right>{formatCurrency(row.budgeted, row.currency)}</Td>
                      {withOpening ? (
                        <Td right>{formatCurrency(row.openingBalance, row.currency)}</Td>
                      ) : null}
                      <Td right>{formatCurrency(row.paid, row.currency)}</Td>
                      <Td right strong>
                        {formatCurrency(Math.abs(row.balance), row.currency)}
                        {row.balance < 0 ? ` ${statementCopy.inFavor}` : ''}
                      </Td>
                      <Td right strong={row.overdueCount > 0}>
                        {row.overdueCount > 0
                          ? copy.overdueValue(
                              formatCurrency(row.overdueAmount, row.currency),
                              row.overdueCount,
                            )
                          : copy.none}
                      </Td>
                      <Td>
                        {row.nextInstallment
                          ? `${formatCivilDate(row.nextInstallment.dueDate)} · ${formatCurrency(
                              row.nextInstallment.amount,
                              row.currency,
                            )}`
                          : copy.none}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DocTable>
              {withOpening ? (
                <p className="mt-1 text-xs">{statementCopy.balanceIncludesOpening}</p>
              ) : null}
            </DocSection>
          ) : null}

          {statement.openingBalances.length > 0 ? (
            <DocSection title={statementCopy.openingHeading}>
              <DocTable label={statementCopy.openingTable}>
                <thead>
                  <tr>
                    <Th>{statementCopy.colConcept}</Th>
                    <Th>{statementCopy.colAsOf}</Th>
                    <Th right>{copy.colAmount}</Th>
                    <Th right>{statementCopy.colOpeningPaid}</Th>
                    <Th right>{statementCopy.colOpeningPending}</Th>
                  </tr>
                </thead>
                <tbody>
                  {statement.openingBalances.map((o) => (
                    <tr key={o.id}>
                      <Td>{o.concept}</Td>
                      <Td>{openingAsOfLabel(o)}</Td>
                      <Td right>{formatCurrency(o.amount, o.currency)}</Td>
                      <Td right>{formatCurrency(o.paid, o.currency)}</Td>
                      <Td right strong>
                        {formatCurrency(o.pending, o.currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DocTable>
            </DocSection>
          ) : null}

          {statement.plans.length > 0 ? (
            <DocSection title={copy.plansHeading}>
              <DocTable label={copy.plansTable}>
                <thead>
                  <tr>
                    <Th>{copy.colPlan}</Th>
                    <Th>{copy.colStatus}</Th>
                    <Th right>{copy.colBudgeted}</Th>
                    <Th right>{copy.colPaid}</Th>
                    <Th right>{copy.colBalance}</Th>
                  </tr>
                </thead>
                <tbody>
                  {statement.plans.map((plan) => (
                    <tr key={plan.id}>
                      <Td>{planName(plan.id)}</Td>
                      <Td>
                        {PLAN_STATUS_LABELS[plan.status]}
                        {!plan.countsTowardsBalance ? ` · ${statementCopy.notCounted}` : ''}
                      </Td>
                      <Td right>{formatCurrency(plan.budgeted, plan.currency)}</Td>
                      <Td right>
                        {formatCurrency(plan.paid, plan.currency)}
                        {plan.paidOtherCurrencies.map((o) => (
                          <span key={o.currency} className="block text-xs text-[#4b5563]">
                            + {formatCurrency(o.amount, o.currency)}
                          </span>
                        ))}
                      </Td>
                      <Td right strong>
                        {formatCurrency(plan.balance, plan.currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DocTable>
            </DocSection>
          ) : null}

          {statement.installments.length > 0 ? (
            <DocSection title={copy.installmentsHeading}>
              <DocTable label={copy.installmentsTable}>
                <thead>
                  <tr>
                    <Th>{copy.colDue}</Th>
                    <Th>{copy.colInstallment}</Th>
                    <Th>{copy.colPlan}</Th>
                    <Th right>{copy.colAmount}</Th>
                    <Th right>{copy.colOutstanding}</Th>
                    <Th>{copy.colStatus}</Th>
                  </tr>
                </thead>
                <tbody>
                  {statement.installments.map((inst) => (
                    <tr key={`${inst.paymentPlanId}-${inst.kind}-${inst.sequence ?? 0}`}>
                      <Td>{formatCivilDate(inst.dueDate)}</Td>
                      <Td>{installmentLabel(inst)}</Td>
                      <Td>{planName(inst.treatmentPlanId)}</Td>
                      <Td right>{formatCurrency(inst.amount, inst.currency)}</Td>
                      <Td right>{formatCurrency(inst.outstanding, inst.currency)}</Td>
                      <Td strong={inst.status === 'OVERDUE'}>
                        {INSTALLMENT_STATUS_LABELS[inst.status]}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DocTable>
            </DocSection>
          ) : null}

          <DocSection title={copy.movementsHeading}>
            {filtered ? (
              <p className="mb-2 text-xs text-[#4b5563]">
                {copy.movementsRange(range.from, range.to)}
              </p>
            ) : null}
            {statement.movements.length > 0 ? (
              <DocTable label={copy.movementsTable}>
                <thead>
                  <tr>
                    <Th>{copy.colDate}</Th>
                    <Th>{copy.colDestination}</Th>
                    <Th>{copy.colMethod}</Th>
                    <Th>{copy.colLocation}</Th>
                    <Th right>{copy.colAmount}</Th>
                  </tr>
                </thead>
                <tbody>
                  {statement.movements.map((m) => (
                    <tr key={m.id} className={m.voided ? 'text-[#6b7280]' : undefined}>
                      <Td>{formatCivilDate(m.paidOn)}</Td>
                      <Td>
                        {movementDestination(m, planName, statement.openingBalances)}
                        {voidedDetail(m) ? (
                          <span className="block text-xs">{voidedDetail(m)}</span>
                        ) : null}
                      </Td>
                      <Td>{movementMethodLabel(m)}</Td>
                      <Td>{m.location.name}</Td>
                      <Td right>
                        {m.voided ? (
                          <>
                            <span className="mr-2 text-xs uppercase">{statementCopy.voided}</span>
                            <span className="line-through">
                              {formatCurrency(m.amount, m.currency)}
                            </span>
                          </>
                        ) : (
                          formatCurrency(m.amount, m.currency)
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DocTable>
            ) : (
              <p className="text-sm">{copy.movementsEmpty}</p>
            )}
          </DocSection>

          <p className="mt-6 border-t border-[#e5e7eb] pt-3 text-xs text-[#4b5563]">
            {statementCopy.footnote}
          </p>
        </>
      )}
    </div>
  );
}

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

export function DocTable({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table aria-label={label} className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  right = false,
  scope = 'col',
}: {
  children: React.ReactNode;
  right?: boolean;
  scope?: 'col' | 'row';
}) {
  return (
    <th
      scope={scope}
      className={`border-b border-[#d1d5db] px-2 py-1.5 text-xs font-semibold whitespace-nowrap ${
        right ? 'text-right' : 'text-left'
      } ${scope === 'row' ? 'font-semibold' : 'uppercase tracking-wide text-[#4b5563]'}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right = false,
  strong = false,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`border-b border-[#e5e7eb] px-2 py-1.5 align-top tabular-nums ${
        right ? 'text-right whitespace-nowrap' : 'text-left'
      } ${strong ? 'font-semibold' : ''}`}
    >
      {children}
    </td>
  );
}
