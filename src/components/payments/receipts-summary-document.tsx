import { ClinicFiscalLines } from '@/components/brand/clinic-fiscal-lines';
import { DocSection, DocTable, Td, Th } from '@/components/account-statement/account-statement-document';
import { EMPTY_CLINIC_FISCAL } from '@/lib/clinic/clinic-settings-api';
import { documentTexts, type DocumentFormat } from '@/lib/format/document-format';
import type { ReceiptsSummary } from '@/lib/payments/receipts-summary-api';
import { receiptsSummaryCopy } from './receipts-summary-copy';

const copy = {
  title: 'Resumen de recibos',
  generatedAt: 'Fecha de emisión',
  patient: 'Paciente',
  document: 'Documento',
  patientCode: 'Código',
  period: 'Periodo',
  periodValue: (from: string, to: string) => `Del ${from} al ${to}`,
  none: '—',
  receiptsHeading: 'Recibos',
  totalsHeading: 'Totales por moneda',
  colNumber: 'N.º',
  colDate: 'Fecha',
  colLocation: 'Sede',
  colMethod: 'Método',
  colAmount: 'Monto',
  colCurrency: 'Moneda',
  colCount: 'Recibos',
  colTotal: 'Total',
};

interface ReceiptsSummaryDocumentProps {
  summary: ReceiptsSummary;
  /** Formato de la sede (zona y reloj); `null` → «—» en fechas e importes, nunca otro formato. */
  format: DocumentFormat | null;
}

/**
 * El recibo resumen de un periodo como DOCUMENTO para papel o PDF (DX-401):
 * cabecera de la clínica, paciente, periodo, recibos, totales por moneda y el
 * aviso de la API. Mismo criterio de impresión que el estado de cuenta (papel
 * blanco y tinta oscura explícitos, `statement-print-root` para la hoja A4).
 * En pantalla, bajo `sm`, los recibos van apilados en vez de en tabla: a 390 px
 * nada se sale de lado; al imprimir siempre va la tabla.
 */
export function ReceiptsSummaryDocument({ summary, format }: ReceiptsSummaryDocumentProps) {
  const doc = documentTexts(format);
  const { clinic, patient } = summary;
  const fiscal = {
    ...EMPTY_CLINIC_FISCAL,
    legalName: clinic.legalName,
    taxId: clinic.taxId,
    taxIdLabel: clinic.taxIdLabel ?? null,
    address: clinic.address,
  };
  return (
    <div
      data-testid="receipts-summary-document"
      className="statement-print-root mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0"
    >
      <header className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold [overflow-wrap:anywhere]">{clinic.name}</p>
          <ClinicFiscalLines fiscal={fiscal} />
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        </div>
        <p className="text-sm text-[#4b5563] sm:text-right">
          {copy.generatedAt}
          <br />
          <span className="font-medium text-[#111827] tabular-nums">{doc.dateTime(summary.generatedAt)}</span>
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Fact label={copy.patient} value={patient.fullName} strong />
        <Fact label={copy.document} value={patient.documentMasked ?? copy.none} />
        <Fact label={copy.patientCode} value={patient.patientCode} />
        <Fact label={copy.period} value={copy.periodValue(doc.civilDate(summary.from), doc.civilDate(summary.to))} />
      </dl>

      {summary.restrictedToLocations ? <p className="mt-4 text-sm">{receiptsSummaryCopy.restricted}</p> : null}

      {summary.receipts.length === 0 ? (
        <p className="mt-8 text-sm">{receiptsSummaryCopy.emptyTitle}.</p>
      ) : (
        <>
          <DocSection title={copy.receiptsHeading}>
            <div className="hidden sm:block print:block">
              <DocTable label={receiptsSummaryCopy.listLabel}>
                <thead>
                  <tr>
                    <Th>{copy.colNumber}</Th>
                    <Th>{copy.colDate}</Th>
                    <Th>{copy.colLocation}</Th>
                    <Th>{copy.colMethod}</Th>
                    <Th right>{copy.colAmount}</Th>
                  </tr>
                </thead>
                <tbody>
                  {summary.receipts.map((r, i) => (
                    <tr key={`${r.paymentId}-${i}`} className={r.voided ? 'text-[#6b7280]' : undefined}>
                      <Td>
                        {r.receiptNumber}
                        {r.voided && r.voidReason ? (
                          <span className="block text-xs">{receiptsSummaryCopy.voidReason(r.voidReason)}</span>
                        ) : null}
                      </Td>
                      <Td>{doc.civilDate(r.issuedOn)}</Td>
                      <Td>{r.locationName}</Td>
                      <Td>{r.methodLabel}</Td>
                      <Td right>
                        <Amount voided={r.voided} text={doc.amount(r.amount, r.currency)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DocTable>
            </div>
            {/* Teléfono: cada recibo, una ficha apilada (sin tabla que desborde). */}
            <ul aria-label={receiptsSummaryCopy.listLabel} className="divide-y divide-[#e5e7eb] text-sm sm:hidden print:hidden">
              {summary.receipts.map((r, i) => (
                <li key={`${r.paymentId}-${i}`} className={`py-2 ${r.voided ? 'text-[#6b7280]' : ''}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium tabular-nums">{r.receiptNumber}</span>
                    <Amount voided={r.voided} text={doc.amount(r.amount, r.currency)} />
                  </div>
                  <p className="text-xs [overflow-wrap:anywhere]">
                    {`${doc.civilDate(r.issuedOn)} · ${r.locationName} · ${r.methodLabel}`}
                  </p>
                  {r.voided && r.voidReason ? (
                    <p className="text-xs [overflow-wrap:anywhere]">{receiptsSummaryCopy.voidReason(r.voidReason)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </DocSection>

          <DocSection title={copy.totalsHeading}>
            <DocTable label={copy.totalsHeading}>
              <thead>
                <tr>
                  <Th>{copy.colCurrency}</Th>
                  <Th right>{copy.colCount}</Th>
                  <Th right>{copy.colTotal}</Th>
                </tr>
              </thead>
              <tbody>
                {summary.totals.map((t) => (
                  <tr key={t.currency}>
                    <Th scope="row">{t.currency}</Th>
                    <Td right>{t.count}</Td>
                    <Td right strong>
                      {doc.amount(t.amount, t.currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DocTable>
            {summary.voidedCount > 0 ? (
              <p className="mt-1 text-xs">{receiptsSummaryCopy.voidedExcluded(summary.voidedCount)}</p>
            ) : null}
          </DocSection>
        </>
      )}

      <p className="mt-6 border-t border-[#e5e7eb] pt-3 text-xs text-[#4b5563]" data-testid="receipts-summary-notice">
        {summary.notice}
      </p>
    </div>
  );
}

function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{label}</dt>
      <dd className={`tabular-nums [overflow-wrap:anywhere] ${strong ? 'font-medium' : ''}`}>{value}</dd>
    </div>
  );
}

function Amount({ voided, text }: { voided: boolean; text: string }) {
  if (!voided) return <span className="whitespace-nowrap tabular-nums">{text}</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="mr-2 text-xs uppercase">{receiptsSummaryCopy.voided}</span>
      <span className="line-through">{text}</span>
    </span>
  );
}
