import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format/currency';
import { civilDateInZone, formatCivilDate } from '@/lib/format/date';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import type { CreditRefund, RefundPrintFormat } from '@/lib/patient-credit/patient-credit-api';

const copy = {
  title: 'Comprobante de devolución',
  number: (n: string) => `N.º ${n}`,
  issuedAt: 'Emitido',
  location: (name: string, address: string | null) => (address ? `${name} · ${address}` : name),
  refundedTo: 'Devolvemos a',
  document: 'Documento',
  amount: 'Valor devuelto',
  method: 'Método',
  reason: 'Motivo',
  plan: 'Saldo a favor del plan',
  planLabel: (date: string, label: string | null) =>
    `Plan de tratamiento del ${date}${label ? ` · ${label}` : ''}`,
  payments: 'Abonos de referencia',
  creditAfter: 'Saldo a favor que queda en el plan',
  refundedBy: 'Entregó',
  patientSignature: 'Firma del paciente (recibí conforme)',
  clinicSignature: 'Firma y sello de la clínica',
  note: 'La devolución no anula los abonos: quedan registrados con su recibo de caja.',
};

/**
 * El comprobante de devolución de saldo a favor (DX-253) como DOCUMENTO: lo
 * mismo en el diálogo, en la vista imprimible y en el PDF; todo sale de su
 * foto inmutable (`snapshot`). Colores de papel explícitos (la misma excepción
 * de fidelidad de impresión que el recibo de caja): el papel es blanco aunque
 * la app esté en oscuro.
 */
export function CreditRefundDocument({
  refund,
  format = 'a4',
}: {
  refund: CreditRefund;
  format?: RefundPrintFormat;
}) {
  const s = refund.snapshot;
  const narrow = format === '80mm';
  // DX-378: fechas y horas en la zona de la sede del comprobante.
  const zone = s.location.timeZone;
  const day = (iso: string) => formatCivilDate(civilDateInZone(iso, zone));
  const docName = dtoDocTypeName({ docType: s.patient.documentType, docTypeLabel: s.patient.docTypeLabel });
  const doc = documentText(docName, s.patient.docNumber);
  return (
    <article
      data-testid="refund-document"
      data-format={format}
      aria-labelledby="refund-title"
      className={cn(
        'receipt-print-root mx-auto w-full bg-white text-[#111827] print:max-w-none print:p-0',
        narrow ? 'max-w-[80mm] px-3 py-4 text-[12px] leading-snug' : 'max-w-[210mm] px-4 py-6 text-sm sm:px-10 sm:py-10',
      )}
    >
      <header
        className={cn(
          'flex flex-col gap-3 border-b border-[#d1d5db] pb-4',
          !narrow && 'sm:flex-row sm:items-start sm:justify-between',
        )}
      >
        <div className="min-w-0">
          <p className="text-base font-semibold">{s.clinic.name}</p>
          <p className="mt-1 text-xs text-[#4b5563]">{copy.location(s.location.name, s.location.address)}</p>
        </div>
        <div className={cn(!narrow && 'sm:text-right')}>
          <h1 id="refund-title" className="text-xl font-semibold tracking-tight">
            {copy.title}
          </h1>
          <p className="text-lg font-semibold tabular-nums">{copy.number(s.number)}</p>
          <p className="mt-1 text-xs text-[#4b5563]">
            {copy.issuedAt} {day(s.issuedAt)}
          </p>
        </div>
      </header>

      <dl className={cn('mt-4 grid gap-x-6 gap-y-3', !narrow && 'sm:grid-cols-2')}>
        <Row label={copy.refundedTo} value={s.patient.fullName} />
        {doc ? <Row label={copy.document} value={doc} /> : null}
        <Row label={copy.amount} value={formatCurrency(s.amount, s.currency)} strong />
        <Row label={copy.method} value={PAYMENT_METHOD_LABELS[s.method]} />
        <Row label={copy.plan} value={copy.planLabel(day(s.plan.createdAt), s.plan.label)} />
        <Row label={copy.creditAfter} value={formatCurrency(s.creditAfter, s.currency)} />
        <div className={cn(!narrow && 'sm:col-span-2')}>
          <Row label={copy.reason} value={s.reason} />
        </div>
      </dl>

      <section className="mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#4b5563]">{copy.payments}</h2>
        <ul className="mt-1 flex flex-col gap-0.5">
          {s.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-x-3 tabular-nums">
              <span>{p.receiptNumber}</span>
              <span>
                {day(p.paidAt)} · {formatCurrency(p.amount, p.currency)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-4 text-xs text-[#4b5563]">{copy.note}</p>
      {s.refundedBy.fullName ? (
        <p className="mt-2 text-xs text-[#4b5563]">
          {copy.refundedBy}: {s.refundedBy.fullName}
        </p>
      ) : null}

      <div className={cn('mt-10 grid gap-8', !narrow && 'sm:grid-cols-2')}>
        <Signature label={copy.patientSignature} />
        <Signature label={copy.clinicSignature} />
      </div>
    </article>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#4b5563]">{label}</dt>
      <dd className={cn('break-words', strong ? 'text-base font-semibold tabular-nums' : 'font-medium')}>{value}</dd>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div data-testid="signature-line" className="border-t border-[#111827] pt-1 text-center text-xs text-[#4b5563]">
      {label}
    </div>
  );
}
