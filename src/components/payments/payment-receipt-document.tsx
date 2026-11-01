import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDate, formatDateTime } from '@/lib/format/date';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { paymentRateCopy, ratePairLabel } from '@/lib/payments/payment-rate';
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
  // Excepción con nombre de la guarda de DX-327 hasta DX-019, que dará a la
  // clínica el nombre de su identificación fiscal.
  taxId: (value: string) => `Id. fiscal ${value}`,
  location: (name: string, address: string | null) => (address ? `${name} · ${address}` : name),
  voidedStamp: 'ANULADO',
  voidedDetail: (when: string, reason: string) => `Anulado el ${when}. Motivo: ${reason}`,
  receivedFrom: 'Recibimos de',
  document: 'Documento',
  amount: 'Valor',
  method: 'Método',
  methodFallback: 'Sin especificar',
  // DX-377: referencia del pago, si la tiene.
  reference: 'Referencia',
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
  // Revisión N1 / QA D2: sin plan, lo que queda del saldo migrado.
  openingBalanceAfter: 'Saldo pendiente tras este abono',
  balanceUnavailable: 'No disponible',
  // DX-376: abono en otra moneda que la del plan, con la tasa que congeló.
  rateTerm: 'Tasa de cambio',
  equivalent: (currency: string) => `Equivalente en ${currency}`,
  rateApplied: (pair: string, source: string, date: string) => `Tasa aplicada: ${pair} (${source}, ${date})`,
  rateMissing: 'Tasa aplicada: sin tasa de cambio de su día. El equivalente se calcula cuando se registre.',
  // DX-390: cobro dividido en varias formas de pago con un solo recibo.
  splitTotal: (currency: string) => `Total en ${currency}`,
  splitTotalMissing: 'Total pendiente de la tasa de cambio de alguna forma de pago.',
  splitLines: 'Formas de pago',
  splitEquivalent: (amount: string) => `equivale a ${amount}`,
  splitWithoutRate: 'sin tasa de su día',
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
  // DX-376: la tasa congelada del abono (DX-375), no la del día: reimprimir da
  // la misma. Un abono anterior aún sin congelar (LEGACY) no imprime tasa.
  const exchange = receipt.exchangeRate;
  // DX-390: un cobro dividido lleva su total y una fila por forma de pago.
  const split = receipt.split ?? null;
  const frozen = exchange?.status === 'FROZEN' && exchange.rate && exchange.equivalentAmount !== null
    ? { rate: exchange.rate, equivalent: exchange.equivalentAmount }
    : null;

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
            {/* DX-515: el título que la clínica tenía al emitir (de la foto). */}
            {snapshot.title ?? copy.title}
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

      {/* DX-515: la leyenda que la clínica o la sede tenía al emitir (de la
          foto): sin ella no se pinta nada y el recibo queda como antes. */}
      {snapshot.legend ? (
        <p
          data-testid="receipt-legend"
          className="mt-4 break-words border border-[#111827] px-3 py-2 text-center text-xs font-semibold"
        >
          {snapshot.legend}
        </p>
      ) : null}

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
            <span className="tabular-nums">
              {documentText(dtoDocTypeName(patient), patient.docNumberMasked)}
            </span>
          </Field>
        ) : null}
        {split ? (
          <SplitFields split={split} narrow={narrow} voided={receipt.voided} />
        ) : (
          <>
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
            {frozen ? (
              <Field label={copy.equivalent(frozen.rate.currency)}>
                <span className={cn('font-semibold tabular-nums', receipt.voided && 'line-through')}>
                  {formatCurrency(frozen.equivalent, frozen.rate.currency)}
                </span>
              </Field>
            ) : null}
            {frozen || exchange?.status === 'MISSING' ? (
              <div data-testid="receipt-rate" className={cn('min-w-0 text-xs text-[#4b5563]', !narrow && 'sm:col-span-2')}>
                <dt className="sr-only">{copy.rateTerm}</dt>
                <dd className="break-words tabular-nums">
                  {frozen
                    ? copy.rateApplied(
                        ratePairLabel(payment.currency, frozen.rate, (amount, currency) => formatCurrency(amount, currency)),
                        paymentRateCopy.source[frozen.rate.source],
                        formatCivilDate(frozen.rate.date),
                      )
                    : copy.rateMissing}
                </dd>
              </div>
            ) : null}
            <Field label={copy.method}>
              {payment.paymentMethodName ?? (payment.method ? PAYMENT_METHOD_LABELS[payment.method] : copy.methodFallback)}
            </Field>
            {payment.reference ? (
              <Field label={copy.reference}>
                <span className="font-mono">{payment.reference}</span>
              </Field>
            ) : null}
          </>
        )}
        <Field label={copy.paidOn}>
          <span className="tabular-nums">{formatCivilDate(payment.paidOn)}</span>
        </Field>
        <Field label={copy.concept}>
          {plan
            ? copy.planLabel(formatDate(plan.createdAt), plan.optionLabel)
            : copy.openingLabel(snapshot.openingBalance ?? null)}
        </Field>
        <Field label={plan ? copy.balanceAfter : copy.openingBalanceAfter}>
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

/** DX-390: el total en la moneda del plan y cada forma de pago del cobro. */
function SplitFields({
  split,
  narrow,
  voided,
}: {
  split: NonNullable<PaymentReceipt['split']>;
  narrow: boolean;
  voided: boolean;
}) {
  return (
    <>
      <Field label={copy.splitTotal(split.total.currency)}>
        {split.total.amount !== null ? (
          <span className={cn('font-semibold tabular-nums', narrow ? 'text-base' : 'text-lg', voided && 'line-through')}>
            {formatCurrency(split.total.amount, split.total.currency)}
          </span>
        ) : (
          <span className="text-xs text-[#4b5563]">{copy.splitTotalMissing}</span>
        )}
      </Field>
      <div data-testid="receipt-split-lines" className={cn('min-w-0', !narrow && 'sm:col-span-2')}>
        <dt className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{copy.splitLines}</dt>
        <dd>
          <ol className="mt-1 flex flex-col divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]">
            {split.lines.map((line) => (
              <li key={line.paymentId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                <span className="min-w-0 break-words">
                  {line.paymentMethodName ?? (line.method ? PAYMENT_METHOD_LABELS[line.method] : copy.methodFallback)}
                  {line.reference ? (
                    <span className="font-mono text-xs text-[#4b5563]">
                      {' '}
                      · {copy.reference} {line.reference}
                    </span>
                  ) : null}
                </span>
                <span className={cn('text-right tabular-nums', voided && 'line-through')}>
                  <span className="font-semibold">{formatCurrency(line.amount, line.currency)}</span>
                  {line.currency !== split.total.currency ? (
                    <span className="block text-xs text-[#4b5563]">
                      {line.equivalentAmount !== null
                        ? copy.splitEquivalent(formatCurrency(line.equivalentAmount, split.total.currency))
                        : copy.splitWithoutRate}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </dd>
      </div>
    </>
  );
}
