'use client';
import { useId } from 'react';
import { MapPin, Armchair } from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  PUNCTUALITY_CLASSES,
  inClinicCount,
  punctualityLabel,
  timeInZone,
  type InClinicItem,
  type InClinicView,
} from '@/lib/appointments/patient-flow';
import type { InClinicState } from '@/components/appointments/use-in-clinic';
import {
  PatientFlowActions,
  type PatientFlowRunner,
} from '@/components/appointments/patient-flow-actions';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const inClinicCopy = {
  title: 'En clínica',
  titleMine: 'Te esperan',
  loading: 'Cargando quién está en la clínica…',
  emptyTitle: 'Nadie en espera',
  emptyHint: 'Cuando recepción marque «Llegó» en la agenda, el paciente aparece aquí.',
  noLocationTitle: 'Elige una sede',
  noLocationHint: 'El panel es por sede: elige una arriba para ver quién está en la clínica.',
  retry: 'Reintentar',
  refreshHint: 'Se actualiza solo cada 45 segundos.',
  count: (n: number) => (n === 1 ? '1 paciente' : `${n} pacientes`),
  groups: {
    waiting: 'En espera',
    inChair: 'En sillón',
    readyForCheckout: 'Listo para cobrar',
  },
  groupEmpty: {
    waiting: 'Nadie en espera',
    inChair: 'Nadie en el sillón',
    readyForCheckout: 'Nadie por cobrar',
  },
  minutes: {
    waiting: (m: number) => `Espera ${m} min`,
    inChair: (m: number) => `En sillón ${m} min`,
    readyForCheckout: (m: number) => `Por cobrar ${m} min`,
  },
  appointmentAt: (time: string) => `Cita ${time}`,
  arrivedAt: (time: string, punctuality: string) => `Llegó ${time} · ${punctuality}`,
};

type GroupKey = keyof typeof inClinicCopy.groups;
const GROUPS: GroupKey[] = ['waiting', 'inChair', 'readyForCheckout'];

export function patientName(item: Pick<InClinicItem, 'patientFirstName' | 'patientLastName' | 'patientId'>): string {
  const joined = [item.patientFirstName, item.patientLastName].filter(Boolean).join(' ').trim();
  return joined || item.patientId;
}

interface InClinicPanelProps {
  state: InClinicState;
  role: ClinicRole | null;
  runner: PatientFlowRunner;
  className?: string;
  /** false en su propia ruta, donde el título lo pone la cabecera de la página. */
  showTitle?: boolean;
}

/**
 * Panel «En clínica» (DX-200): por sede, quién espera, quién está en el sillón
 * y quién está listo para cobrar, con los minutos (reloj del servidor) y un
 * chip de color por puntualidad de la llegada (verde a tiempo, naranja hasta
 * 5 min tarde, rojo después) que además lo dice en texto. Solo nombre y horas.
 * El odontólogo ve «Te esperan» con sus pacientes.
 */
export function InClinicPanel({
  state,
  role,
  runner,
  className,
  showTitle = true,
}: InClinicPanelProps) {
  const titleId = useId();
  const { view, loading, error, noLocation, reload } = state;
  const mine = view?.scope === 'MINE' || (view === null && role === 'DENTIST');
  const total = view ? inClinicCount(view) : null;

  return (
    <section aria-labelledby={titleId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <header className="flex items-baseline justify-between gap-2">
        <h2
          id={titleId}
          className={cn('text-lg font-semibold tracking-tight text-ink', !showTitle && 'sr-only')}
        >
          {mine ? inClinicCopy.titleMine : inClinicCopy.title}
        </h2>
        {total !== null ? (
          <span className="text-xs font-medium tabular-nums text-muted">{inClinicCopy.count(total)}</span>
        ) : null}
      </header>

      {noLocation ? (
        <EmptyState
          icon={<MapPin aria-hidden />}
          title={inClinicCopy.noLocationTitle}
          description={inClinicCopy.noLocationHint}
        />
      ) : view === null && error ? (
        <SectionError description={error} onRetry={reload} retryLabel={inClinicCopy.retry} />
      ) : loading || view === null ? (
        <div role="status" className="flex flex-col gap-2" data-testid="in-clinic-loading">
          <span className="sr-only">{inClinicCopy.loading}</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : inClinicCount(view) === 0 ? (
        <EmptyState
          role="status"
          icon={<Armchair aria-hidden />}
          title={inClinicCopy.emptyTitle}
          description={inClinicCopy.emptyHint}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <InClinicGroup
              key={group}
              group={group}
              title={group === 'waiting' && mine ? inClinicCopy.titleMine : inClinicCopy.groups[group]}
              items={view[group]}
              view={view}
              role={role}
              runner={runner}
            />
          ))}
          <p className="text-xs text-muted">{inClinicCopy.refreshHint}</p>
        </div>
      )}
    </section>
  );
}

function InClinicGroup({
  group,
  title,
  items,
  view,
  role,
  runner,
}: {
  group: GroupKey;
  title: string;
  items: InClinicItem[];
  view: InClinicView;
  role: ClinicRole | null;
  runner: PatientFlowRunner;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-testid={`in-clinic-group-${group}`}>
      <h3
        id={headingId}
        className="flex items-baseline justify-between border-b border-border pb-1.5 text-sm font-semibold text-ink"
      >
        {title}
        <span className="text-xs font-medium tabular-nums text-muted">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted">{inClinicCopy.groupEmpty[group]}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const name = patientName(item);
            const tz = view.timeZone;
            return (
              <li
                key={item.appointmentId}
                data-testid="in-clinic-item"
                data-punctuality={item.punctuality}
                className="flex flex-col gap-2 border-b border-hairline py-3 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{name}</p>
                    <p className="text-xs tabular-nums text-muted">
                      {inClinicCopy.appointmentAt(timeInZone(item.start, tz))}
                      {item.providerName ? ` · ${item.providerName}` : ''}
                    </p>
                    {item.arrivedAt ? (
                      <p className="text-xs tabular-nums text-muted">
                        {inClinicCopy.arrivedAt(
                          timeInZone(item.arrivedAt, tz),
                          punctualityLabel(item.punctuality),
                        )}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
                      PUNCTUALITY_CLASSES[item.punctuality],
                    )}
                  >
                    {inClinicCopy.minutes[group](item.minutesInStatus)}
                  </span>
                </div>
                <PatientFlowActions
                  appointmentId={item.appointmentId}
                  status={item.status}
                  role={role}
                  isToday
                  patientName={name}
                  runner={runner}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
