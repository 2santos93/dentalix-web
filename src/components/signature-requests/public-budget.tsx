import * as React from 'react';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import type { SedeClock } from '@/lib/locations/sede-clock';
import type { PublicBudget } from '@/lib/signature-requests/signature-requests-api';
import {
  listPriceNote,
  listPricesCurrency,
  listPricesInPlanCurrency,
} from '@/lib/treatment-plans/list-price';

export const publicBudgetCopy = {
  heading: 'Presupuesto',
  issued: (on: string, until: string) => `Emitido el ${on} · válido hasta el ${until}`,
  location: (name: string, address: string | null) => (address ? `${name} · ${address}` : name),
  professional: (name: string) => `Profesional: ${name}`,
  patient: (name: string, doc: string | null) => (doc ? `Paciente: ${name} · ${doc}` : `Paciente: ${name}`),
  agreement: (name: string, payer: string) => `Convenio: ${name} (${payer})`,
  tooth: (n: string) => `Diente ${n}`,
  unitPrice: 'Precio',
  discount: 'Descuento',
  subtotal: 'Subtotal',
  listPrice: (v: string) => `Precio de lista ${v}`,
  gross: 'Importe',
  totalDiscount: 'Descuentos',
  saving: 'Ahorro por convenio',
  net: (currency: string) => `Total (${currency})`,
  itemsLabel: 'Procedimientos del presupuesto',
};

const copy = publicBudgetCopy;

type PublicBudgetItem = PublicBudget['items'][number];

/** ¿El ítem enseña «Precio de lista»? El de un convenio, si lo guardó. */
function hasListPrice(item: PublicBudgetItem): item is PublicBudgetItem & { listPrice: number } {
  return item.listPrice !== null && item.agreementName !== null;
}

/**
 * El presupuesto que el paciente acepta a distancia (DX-415): la foto que se
 * envió, con importes en la moneda del plan y el formato de la sede que lo
 * envió, con el código ISO de la moneda (DX-378; sin formato de sede, «—»). En el móvil cada ítem
 * es una tarjeta (sin tabla que desborde a 390 px). Papel blanco y tinta
 * oscura, como el resto del documento, para imprimirlo igual.
 *
 * DX-502: el precio de lista es el del catálogo, en SU moneda
 * (`listPriceCurrency`, congelada en la foto), nunca en la del plan. Sin
 * moneda conocida (foto anterior a DX-502 o sedes sin moneda común) la cifra
 * no se muestra. En cualquiera de los dos casos va la nota de referencia y no
 * se muestra el «Ahorro por convenio», que restaría monedas distintas.
 */
export function PublicBudgetSummary({ budget, clock }: { budget: PublicBudget; clock: SedeClock | null }) {
  const fmt = clock?.fmt ?? null;
  const money = (value: number) => sedeMoney(value, budget.currency, fmt);
  const civil = (day: string) => sedeCivilDate(day, fmt);
  const listCurrencies = budget.items.filter(hasListPrice).map((item) => item.listPriceCurrency);
  const listInPlanCurrency = listPricesInPlanCurrency(listCurrencies, budget.currency);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-[#4b5563]">
        <p className="font-medium text-[#111827]">{copy.heading}</p>
        <p className="tabular-nums">{copy.issued(civil(budget.issuedOn), civil(budget.validUntil))}</p>
        <p>{copy.location(budget.location.name, budget.location.address)}</p>
        <p>{copy.patient(budget.patient.name, budget.patient.document)}</p>
        {budget.professionalName ? <p>{copy.professional(budget.professionalName)}</p> : null}
        {budget.agreement ? <p>{copy.agreement(budget.agreement.name, budget.agreement.payerName)}</p> : null}
      </div>

      <ul aria-label={copy.itemsLabel} className="flex flex-col divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]">
        {budget.items.map((item, index) => (
          <li key={`${item.toothNumber}-${index}`} className="flex flex-col gap-1 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words font-medium text-[#111827]">
                {item.procedure}
                <span className="block font-normal text-[#4b5563]">
                  {copy.tooth(item.toothNumber)}
                  {item.surfaces.length > 0 ? ` · ${item.surfaces.join(', ')}` : ''}
                </span>
              </p>
              <p className="shrink-0 text-right font-medium tabular-nums text-[#111827]">{money(item.subtotal)}</p>
            </div>
            <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#4b5563] tabular-nums">
              <div className="flex gap-1">
                <dt>{copy.unitPrice}</dt>
                <dd>{money(item.unitPrice)}</dd>
              </div>
              {item.discount > 0 ? (
                <div className="flex gap-1">
                  <dt>{copy.discount}</dt>
                  <dd>−{money(item.discount)}</dd>
                </div>
              ) : null}
              {hasListPrice(item) && item.listPriceCurrency ? (
                <div>
                  <dd>
                    {copy.listPrice(sedeMoney(item.listPrice, item.listPriceCurrency, fmt))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>

      {budget.totals.map((total) => (
        <dl key={total.currency} className="flex flex-col gap-1 text-sm tabular-nums">
          <div className="flex justify-between gap-3">
            <dt className="text-[#4b5563]">{copy.gross}</dt>
            <dd>{money(total.gross)}</dd>
          </div>
          {total.discount > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#4b5563]">{copy.totalDiscount}</dt>
              <dd>−{money(total.discount)}</dd>
            </div>
          ) : null}
          {total.agreementSaving > 0 && listInPlanCurrency ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#4b5563]">{copy.saving}</dt>
              <dd>{money(total.agreementSaving)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-[#111827] pt-1 text-base font-semibold text-[#111827]">
            <dt>{copy.net(total.currency)}</dt>
            <dd>{money(total.net)}</dd>
          </div>
        </dl>
      ))}
      {listInPlanCurrency ? null : (
        <p data-testid="public-budget-list-price-note" className="text-xs text-[#4b5563]">
          {listPriceNote(listPricesCurrency(listCurrencies), budget.currency)}
        </p>
      )}
    </div>
  );
}
