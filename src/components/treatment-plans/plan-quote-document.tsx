import * as React from 'react';
import type { PlanQuote, PlanQuoteItem } from '@/lib/treatment-plans/plan-quote-api';
import { SURFACE_LABELS } from '@/lib/odontogram/surface-labels';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';

const copy = {
  title: 'Presupuesto de tratamiento',
  issuedOn: 'Fecha',
  validity: (days: number) => `Válido ${days} días`,
  validUntil: (date: string) => `hasta el ${date}`,
  patient: 'Paciente',
  document: 'Documento',
  noDocument: 'Sin documento',
  professional: 'Profesional',
  agreement: 'Convenio',
  agreementValue: (name: string, payer: string) => `${name} · ${payer}`,
  listPrice: (amount: string) => `Precio de lista ${amount}`,
  agreementSaving: 'Ahorro por convenio',
  noProfessional: 'Sin asignar',
  tableCaption: 'Procedimientos del presupuesto',
  colTooth: 'Diente',
  colProcedure: 'Procedimiento',
  colQuantity: 'Cant.',
  colPrice: 'Precio',
  colDiscount: 'Descuento',
  colSubtotal: 'Subtotal',
  wholeTooth: 'Diente completo',
  noDiscount: '—',
  toothLabel: (tooth: string) => `Diente ${tooth}`,
  quantityLabel: (n: number) => `Cantidad ${n}`,
  emptyItems: 'Este plan todavía no tiene procedimientos.',
  totalsHeading: 'Totales',
  gross: 'Subtotal',
  discounts: 'Descuentos',
  total: (currency: string) => `Total (${currency})`,
  signatureHeading: 'Aceptación',
  acceptedBy: (name: string, when: string) => `Aceptado y firmado por ${name} el ${when}`,
  signatureAlt: (name: string) => `Firma de ${name}`,
  recordedBy: (name: string) => `Registró la firma: ${name}`,
  blankSignature: 'Firma de aceptación del paciente',
  blankName: 'Nombre y documento',
  blankDate: 'Fecha',
  footerHash: 'Huella SHA-256 del presupuesto',
  footerAcceptanceHash: 'Huella SHA-256 de la aceptación',
  footerNote:
    'Precios por procedimiento y diente. El presupuesto puede cambiar tras la valoración clínica; pasada la validez, pide uno actualizado.',
  tampered:
    'La huella no coincide con el contenido guardado: este presupuesto pudo alterarse fuera de Dentalix.',
};

const money = (value: number, currency: string) => formatCurrency(value, currency);
const discount = (value: number, currency: string) =>
  value > 0 ? `−${money(value, currency)}` : copy.noDiscount;

/** «Precio de lista» solo cuando el precio cobrado es otro (convenio o lista de la sede). */
function listPriceOf(item: PlanQuoteItem, currency: string): string | null {
  return item.listPrice !== null && item.listPrice !== item.unitPrice
    ? copy.listPrice(money(item.listPrice, currency))
    : null;
}

function surfacesOf(item: PlanQuoteItem): string {
  return item.surfaces.length > 0
    ? item.surfaces.map((s) => SURFACE_LABELS[s]).join(', ')
    : copy.wholeTooth;
}

interface PlanQuoteDocumentProps {
  quote: PlanQuote;
}

/**
 * El presupuesto como DOCUMENTO para papel o PDF (DX-012): cabecera de la
 * clínica y la sede, fecha y validez, paciente y profesional, la tabla de
 * procedimientos por diente, los totales por moneda y la aceptación (la firma
 * si ya se firmó; si no, las líneas para firmar en papel). Al pie, la huella
 * SHA-256 de lo presentado.
 *
 * Misma excepción de fidelidad de impresión que el consentimiento y la receta:
 * papel blanco y tinta oscura explícitos, también en modo oscuro. En pantalla
 * estrecha la tabla se apila en tarjetas; en papel siempre es tabla.
 */
