'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin, Armchair, CalendarClock, Maximize2 } from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  inClinicCount,
  inClinicFormat,
  punctualityLabel,
  timeInZone,
  type FlowAction,
  type InClinicItem,
  type InClinicView,
} from '@/lib/appointments/patient-flow';
import type { InClinicState } from '@/components/appointments/use-in-clinic';
import {
  PatientFlowActions,
  claimKey,
  type PatientFlowRunner,
} from '@/components/appointments/patient-flow-actions';
import {
  canClaimReserved,
  reservationCopy,
  reservedElsewhereMessage,
  reservedItemLabel,
  reservedNeedsFormat,
} from '@/lib/appointments/plan-item-reservations';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { SectionHeader } from '@/components/ui/section-header';

export const inClinicCopy = {
  title: 'En clínica',
  titleMine: 'Te esperan',
  loading: 'Cargando quién está en la clínica…',
  emptyTitle: 'Nadie en espera',
  emptyHint: 'Cuando recepción marque «Llegó» en la agenda, el paciente aparece aquí.',
  noLocation: 'Elige una sede para ver quién está en la clínica.',
  chooseLocation: 'Elegir sede',
  openFullscreen: 'Abrir a pantalla completa',
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
  /**
   * «Elegir sede» del estado sin sede. Por defecto enfoca (y abre) el selector
   * de sede visible de la app; quien pinta el panel en una hoja la cierra antes.
   */
  onChooseLocation?: () => void;
}

/**
 * Enfoca el selector de sede global visible (barra lateral en escritorio,
 * barra superior en el teléfono) y abre su lista si el navegador lo permite.
 * El panel no duplica el selector: hay UNA sede activa en la app.
 */
