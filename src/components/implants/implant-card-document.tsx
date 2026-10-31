import * as React from 'react';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import { formatImplantSize, type ImplantCard } from '@/lib/implants/implants-api';
import type { RegionalFormat } from '@/lib/format/regional-format';

const copy = {
  title: 'Tarjeta de implante',
  patientHeading: 'Portador del implante',
  name: 'Nombre',
  document: 'Documento',
  birthDate: 'Fecha de nacimiento',
  centerHeading: 'Centro que lo colocó',
  clinic: 'Clínica',
  location: 'Sede',
  address: 'Dirección',
  placedOn: 'Fecha de la intervención',
  professional: 'Profesional',
  itemsHeading: 'Componentes colocados',
  tooth: 'Diente',
  manufacturer: 'Fabricante',
  system: 'Sistema',
  reference: 'REF',
  lot: 'Lote',
  size: 'Medidas',
  udi: 'UDI',
  registration: 'Registro sanitario',
  voided: 'ANULADO',
  voidedNote: (when: string) =>
    `Registro anulado el ${when}: este componente no forma parte de la intervención.`,
  delivered: (when: string) => `Tarjeta entregada al paciente el ${when}.`,
  notDelivered: 'Entrega pendiente de registrar.',
  keep: 'Conserve esta tarjeta y muéstrela en cualquier atención médica u odontológica, y antes de una resonancia magnética.',
  none: '—',
};

/**
 * Documento de la tarjeta de implante (DX-191), compacto para que quepa en una
 * hoja A4 o carta: identidad del portador, centro, fecha, profesional y cada
 * componente con fabricante, REF y lote. Sin diagnóstico ni notas clínicas.
 */
/**
 * `fmt`: el formato de la sede de la pantalla (hasta G1-C, la tarjeta no trae
 * la suya); sin él, las medidas salen «—».
 */
export function ImplantCardDocument({ card, fmt }: { card: ImplantCard; fmt: RegionalFormat | null }) {
  const location = card.locations[0];
  return (
    <article className="implant-card-print-root flex min-w-0 flex-col gap-5 bg-white p-6 text-ink sm:p-8 print:p-0">
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <h1 className="text-xl font-semibold">{copy.title}</h1>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
        <section aria-labelledby="implant-card-patient" className="flex flex-col gap-2">
          <h2 id="implant-card-patient" className="t-label text-muted">
            {copy.patientHeading}
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm [overflow-wrap:anywhere]">
            <dt className="text-muted">{copy.name}</dt>
            <dd className="font-medium">{card.patientName}</dd>
            <dt className="text-muted">{copy.document}</dt>
            <dd className="tabular-nums">{card.patientDocument ?? copy.none}</dd>
            {card.patientBirthDate ? (
              <>
                <dt className="text-muted">{copy.birthDate}</dt>
                <dd className="tabular-nums">{formatCivilDate(card.patientBirthDate)}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section aria-labelledby="implant-card-center" className="flex flex-col gap-2">
          <h2 id="implant-card-center" className="t-label text-muted">
            {copy.centerHeading}
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm [overflow-wrap:anywhere]">
            <dt className="text-muted">{copy.clinic}</dt>
            <dd className="font-medium">{card.clinicName}</dd>
            {location ? (
              <>
                <dt className="text-muted">{copy.location}</dt>
                <dd>{card.locations.map((l) => l.name).join(' · ')}</dd>
              </>
            ) : null}
            {location?.address ? (
              <>
                <dt className="text-muted">{copy.address}</dt>
                <dd>{location.address}</dd>
              </>
            ) : null}
            <dt className="text-muted">{copy.placedOn}</dt>
            <dd className="tabular-nums">{formatCivilDate(card.placedOn)}</dd>
            <dt className="text-muted">{copy.professional}</dt>
            <dd>{card.professionals.join(', ')}</dd>
          </dl>
        </section>
      </div>

      <section aria-labelledby="implant-card-items" className="flex flex-col gap-2">
        <h2 id="implant-card-items" className="t-label text-muted">
          {copy.itemsHeading}
        </h2>
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border">
          {card.items.map((item) => {
            const size = formatImplantSize(item.diameterMm, item.lengthMm, fmt);
            return (
              <li
                key={item.id}
                data-voided={item.voided ? 'true' : 'false'}
                className="implant-card-item flex flex-col gap-1 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className={item.voided ? 'font-medium text-muted line-through' : 'font-medium'}>
                    {item.kindLabel} · {copy.tooth} <span className="tabular-nums">{item.toothNumber}</span>
                  </p>
                  {item.voided ? (
                    <span className="rounded-full border border-danger px-2 text-xs font-semibold text-danger">
                      {copy.voided}
                    </span>
                  ) : null}
                </div>
                <dl
                  className={
                    'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 [overflow-wrap:anywhere] sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] print:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]' +
                    (item.voided ? ' text-muted line-through' : '')
                  }
                >
                  <dt className="text-muted">{copy.manufacturer}</dt>
                  <dd>{item.manufacturer}</dd>
                  <dt className="text-muted">{copy.system}</dt>
                  <dd>{item.system ?? copy.none}</dd>
                  <dt className="text-muted">{copy.reference}</dt>
                  <dd className="break-all tabular-nums">{item.reference}</dd>
                  <dt className="text-muted">{copy.lot}</dt>
                  <dd className="break-all tabular-nums">{item.lot}</dd>
                  {size ? (
                    <>
                      <dt className="text-muted">{copy.size}</dt>
                      <dd className="tabular-nums">{size}</dd>
                    </>
                  ) : null}
                  {item.sanitaryRegistration ? (
                    <>
                      <dt className="text-muted">{copy.registration}</dt>
                      <dd className="break-all">{item.sanitaryRegistration}</dd>
                    </>
                  ) : null}
                  {item.udi ? (
                    <>
                      <dt className="text-muted">{copy.udi}</dt>
                      <dd className="break-all tabular-nums">{item.udi}</dd>
                    </>
                  ) : null}
                </dl>
                {item.voided && item.voidedAt ? (
                  <p className="text-xs text-ink">{copy.voidedNote(formatDateTime(item.voidedAt))}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted">
        <p>{card.deliveredAt ? copy.delivered(formatDateTime(card.deliveredAt)) : copy.notDelivered}</p>
        <p>{copy.keep}</p>
      </footer>
    </article>
  );
}
