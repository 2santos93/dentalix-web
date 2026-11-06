import * as React from 'react';
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_RISK_LABELS,
  MAINTENANCE_KIND_LABELS,
  type EquipmentDetail,
  type EquipmentMaintenance,
} from '@/lib/equipment/equipment-api';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { StatusBadge } from '@/components/ui/status-badge';

export const lifeSheetCopy = {
  title: 'Hoja de vida del equipo',
  dataHeading: 'Datos del equipo',
  programHeading: 'Programa de mantenimiento',
  historyHeading: 'Historial de mantenimientos',
  location: 'Sede',
  chair: 'Sillón',
  category: 'Tipo',
  brand: 'Marca',
  model: 'Modelo',
  serialNumber: 'Número de serie',
  sanitaryRegistration: 'Registro sanitario',
  riskClass: 'Clasificación de riesgo',
  acquiredOn: 'Fecha de adquisición',
  notes: 'Notas',
  interval: 'Preventivo',
  intervalValue: (n: number) => (n === 1 ? 'Cada mes' : `Cada ${n} meses`),
  noInterval: 'Sin periodicidad',
  next: 'Próximo preventivo',
  last: 'Último mantenimiento',
  status: 'Estado',
  retired: (date: string, reason: string) => `Dado de baja el ${date}: ${reason}`,
  empty: 'Todavía no tiene mantenimientos registrados.',
  technician: 'Técnico',
  company: 'Empresa',
  cost: 'Costo',
  nextDue: 'Dejó programado el próximo',
  recordedBy: (name: string, when: string) => `Registrado por ${name} el ${when}`,
  voidedNote: (when: string, reason: string) => `Anulado el ${when}: ${reason}`,
  none: '—',
};

const copy = lifeSheetCopy;

interface EquipmentLifeSheetProps {
  equipment: EquipmentDetail;
  /** Pinta fechas e importes con el formato de la sede del equipo. */
  stamp: Pick<SedePainters, 'civilDate' | 'dateTime' | 'money'>;
  /** Acciones por mantenimiento (pantalla); en papel no hay. */
  maintenanceActions?: (maintenance: EquipmentMaintenance) => React.ReactNode;
}

function Fact({ label, value, numeric }: { label: string; value: React.ReactNode; numeric?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={numeric ? 'tabular-nums' : undefined}>{value}</dd>
    </>
  );
}

/**
 * La hoja de vida de un equipo biomédico (DX-542): sus datos, su programa de
 * mantenimiento y TODOS sus mantenimientos en orden cronológico (los anulados,
 * tachados y con su motivo). La misma pieza en Ajustes y en la vista
 * imprimible: en papel cabe en A4 o carta y no lleva acciones.
 */