export function focusLocationSwitcher(): void {
  const select = Array.from(document.querySelectorAll<HTMLSelectElement>('select[aria-label="Sede"]')).find(
    (el) => el.getClientRects().length > 0,
  );
  if (!select) return;
  select.focus();
  try {
    select.showPicker?.();
  } catch {
    // Sin gesto del usuario o sin soporte: queda enfocado, que basta.
  }
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
  onChooseLocation = focusLocationSwitcher,
}: InClinicPanelProps) {
  const titleId = useId();
  const { view, loading, error, localeMissing, noLocation, reload } = state;
  const mine = view?.scope === 'MINE' || (view === null && role === 'DENTIST');
  const total = view ? inClinicCount(view) : null;
  // G1-B: las horas se pintan con el formato y el reloj que manda la vista; sin ellos, ninguno.
  const fmt = view ? inClinicFormat(view) : null;
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
    claimingKey: runner.claimingKey,
    claim: runner.claim,
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


  // Región viva siempre montada: el sondeo anuncia el total cuando cambia.
  const countNode = (
    <span data-testid="in-clinic-count" aria-live="polite" aria-atomic="true" className="t-caption tabular-nums">
      {total !== null ? inClinicCopy.count(total) : ''}
    </span>
  );
  const heading = mine ? inClinicCopy.titleMine : inClinicCopy.title;
  const header = showTitle ? (
    <SectionHeader
      titleId={titleId}
      title={heading}
      description={countNode}
      className="flex-row items-start justify-between gap-2 sm:flex-row"
      actions={
        <Button asChild variant="ghost" size="icon-sm" className="-mr-1 text-muted hover:text-ink">
          <Link href="/agenda/en-clinica" aria-label={inClinicCopy.openFullscreen} title={inClinicCopy.openFullscreen}>
            <Maximize2 aria-hidden />
          </Link>
        </Button>
      }
    />
  ) : (
    <header className="flex items-baseline justify-between gap-2">
      <h2 id={titleId} className="sr-only">
        {heading}
      </h2>
      {countNode}
    </header>
  );

  return (
    <section ref={panelRef} aria-labelledby={titleId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      {header}

      {noLocation ? (
        // Una línea y la acción, no una caja vacía: el panel es por sede.
        <p className="text-sm text-muted" data-testid="in-clinic-no-location">
          <MapPin aria-hidden className="mr-1.5 inline size-4 -translate-y-px align-middle" />
          {inClinicCopy.noLocation}{' '}
          <Button type="button" variant="link" size="sm" className="h-auto p-0 align-baseline" onClick={onChooseLocation}>
            {inClinicCopy.chooseLocation}
          </Button>
        </p>
      ) : view === null && error && localeMissing ? (
        // 409 LOCATION_LOCALE_REQUIRED: falta un dato de la sede, no es un fallo de carga (G1-B §10).
        <SedeConfigError kind="locale" description={error} onRetry={reload} locationId={localeMissing.locationId} />
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
      ) : !fmt ? (
        <SedeConfigError kind="locale" onRetry={reload} locationId={view.locationId} />
      ) : (
        <div className="flex flex-col gap-4">
          {inClinicCount(view) === 0 ? (
            showTitle ? (
              // En la columna de la agenda, una línea; a pantalla completa, el estado vacío entero.
              <p role="status" className="text-sm text-muted">
                <span className="font-medium text-ink">{inClinicCopy.emptyTitle}</span>
                {'. '}
                <span>{inClinicCopy.emptyHint}</span>
              </p>
            ) : (
              <EmptyState role="status" icon={<Armchair aria-hidden />} title={inClinicCopy.emptyTitle} description={inClinicCopy.emptyHint} />
            )
          ) : null}
          {GROUPS.map((group) => (
            <InClinicGroup
              key={group}
              group={group}
              title={group === 'waiting' && mine ? inClinicCopy.titleMine : inClinicCopy.groups[group]}
              items={view[group]}
              view={view}
              fmt={fmt}
              role={role}
              onRetry={reload}
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
  fmt,
  role,
  onRetry,
  runner,
  showEmptyHint,
}: {
  group: GroupKey;
  title: string;
  items: InClinicItem[];
  view: InClinicView;
  fmt: RegionalFormat;
  role: ClinicRole | null;
  /** Vuelve a leer el panel (aviso de una reserva en una sede sin formato). */
  onRetry: () => void;
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
                      {inClinicCopy.appointmentAt(timeInZone(item.start, tz, fmt))}
                      {item.providerName ? ` · ${item.providerName}` : ''}
                    </p>
                    {item.arrivedAt ? (
                      <p className="text-xs tabular-nums text-muted">
                        {inClinicCopy.arrivedAt(
                          timeInZone(item.arrivedAt, tz, fmt),
                          punctualityLabel(item.punctuality),
                        )}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge kind="punctuality" status={item.punctuality} className="tabular-nums">
                    {inClinicCopy.minutes[group](item.minutesInStatus)}
                  </StatusBadge>
                </div>
                <ReservedElsewhereNotice item={item} runner={runner} onRetry={onRetry} />
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

/**
 * DX-273: tratamientos de la cita reservados en OTRA cita (la reserva se
 * quedó allí al marcar «Llegó»). Aviso que no bloquea, con «Traer a esta
 * cita» por tratamiento; nada si no hay. DX-293: si la tiene otra cita de
 * hoy con el paciente en la clínica, sin botón: el texto dice dónde está.
 */
function ReservedElsewhereNotice({
  item,
  runner,
  onRetry,
}: {
  item: InClinicItem;
  runner: PatientFlowRunner;
  onRetry: () => void;
}) {
  const reserved = item.planItemsReservedElsewhere ?? [];
  if (reserved.length === 0) return null;
  // I4: sede permitida sin formato: fecha y hora «—» y un aviso por sede (no uno por tratamiento),
  // nunca el texto de la sede no permitida.
  const unconfigured = [...new Set(reserved.filter(reservedNeedsFormat).map((r) => r.locationId))];
  return (
    <div
      role="group"
      aria-label={reservationCopy.noticeTitle}
      data-testid="reserved-elsewhere"
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-ink"
    >
      {reserved.map((r) => {
        const label = reservedItemLabel(r);
        const busy = runner.claimingKey === claimKey(item.appointmentId, r.planItemId);
        const claimable = canClaimReserved(r);
        const Icon = claimable ? CalendarClock : Armchair;
        return (
          <div key={r.planItemId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{label}</p>
                <p className="text-xs break-words">{reservedElsewhereMessage(r)}</p>
              </div>
            </div>
            {runner.claim && claimable ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={busy}
                disabled={runner.claimingKey != null}
                aria-label={`${reservationCopy.claim}: ${label}`}
                onClick={() => void runner.claim?.(item.appointmentId, r)}
                className="h-11 shrink-0 sm:h-9"
              >
                {reservationCopy.claim}
              </Button>
            ) : null}
          </div>
        );
      })}
      {unconfigured.map((locationId) => (
        <SedeConfigError key={locationId} kind="locale" variant="note" onRetry={onRetry} locationId={locationId} />
      ))}
    </div>
  );
}
