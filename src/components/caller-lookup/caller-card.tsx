'use client';
import * as React from 'react';
import Link from 'next/link';
import { CalendarPlus, FolderOpen, TriangleAlert } from 'lucide-react';
import type { CallerMatch } from '@/lib/caller-lookup/caller-lookup-api';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import type { ClinicRole } from '@/lib/me/me-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { OverdueChip } from '@/components/collections/overdue-chip';

export const callerCardCopy = {
  nextAppointment: 'Próxima cita',
  noNextAppointment: 'Sin cita próxima',
  lastVisit: 'Última visita',
  noLastVisit: 'Sin visitas',
  pendingBalance: 'Saldo pendiente',
  noPendingBalance: 'Al día',
  criticalAlert: 'Alerta clínica',
  viaResponsible: 'Coincide con el teléfono de su responsable',
  newAppointment: 'Nueva cita',
  openRecord: 'Abrir ficha',
  at: (when: string, place: string) => `${when} · ${place}`,
  newAppointmentFor: (name: string) => `Nueva cita para ${name}`,
  openRecordOf: (name: string) => `Abrir la ficha de ${name}`,
};

/** Solo administración y recepción ven importes (la API no los manda a los demás). */
export function seesCallerAmounts(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/**
 * Un paciente que coincide con el número (DX-224). Próxima cita y última
 * visita con la zona y el reloj de LA SEDE de cada una (DX-354b); el saldo con
 * el formato de la sede de la pantalla y el código ISO de su moneda (DX-378).
 * `hasCriticalAlert` solo llega a los roles clínicos: sin la clave, no hay
 * alerta que pintar (recepción no la ve, ni siquiera como «Sin alertas»).
 */
export function CallerCard({
  match,
  role,
  stamp,
  onNewAppointment,
  onOpenRecord,
}: {
  match: CallerMatch;
  role: ClinicRole | null;
  stamp: SedeStamp;
  onNewAppointment: (match: CallerMatch) => void;
  onOpenRecord: () => void;
}) {
  const name = `${match.firstName} ${match.lastName}`.trim();
  const { nextAppointment, lastVisit, balance } = match;
  const amounts = seesCallerAmounts(role);
  // El esquema generado tipa `incomplete` como boolean; el chip espera `true`.
  const overdue = {
    ...balance.overdue,
    incomplete: balance.overdue.incomplete ? (true as const) : undefined,
  };
  return (
    <li
      aria-label={name}
      data-testid="caller-card"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="t-title min-w-0 break-words">{name}</h3>
          {match.hasCriticalAlert ? (
            <Badge variant="danger" data-testid="caller-critical-alert">
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              {callerCardCopy.criticalAlert}
            </Badge>
          ) : null}
          <OverdueChip balance={overdue} fmt={stamp.fmt} />
        </div>
        {match.matchedBy === 'RESPONSIBLE_PARTY' ? (
          <p className="text-sm text-muted">{callerCardCopy.viaResponsible}</p>
        ) : null}
      </div>

      <DescriptionList columns={3}>
        <DescriptionItem label={callerCardCopy.nextAppointment} numeric>
          {nextAppointment
            ? callerCardCopy.at(
                stamp.dateTime(nextAppointment.start, nextAppointment.location.id),
                nextAppointment.location.name,
              )
            : callerCardCopy.noNextAppointment}
        </DescriptionItem>
        <DescriptionItem label={callerCardCopy.lastVisit} numeric>
          {lastVisit
            ? callerCardCopy.at(stamp.date(lastVisit.start, lastVisit.location.id), lastVisit.location.name)
            : callerCardCopy.noLastVisit}
        </DescriptionItem>
        {amounts ? (
          <DescriptionItem label={callerCardCopy.pendingBalance} numeric>
            {balance.pending.length > 0 ? (
              <ul className="flex flex-col">
                {balance.pending.map((p) => (
                  <li key={p.currency}>{stamp.money(p.amount, p.currency)}</li>
                ))}
              </ul>
            ) : (
              callerCardCopy.noPendingBalance
            )}
          </DescriptionItem>
        ) : null}
      </DescriptionList>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          onClick={() => onNewAppointment(match)}
          aria-label={callerCardCopy.newAppointmentFor(name)}
          className="max-sm:min-h-11 max-sm:w-full"
        >
          <CalendarPlus aria-hidden />
          {callerCardCopy.newAppointment}
        </Button>
        <Button asChild variant="secondary" className="max-sm:min-h-11 max-sm:w-full">
          <Link href={`/patients/${match.id}`} onClick={onOpenRecord} aria-label={callerCardCopy.openRecordOf(name)}>
            <FolderOpen aria-hidden />
            {callerCardCopy.openRecord}
          </Link>
        </Button>
      </div>
    </li>
  );
}
