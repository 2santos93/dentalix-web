'use client';
import { ApiError } from '@/lib/api/api-error';
import { locationClock } from '@/lib/locations/sede-clock';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { components } from '@/lib/api/schema';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

export type AffectedAppointments = components['schemas']['ScheduleAffectedAppointmentsDto'];
export const SCHEDULE_AFFECTS_APPOINTMENTS = 'SCHEDULE_AFFECTS_APPOINTMENTS';

export const affectedCopy = {
  title: (total: number) =>
    total === 1 ? '1 cita queda fuera de este horario' : `${total} citas quedan fuera de este horario`,
  description:
    'Guardar no mueve ni cancela ninguna cita: siguen agendadas y hay que avisar al paciente o reagendarlas.',
  confirm: 'Guardar de todos modos',
  cancel: 'Volver',
  more: (count: number) => `Y ${count} más.`,
};

/** DX-267: lo que trae el 409 de un horario que deja citas fuera; si no lo es, null. */
export function affectedFromError(err: unknown): AffectedAppointments | null {
  if (!(err instanceof ApiError) || err.code !== SCHEDULE_AFFECTS_APPOINTMENTS) return null;
  return err.affectedAppointments;
}

/** DX-267: enseña las citas afectadas, en la hora de su sede, antes de guardar. */
export function AffectedAppointmentsDialog({
  token,
  affected,
  confirming,
  error,
  onConfirm,
  onCancel,
}: {
  token: string;
  affected: AffectedAppointments | null;
  confirming: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const state = useLocationsState(token);
  const locations = state.status === 'ready' ? state.locations : [];
  const when = (locationId: string, start: string) => {
    const clock = locationClock(locations.find((l) => l.id === locationId));
    return clock ? clock.fmt.dateTime(new Date(start), clock.timeZone) : NO_SEDE_FORMAT;
  };
  const hidden = affected ? affected.total - affected.sample.length : 0;
  return (
    <ConfirmDialog
      open={affected !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={affected ? affectedCopy.title(affected.total) : ''}
      description={affectedCopy.description}
      confirmLabel={affectedCopy.confirm}
      cancelLabel={affectedCopy.cancel}
      onConfirm={onConfirm}
      confirming={confirming}
      destructive={false}
      error={error}
    >
      {affected ? (
        <>
          <ul data-testid="affected-appointments" className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm text-ink">
            {affected.sample.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-x-3">
                <span className="min-w-0 font-medium">{a.patientName}</span>
                <span className="tabular-nums text-muted">{when(a.locationId, a.start)}</span>
              </li>
            ))}
          </ul>
          {hidden > 0 ? <p className="text-xs text-muted">{affectedCopy.more(hidden)}</p> : null}
        </>
      ) : null}
    </ConfirmDialog>
  );
}
