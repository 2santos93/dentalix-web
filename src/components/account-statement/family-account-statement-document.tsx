import * as React from 'react';
import type {
  FamilyAccountStatement,
  FamilyCurrencyAmounts,
  FamilyStatementMember,
} from '@/lib/account-statement/account-statement-api';
import { statementCopy } from '@/lib/account-statement/presentation';
import { RELATIONSHIP_LABELS } from '@/lib/patients/responsible-parties-api';
import { formatCurrency } from '@/lib/format/currency';
import { formatDateTime } from '@/lib/format/date';
import { DocSection, DocTable, Td, Th } from './account-statement-document';

export const familyStatementCopy = {
  title: 'Estado de cuenta familiar',
  issuedAt: 'Fecha de emisión',
  payer: 'Pagador principal',
  membersHeading: 'Detalle por paciente',
  membersTable: 'Saldo de cada paciente',
  totalsHeading: 'Total familiar',
  totalsTable: 'Total por moneda',
  colPatient: 'Paciente',
  colCurrency: 'Moneda',
  colBudgeted: 'Presupuestado',
  colPaid: 'Abonado',
  colBalance: 'Saldo',
  colOverdue: 'Vencido',
  self: 'Titular',
  /** El parentesco guardado es el del PAGADOR respecto del dependiente. */
  payerAs: (label: string) => `Pagador: ${label.toLowerCase()}`,
  noBalance: 'Sin saldos',
  empty: 'Ningún paciente de este pagador tiene saldos.',
  footnote:
    'Solo importes y nombres. Cada subtotal es el estado de cuenta individual del paciente; los abonos se registran en cada uno.',
  none: '—',
};
const copy = familyStatementCopy;

function balanceText(row: FamilyCurrencyAmounts): string {
  return `${formatCurrency(Math.abs(row.balance), row.currency)}${
    row.balance < 0 ? ` ${statementCopy.inFavor}` : ''
  }`;
}

/**
 * Estado de cuenta FAMILIAR del pagador (DX-203) como documento para papel o
 * PDF: subtotal por paciente y moneda y el total. Solo importes y nombres,
 * nada clínico. Colores claros explícitos, como el individual.
 */
export function FamilyAccountStatementDocument({
  statement,
}: {
  statement: FamilyAccountStatement;
}) {
  const { clinic, payer, members, totals } = statement;
  const rows = members.flatMap<{
    member: FamilyStatementMember;
    row: FamilyCurrencyAmounts | null;
    first: boolean;
  }>((m) =>
    m.summary.length > 0
      ? m.summary.map((s, i) => ({ member: m, row: s, first: i === 0 }))
      : [{ member: m, row: null, first: true }],
  );

  return (
    <div className="statement-print-root mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold">{clinic.name}</p>
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        </div>
        <p className="text-sm text-[#4b5563] sm:text-right">
          {copy.issuedAt}
          <br />
          <span className="font-medium text-[#111827] tabular-nums">
            {formatDateTime(statement.issuedAt)}
          </span>
        </p>
      </header>

      <dl className="mt-4 text-sm">
        <dt className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{copy.payer}</dt>
        <dd className="font-medium">{`${payer.firstName} ${payer.lastName}`}</dd>
      </dl>

      {totals.length === 0 ? (
        <p className="mt-8 text-sm">{copy.empty}</p>
      ) : (
        <DocSection title={copy.totalsHeading}>
          <DocTable label={copy.totalsTable}>
            <thead>
              <tr>
                <Th>{copy.colCurrency}</Th>
                <Th right>{copy.colBudgeted}</Th>
                <Th right>{copy.colPaid}</Th>
                <Th right>{copy.colBalance}</Th>
                <Th right>{copy.colOverdue}</Th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.currency} data-testid="family-total">
                  <Th scope="row">{t.currency}</Th>
                  <Td right>{formatCurrency(t.budgeted, t.currency)}</Td>
                  <Td right>{formatCurrency(t.paid, t.currency)}</Td>
                  <Td right strong>
                    {balanceText(t)}
                  </Td>
                  <Td right>{t.overdueAmount > 0 ? formatCurrency(t.overdueAmount, t.currency) : copy.none}</Td>
                </tr>
              ))}
            </tbody>
          </DocTable>
          {totals.some((t) => t.openingBalance > 0) ? (
            <p className="mt-1 text-xs">{statementCopy.balanceIncludesOpening}</p>
          ) : null}
        </DocSection>
      )}

      <DocSection title={copy.membersHeading}>
        <DocTable label={copy.membersTable}>
          <thead>
            <tr>
              <Th>{copy.colPatient}</Th>
              <Th>{copy.colCurrency}</Th>
              <Th right>{copy.colBudgeted}</Th>
              <Th right>{copy.colPaid}</Th>
              <Th right>{copy.colBalance}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, row, first }) => (
              <tr key={`${member.patient.id}-${row?.currency ?? 'none'}`} data-testid="family-member-row">
                <Td>
                  {first ? (
                    <>
                      <span className="font-medium">{`${member.patient.firstName} ${member.patient.lastName}`}</span>
                      <span className="block text-xs text-[#4b5563]">
                        {member.self || !member.relationship
                          ? copy.self
                          : copy.payerAs(RELATIONSHIP_LABELS[member.relationship])}
                      </span>
                    </>
                  ) : null}
                </Td>
                {row ? (
                  <>
                    <Td>{row.currency}</Td>
                    <Td right>{formatCurrency(row.budgeted, row.currency)}</Td>
                    <Td right>{formatCurrency(row.paid, row.currency)}</Td>
                    <Td right strong>
                      {balanceText(row)}
                    </Td>
                  </>
                ) : (
                  <>
                    <Td>{copy.noBalance}</Td>
                    <Td right>{copy.none}</Td>
                    <Td right>{copy.none}</Td>
                    <Td right>{copy.none}</Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </DocTable>
      </DocSection>

      <p className="mt-6 border-t border-[#e5e7eb] pt-3 text-xs text-[#4b5563]">{copy.footnote}</p>
    </div>
  );
}