export function PlanQuoteDocument({ quote }: PlanQuoteDocumentProps) {
  const { acceptance, currency } = quote;
  const organization=new Map((quote.visitOrganization??[]).map(v=>[v.itemId,v]));
  const orderedItems=[...quote.items].sort((a,b)=>(organization.get(a.id)?.visit??1)-(organization.get(b.id)?.visit??1));
  const visitTitle=(id:string)=>{const v=organization.get(id);return `Visita ${v?.visit??1}${v?.label?' · '+v.label:''}${v?.minDaysAfterPrevious?' · intervalo mínimo '+v.minDaysAfterPrevious+' días':''}`;};
  const startsVisit=(index:number)=>index===0||(organization.get(orderedItems[index-1].id)?.visit??1)!==(organization.get(orderedItems[index].id)?.visit??1);


  return (
    <article className="quote-print-root mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header
        data-testid="quote-header"
        className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between"
      >
        <div className="flex items-start gap-3">
          {quote.clinicLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del tenant con host arbitrario, para imprimir; next/image no aporta nada aquí
            <img
              src={quote.clinicLogoUrl}
              alt={quote.clinicName}
              className="h-12 w-auto max-w-[160px] object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-base font-semibold">{quote.clinicName}</p>
            <p className="text-sm text-[#4b5563]">
              {quote.location.name}
              {quote.location.address ? (
                <>
                  <br />
                  {quote.location.address}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="sm:text-right print:text-right">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-1 text-sm text-[#4b5563]">
            {copy.issuedOn}:{' '}
            <span className="font-medium text-[#111827] tabular-nums">
              {formatCivilDate(quote.issuedOn)}
            </span>
          </p>
          <p className="text-sm text-[#4b5563]">
            <span className="font-medium text-[#111827]">{copy.validity(quote.validityDays)}</span>{' '}
            <span className="tabular-nums">{copy.validUntil(formatCivilDate(quote.validUntil))}</span>
          </p>
        </div>
      </header>

      <dl
        data-testid="quote-parties"
        className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3"
      >
        <div>
          <dt className="text-xs font-medium text-[#6b7280]">{copy.patient}</dt>
          <dd className="font-medium">{quote.patient.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[#6b7280]">{copy.document}</dt>
          <dd className="tabular-nums">{quote.patient.document ?? copy.noDocument}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[#6b7280]">{copy.professional}</dt>
          <dd>{quote.professionalName ?? copy.noProfessional}</dd>
        </div>
        {quote.agreement ? (
          <div className="sm:col-span-3 print:col-span-3" data-testid="quote-agreement">
            <dt className="text-xs font-medium text-[#6b7280]">{copy.agreement}</dt>
            <dd>{copy.agreementValue(quote.agreement.name, quote.agreement.payerName)}</dd>
          </div>
        ) : null}
      </dl>

      <section className="mt-6">
        {acceptance && quote.visitOrganization ? <p className="mb-3 text-xs text-[#4b5563]">Organización actual por visitas. Los precios y la aceptación corresponden al presupuesto firmado.</p> : null}
        {/* Pantalla ancha y papel: tabla. */}
        <table className="hidden w-full border-collapse text-sm sm:table print:table">
          <caption className="sr-only">{copy.tableCaption}</caption>
          <thead>
            <tr className="border-b border-[#111827] text-left text-xs font-medium text-[#4b5563]">
              <th scope="col" className="py-2 pr-3 font-medium">{copy.colTooth}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{copy.colProcedure}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{copy.colQuantity}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{copy.colPrice}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{copy.colDiscount}</th>
              <th scope="col" className="py-2 text-right font-medium">{copy.colSubtotal}</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[#4b5563]">
                  {copy.emptyItems}
                </td>
              </tr>
            ) : (
              orderedItems.map((item,index) => {
                const listLine = listPriceOf(item, currency);
                return (
                <React.Fragment key={item.id}>{startsVisit(index)?<tr><th scope="rowgroup" colSpan={6} className="border-b border-[#d1d5db] bg-[#f3f4f6] py-3 text-left font-semibold">{visitTitle(item.id)}</th></tr>:null}<tr className="quote-item border-b border-[#e5e7eb] align-top">
                  <td className="py-2 pr-3 font-medium tabular-nums">{item.toothNumber}</td>
                  <td className="py-2 pr-3">
                    <span className="block">{item.procedure}</span>
                    <span className="block text-xs text-[#4b5563]">{surfacesOf(item)}</span>
                    {listLine ? (
                      <span className="block text-xs text-[#4b5563] tabular-nums">{listLine}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(item.unitPrice, currency)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{discount(item.discount, currency)}</td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {money(item.subtotal, currency)}
                  </td>
                </tr></React.Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pantalla estrecha: una ficha por ítem (no en papel). */}
        <ul aria-label={copy.tableCaption} className="divide-y divide-[#e5e7eb] border-y border-[#e5e7eb] sm:hidden print:hidden">
          {quote.items.length === 0 ? (
            <li className="py-6 text-center text-sm text-[#4b5563]">{copy.emptyItems}</li>
          ) : (
            orderedItems.map((item,index) => {
              const listLine = listPriceOf(item, currency);
              return (
              <li key={item.id} className="py-3 text-sm">
                {startsVisit(index)?<h2 className="mb-3 text-base font-semibold">{visitTitle(item.id)}</h2>:null}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{item.procedure}</span>
                  <span className="font-medium tabular-nums">{money(item.subtotal, currency)}</span>
                </div>
                <p className="mt-0.5 text-xs text-[#4b5563]">
                  <span className="tabular-nums">{copy.toothLabel(item.toothNumber)}</span> · {surfacesOf(item)} ·{' '}
                  <span className="tabular-nums">{copy.quantityLabel(item.quantity)}</span>
                </p>
                <p className="mt-0.5 text-xs text-[#4b5563] tabular-nums">
                  {copy.colPrice} {money(item.unitPrice, currency)}
                  {item.discount > 0 ? ` · ${copy.colDiscount} ${discount(item.discount, currency)}` : ''}
                </p>
                {listLine ? <p className="mt-0.5 text-xs text-[#4b5563] tabular-nums">{listLine}</p> : null}
              </li>
              );
            })
          )}
        </ul>

        <dl
          data-testid="quote-totals"
          aria-label={copy.totalsHeading}
          className="quote-totals mt-4 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm"
        >
          {quote.totals.map((total) => (
            <React.Fragment key={total.currency}>
              <div className="flex justify-between gap-4">
                <dt className="text-[#4b5563]">{copy.gross}</dt>
                <dd className="tabular-nums">{money(total.gross, total.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#4b5563]">{copy.discounts}</dt>
                <dd className="tabular-nums">{discount(total.discount, total.currency)}</dd>
              </div>
              {total.agreementSaving > 0 ? (
                <div className="flex justify-between gap-4" data-testid={`quote-saving-${total.currency}`}>
                  <dt className="text-[#4b5563]">{copy.agreementSaving}</dt>
                  <dd className="tabular-nums">{money(total.agreementSaving, total.currency)}</dd>
                </div>
              ) : null}
              <div
                data-testid={`quote-total-${total.currency}`}
                className="flex justify-between gap-4 border-t border-[#111827] pt-1 text-base font-semibold"
              >
                <dt>{copy.total(total.currency)}</dt>
                <dd className="tabular-nums">{money(total.net, total.currency)}</dd>
              </div>
            </React.Fragment>
          ))}
        </dl>
      </section>

      <section
        data-testid="quote-signature"
        aria-label={copy.signatureHeading}
        className="quote-signature mt-10"
      >
        {acceptance ? (
          <figure className="flex max-w-sm flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL de la firma; next/image no la optimiza */}
            <img
              src={acceptance.signature}
              alt={copy.signatureAlt(acceptance.signerName)}
              className="h-24 w-full object-contain object-left-bottom"
            />
            <figcaption className="border-t border-[#111827] pt-2 text-sm">
              <span className="block font-medium">
                {copy.acceptedBy(acceptance.signerName, formatDateTime(acceptance.acceptedAt))}
              </span>
              <span className="text-[#4b5563]">{copy.recordedBy(acceptance.acceptedByName)}</span>
            </figcaption>
          </figure>
        ) : (
          <div className="grid grid-cols-1 gap-8 text-sm text-[#4b5563] sm:grid-cols-3 print:grid-cols-3">
            {[copy.blankSignature, copy.blankName, copy.blankDate].map((label) => (
              <p key={label} className="border-t border-[#111827] pt-2 sm:mt-12 print:mt-12">
                {label}
              </p>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-10 flex flex-col gap-2 border-t border-[#d1d5db] pt-4 text-xs text-[#4b5563]">
        {acceptance && !acceptance.integrityOk ? (
          <p className="font-medium text-[#be123c]">{copy.tampered}</p>
        ) : null}
        <p>{copy.footerNote}</p>
        <p>
          {copy.footerHash}:{' '}
          <span className="break-all font-mono text-[#111827]">{quote.contentHash}</span>
        </p>
        {acceptance ? (
          <p>
            {copy.footerAcceptanceHash}:{' '}
            <span className="break-all font-mono text-[#111827]">{acceptance.acceptanceHash}</span>
          </p>
        ) : null}
      </footer>
    </article>
  );
}
