import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDate, formatDateTime } from '@/lib/format/date';
import { DOC_TYPE_SHORT } from '@/lib/patients/doc-type';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import type { PaymentReceipt, ReceiptPrintFormat } from '@/lib/payments/payment-receipts-api';

// Copy en español (i18n-ready), como el resto de documentos imprimibles.
const copy = {
  title: 'Recibo de caja',
  number: (reference: string) => `N.º ${reference}`,
  legacyBadge: 'Sin serie',
  legacyHint: 'Abono anterior a la numeración consecutiva: conserva su referencia.',
  issuedAt: 'Emitido',
  // Un «sin serie» no tuvo emisión: lo que se conserva es el alta del abono.
  registeredAt: 'Abono registrado el',
  fiscalPending: 'Datos fiscales pendientes',
  taxId: (value: string) => `NIT/NIF ${value}`,
  location: (name: string, address: string | null) => (address ? `${name} · ${address}` : name),
  voidedStamp: 'ANULADO',
  voidedDetail: (when: string, reason: string) => `Anulado el ${when}. Motivo: ${reason}`,
  receivedFrom: 'Recibimos de',
  document: 'Documento',
  amount: 'Valor',
  method: 'Método',
  methodFallback: 'Sin especificar',
  paidOn: 'Fecha del abono',
  concept: 'Concepto',
  // DX-262: abono contra el saldo migrado (sin plan).
  openingLabel: (opening: { concept: string; asOfDate: string } | null) =>
    opening
      ? `Saldo migrado · ${opening.concept} · corte ${formatCivilDate(opening.asOfDate)}`
      : 'Saldo migrado',
  planLabel: (date: string, optionLabel: string | null) =>
    `Abono al plan de tratamiento del ${date}${optionLabel ? ` · ${optionLabel}` : ''}`,
  balanceAfter: 'Saldo del plan tras este abono',
  balanceUnavailable: 'No disponible',
  cashier: 'Recibió',
  signature: 'Firma y sello',
};

interface PaymentReceiptDocumentProps {
  receipt: PaymentReceipt;
  /** Hoja A4 (por defecto) o tirilla de 80 mm: cambia el ancho y la escala. */
  format?: ReceiptPrintFormat;
}

/**
 * El recibo de caja de un abono como DOCUMENTO (DX-136): lo mismo en el
 * diálogo de la ficha, en la vista imprimible y en el PDF. Todo sale de la
 * foto del recibo (`snapshot`), así que reimprimirlo da los mismos datos que
 * al emitirlo. Sin botones ni controles: solo lo que va al papel.
 *
 * Excepción de fidelidad de impresión (la misma que el estado de cuenta): usa
 * colores claros explícitos (papel blanco, tinta oscura) en vez de los tokens
 * del tema, porque el papel es blanco aunque la app esté en modo oscuro.
 */
export function PaymentReceiptDocument({ receipt, format = 'a4' }: PaymentReceiptDocumentProps) {
  const { snapshot } = receipt;
  const { clinic, location, patient, payment, plan, planBalance, cashier } = snapshot;
  const narrow = format === '80mm';

  return (
    <article
      data-testid="receipt-document"
      data-format={format}
      aria-labelledby="receipt-title"
      className={cn(
        'receipt-print-root mx-auto w-full bg-white text-[#111827] print:max-w-none print:p-0',
        narrow
          ? 'max-w-[80mm] px-3 py-4 text-[12px] leading-snug'
          : 'max-w-[210mm] px-4 py-6 text-sm sm:px-10 sm:py-10',
      )}
    >
      <header
        className={cn(
          'flex flex-col gap-3 border-b border-[#d1d5db] pb-4',
          !narrow && 'sm:flex-row sm:items-start sm:justify-between',
        )}
      >
        <div className="min-w-0">
          <p className="text-base font-semibold">{clinic.name}</p>
          {snapshot.fiscalDataPending ? (
            <p className="mt-1 inline-block rounded-sm border border-[#d1d5db] px-1.5 py-0.5 text-xs text-[#4b5563]">
              {copy.fiscalPending}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#4b5563]">
              {clinic.legalName}
              {clinic.taxId ? ` · ${copy.taxId(clinic.taxId)}` : null}
              {clinic.address ? (
                <>
                  <br />
                  {clinic.address}
                </>
              ) : null}
            </p>
          )}
          <p className="mt-1 text-xs text-[#4b5563]">{copy.location(location.name, location.address)}</p>
        </div>
        <div className={cn(!narrow && 'sm:text-right')}>
          <h1 id="receipt-title" className="text-xl font-semibold tracking-tight">
            {copy.title}
          </h1>
          <p className="text-lg font-semibold tabular-nums">{copy.number(receipt.reference)}</p>
          {receipt.legacy ? (
            <p className="mt-1 text-xs text-[#4b5563]">
              <span className="mr-1 rounded-sm border border-[#d1d5db] px-1.5 py-0.5 font-medium">
                {copy.legacyBadge}
              </span>
              {copy.legacyHint}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-[#4b5563]">
            {receipt.legacy ? copy.registeredAt : copy.issuedAt}{' '}
            <span className="tabular-nums">{formatDateTime(receipt.issuedAt)}</span>
          </p>
        </div>
      </header>

      {receipt.voided ? (
        <div
          data-testid="receipt-voided"
          role="note"
          className="mt-4 border-2 border-[#be123c] px-3 py-2 text-[#be123c]"
        >
          <p className="text-2xl font-bold tracking-[0.3em]">{copy.voidedStamp}</p>
          <p className="text-sm font-medium">
            {copy.voidedDetail(formatDateTime(receipt.voidedAt), receipt.voidReason ?? '')}
          </p>
        </div>
      ) : null}

      <dl className={cn('mt-4 grid gap-3', narrow ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
        <Field label={copy.receivedFrom}>{patient.fullName}</Field>
        {patient.docNumberMasked ? (
          <Field label={copy.document}>
            <span className="tabular-nums">{`${DOC_TYPE_SHORT[patient.docType]} ${patient.docNumberMasked}`}</span>
          </Field>
        ) : null}
        <Field label={copy.amount}>
          <span
            className={cn(
              'font-semibold tabular-nums',
              narrow ? 'text-base' : 'text-lg',
              receipt.voided && 'line-through',
            )}
          >
            {formatCurrency(payment.amount, payment.currency)}
          </span>
        </Field>
        <Field label={copy.method}>
          {payment.method ? PAYMENT_METHOD_LABELS[payment.method] : copy.methodFallback}
        </Field>
        <Field label={copy.paidOn}>
          <span className="tabular-nums">{formatCivilDate(payment.paidOn)}</span>
        </Field>
        <Field label={copy.concept}>
          {plan
            ? copy.planLabel(formatDate(plan.createdAt), plan.optionLabel)
            : copy.openingLabel(snapshot.openingBalance ?? null)}
        </Field>
        <Field label={copy.balanceAfter}>
          <span className="tabular-nums">
            {planBalance
              ? formatCurrency(planBalance.balance, planBalance.currency)
              : copy.balanceUnavailable}
          </span>
        </Field>
        {cashier ? <Field label={copy.cashier}>{cashier.fullName}</Field> : null}
      </dl>

      <footer className="mt-8 border-t border-[#d1d5db] pt-4">
        <p className="text-xs text-[#4b5563]">{copy.signature}: ______________________</p>
        <p className="mt-3 text-xs font-medium">{snapshot.legalNotice}</p>
      </footer>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
