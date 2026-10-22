'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin, Armchair } from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  PUNCTUALITY_CLASSES,
  inClinicCount,
  punctualityLabel,
  timeInZone,
  type FlowAction,
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
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
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
  return joined || 'Paciente sin nombre';
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
  const panelRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<{
    id: string;
    group: GroupKey;
    sourceStatus: InClinicItem['status'] | null;
    exitsPanel: boolean;
    action: FlowAction;
    settled: boolean;
    failed: boolean;
  } | null>(null);
  const [focusCompletion, setFocusCompletion] = useState(0);
  const panelRunner: PatientFlowRunner = {
    pendingId: runner.pendingId,
    run: async (id, action, name) => {
      const source = GROUPS.find((group) => view?.[group].some((item) => item.appointmentId === id)) ?? 'waiting';
      const destination = action === 'SEAT' ? 'inChair' : action === 'READY' ? 'readyForCheckout' : source;
      const intent = {
        id,
        group: destination,
        sourceStatus: view?.[source].find((item) => item.appointmentId === id)?.status ?? null,
        exitsPanel: action === 'CHECKOUT' || action === 'UNDO_ARRIVAL',
        action,
        settled: false,
        failed: false,
      };
      pendingFocus.current = intent;
      const succeeded = await runner.run(id, action, name);
      if (pendingFocus.current === intent) {
        intent.settled = true;
        intent.failed = succeeded === false;
        setFocusCompletion((revision) => revision + 1);
      }
      return succeeded;
    },
  };
  useEffect(() => {
    const intent = pendingFocus.current;
    const panel = panelRef.current;
    if (!intent || !panel || !intent.settled || runner.pendingId === intent.id || view === null) return;
    const current = GROUPS.flatMap((group) => view[group]).find((item) => item.appointmentId === intent.id);
    // Un GET iniciado antes del PATCH puede terminar después: minutos nuevos
    // no confirman un paso. Esperar a que cambie el estado o salga del panel.
    if (!intent.failed && (current?.status === intent.sourceStatus || (intent.exitsPanel && current))) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected && !panel.contains(active)) {
      pendingFocus.current = null;
      return;
    }
    const row = Array.from(panel.querySelectorAll<HTMLElement>('[data-appointment-id]'))
      .find((element) => element.dataset.appointmentId === intent.id);
    const target = (intent.failed
      ? row?.querySelector<HTMLButtonElement>(`button[data-flow-action="${intent.action}"]:not(:disabled)`)
      : row?.querySelector<HTMLButtonElement>('button[data-flow-action]:not(:disabled)'))
      ?? panel.querySelector<HTMLElement>(`[data-focus-group="${intent.group}"]`);
    target?.focus();
    pendingFocus.current = null;
  }, [view, runner.pendingId, focusCompletion]);


  return (
    <section ref={panelRef} aria-labelledby={titleId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <header className="flex items-baseline justify-between gap-2">
        <h2
          id={titleId}
          className={cn('text-lg font-semibold tracking-tight text-ink', !showTitle && 'sr-only')}
        >
          {mine ? inClinicCopy.titleMine : inClinicCopy.title}
        </h2>
        {/* Región viva siempre montada: el sondeo anuncia el total cuando cambia. */}
        <span
          data-testid="in-clinic-count"
          aria-live="polite"
          aria-atomic="true"
          className="text-xs font-medium tabular-nums text-muted"
        >
          {total !== null ? inClinicCopy.count(total) : ''}
        </span>
      </header>

      {showTitle && <Link href="/agenda/en-clinica" className="w-fit text-sm font-medium text-primary underline underline-offset-4">Abrir a pantalla completa</Link>}

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
      ) : (
        <div className="flex flex-col gap-4">
          {inClinicCount(view) === 0 && <EmptyState role="status" icon={<Armchair aria-hidden />} title={inClinicCopy.emptyTitle} description={inClinicCopy.emptyHint} />}
          {GROUPS.map((group) => (
            <InClinicGroup
              key={group}
              group={group}
              title={group === 'waiting' && mine ? inClinicCopy.titleMine : inClinicCopy.groups[group]}
              items={view[group]}
              view={view}
              role={role}
              runner={panelRunner}
              showEmptyHint={inClinicCount(view) > 0}
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
  showEmptyHint,
}: {
  group: GroupKey;
  title: string;
  items: InClinicItem[];
  view: InClinicView;
  role: ClinicRole | null;
  runner: PatientFlowRunner;
  showEmptyHint: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-testid={`in-clinic-group-${group}`}>
      <h3
        id={headingId}
        tabIndex={-1}
        data-focus-group={group}
        className="flex items-baseline justify-between border-b border-border pb-1.5 text-sm font-semibold text-ink"
      >
        {title}
        <span className="text-xs font-medium tabular-nums text-muted">{items.length}</span>
      </h3>
      {items.length === 0 ? (showEmptyHint ? (
        <p className="py-2 text-sm text-muted">{inClinicCopy.groupEmpty[group]}</p>
      ) : null) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const name = patientName(item);
            const tz = view.timeZone;
            return (
              <li
                key={item.appointmentId}
                data-testid="in-clinic-item"
                data-appointment-id={item.appointmentId}
                data-punctuality={item.punctuality}
                className="flex flex-col gap-2 border-b border-hairline py-3 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2 font-medium text-ink">
                      <span className="truncate">{name}</span>
                      {/* DX-247: la misma alerta que la tarjeta de la agenda. */}
                      <MedicalAlertIndicator flags={item.medicalAlerts} patientName={name} size="default" />
                    </p>
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