export function EquipmentLifeSheet({ equipment, stamp, maintenanceActions }: EquipmentLifeSheetProps) {
  const loc = equipment.locationId;
  const day = (value: string | null) => (value ? stamp.civilDate(value, loc) : copy.none);
  return (
    <article
      aria-labelledby="life-sheet-title"
      className="equipment-life-sheet flex min-w-0 flex-col gap-5 bg-surface p-4 text-ink sm:p-6 print:bg-white print:p-0"
    >
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <p className="t-caption text-muted">{copy.title}</p>
        <h2 id="life-sheet-title" className="text-xl font-semibold [overflow-wrap:anywhere]">
          {equipment.name}
        </h2>
        {equipment.status === 'RETIRED' && equipment.retiredOn ? (
          <p className="text-sm text-muted">
            {copy.retired(day(equipment.retiredOn), equipment.retiredReason ?? copy.none)}
          </p>
        ) : null}
      </header>

      <div className="grid gap-5 md:grid-cols-2 print:grid-cols-2">
        <section aria-labelledby="life-sheet-data" className="flex min-w-0 flex-col gap-2">
          <h3 id="life-sheet-data" className="t-label text-muted">
            {copy.dataHeading}
          </h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm [overflow-wrap:anywhere]">
            <Fact label={copy.location} value={equipment.locationName} />
            <Fact label={copy.chair} value={equipment.chairName ?? copy.none} />
            <Fact label={copy.category} value={EQUIPMENT_CATEGORY_LABELS[equipment.category]} />
            <Fact label={copy.brand} value={equipment.brand ?? copy.none} />
            <Fact label={copy.model} value={equipment.model ?? copy.none} />
            <Fact label={copy.serialNumber} value={equipment.serialNumber ?? copy.none} numeric />
            <Fact label={copy.sanitaryRegistration} value={equipment.sanitaryRegistration ?? copy.none} />
            <Fact
              label={copy.riskClass}
              value={equipment.riskClass ? EQUIPMENT_RISK_LABELS[equipment.riskClass] : copy.none}
            />
            <Fact label={copy.acquiredOn} value={day(equipment.acquiredOn)} numeric />
          </dl>
        </section>

        <section aria-labelledby="life-sheet-program" className="flex min-w-0 flex-col gap-2">
          <h3 id="life-sheet-program" className="t-label text-muted">
            {copy.programHeading}
          </h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm [overflow-wrap:anywhere]">
            <Fact
              label={copy.interval}
              value={
                equipment.maintenanceIntervalMonths
                  ? copy.intervalValue(equipment.maintenanceIntervalMonths)
                  : copy.noInterval
              }
            />
            <Fact label={copy.last} value={day(equipment.lastMaintenanceOn)} numeric />
            <Fact label={copy.next} value={day(equipment.nextMaintenanceOn)} numeric />
            <Fact
              label={copy.status}
              value={
                equipment.maintenanceStatus ? (
                  <StatusBadge kind="equipmentMaintenance" status={equipment.maintenanceStatus} />
                ) : (
                  <StatusBadge kind="equipment" status={equipment.status} />
                )
              }
            />
          </dl>
          {equipment.notes ? (
            <p className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">
              <span className="text-muted">{copy.notes}: </span>
              {equipment.notes}
            </p>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="life-sheet-history" className="flex min-w-0 flex-col gap-2">
        <h3 id="life-sheet-history" className="t-label text-muted">
          {copy.historyHeading}
        </h3>
        {equipment.maintenances.length === 0 ? (
          <p className="text-sm text-muted">{copy.empty}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
            {equipment.maintenances.map((m) => {
              const voided = m.voidedAt !== null;
              return (
                <li
                  key={m.id}
                  data-testid="life-sheet-maintenance"
                  data-voided={voided ? 'true' : 'false'}
                  className="flex flex-col gap-1 px-3 py-2 text-sm break-inside-avoid"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={voided ? 'font-medium text-muted line-through' : 'font-medium'}>
                      <span className="tabular-nums">{day(m.performedOn)}</span> · {MAINTENANCE_KIND_LABELS[m.kind]}
                    </p>
                    <div className="flex items-center gap-2">
                      {/* DX-546 · FE-115: «Anulado» es neutro (registro retirado, no un error). */}
                      {voided ? <StatusBadge kind="clinicalRecord" status="VOIDED" /> : null}
                      {maintenanceActions?.(m)}
                    </div>
                  </div>
                  <p
                    className={
                      'whitespace-pre-line [overflow-wrap:anywhere]' + (voided ? ' text-muted line-through' : '')
                    }
                  >
                    {m.description}
                  </p>
                  <dl
                    className={
                      'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 [overflow-wrap:anywhere] sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] print:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]' +
                      (voided ? ' text-muted' : '')
                    }
                  >
                    {m.technician ? <Fact label={copy.technician} value={m.technician} /> : null}
                    {m.company ? <Fact label={copy.company} value={m.company} /> : null}
                    {m.cost !== null && m.currency ? (
                      <Fact label={copy.cost} value={stamp.money(m.cost, m.currency, loc)} numeric />
                    ) : null}
                    {m.nextDueOn ? <Fact label={copy.nextDue} value={day(m.nextDueOn)} numeric /> : null}
                  </dl>
                  <p className="text-xs text-muted">
                    {copy.recordedBy(m.createdByName ?? copy.none, stamp.dateTime(m.createdAt, loc))}
                  </p>
                  {voided && m.voidedAt ? (
                    <p className="text-xs text-ink">
                      {copy.voidedNote(stamp.dateTime(m.voidedAt, loc), m.voidReason ?? copy.none)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </article>
  );
}
