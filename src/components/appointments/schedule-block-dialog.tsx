'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createScheduleBlock,
  listAffectedAppointments,
  type AffectedAppointmentsPage,
  type SavedScheduleBlock,
} from '@/lib/appointments/schedule-blocks-api';
import {
  SCHEDULE_BLOCK_KINDS,
  SCHEDULE_BLOCK_KIND_LABELS,
  type ScheduleBlockKind,
} from '@/lib/appointments/schedule-blocks';
import type { StaffMember } from '@/lib/appointments/staff-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { civilDateLabel } from '@/lib/format/date';
import { sedeTimeRange, type AgendaClock } from '@/lib/locations/sede-clock';
import { SEDE_TIME_ZONE_ERROR } from '@/lib/locations/use-sede-time-zone';
import { timeToMinutes } from '@/lib/locations/schedule-api';
import { addCivilDays, wallDay, wallInstant } from '@/lib/time/wall-clock';
import { getTokenAllowedLocationIds } from '@/lib/auth/token-role';
import { listAppointmentTypes, type AppointmentType } from '@/lib/appointments/appointment-types-api';
import { FieldError } from '@/components/errors/field-error';
import { Checkbox } from '@/components/ui/checkbox';
import { TimeField } from '@/components/ui/date-field';

// Copy as constants (i18n-ready, es-first).
const copy = {
  title: 'Bloquear horario',
  description:
    'Vacaciones, congresos, reuniones o el almuerzo: la agenda no da citas en ese rango (o avisa, si permites agendar).',
  confirmTitle: 'Hay citas en ese horario',
  scope: 'A quién bloquea',
  scopeProvider: 'Un profesional',
  scopeLocation: 'Toda la sede',
  provider: 'Profesional',
  location: 'Sede',
  allLocations: 'Todas las sedes',
  noLocations: 'No tienes ninguna sede disponible para el bloqueo.',
  restrictedHint: 'Como tu acceso está acotado a sedes, el bloqueo debe tener sede.',
  kind: 'Motivo',
  wholeDays: 'Días completos',
  fromDate: 'Desde',
  toDate: 'Hasta (incluido)',
  fromTime: 'Hora de inicio',
  toTime: 'Hora de fin',
  allowsBooking: 'Permitir agendar encima (con aviso)',
  note: 'Nota (opcional)',
  notePlaceholder: 'Congreso SEPA, almuerzo del equipo…',
  submit: 'Bloquear',
  confirmSubmit: 'Bloquear igualmente',
  missing: 'Completa el profesional o la sede, y las fechas.',
  backwards: 'El final del bloqueo tiene que ser posterior al inicio.',
  affected: (n: number) =>
    n === 1
      ? 'Esta cita queda dentro del bloqueo. No se borra ni se mueve: avisa al paciente o muévela.'
      : `Estas ${n} citas quedan dentro del bloqueo. No se borran ni se mueven: avisa a los pacientes o muévelas.`,
  affectedList: 'Citas dentro del bloqueo',
  affectedMore: (n: number) => (n === 1 ? 'y 1 cita más.' : `y ${n} citas más.`),
  back: 'Volver y cambiar el bloqueo',
  genericError: 'No pudimos crear el bloqueo. Intenta de nuevo.',
  // DX-446: hueco reservado para ciertos tipos de cita.
  reservedKind: 'Reservado para…',
  reservedTypes: 'Tipos de cita permitidos',
  reservedTypesHint: 'Solo estos tipos se pueden agendar en el hueco (marca al menos uno).',
  urgentBadge: 'Urgencia',
  typesLoading: 'Cargando tipos de cita…',
  typesError: 'Tipos no disponibles',
  typesEmpty: 'No hay tipos de cita activos. Créalos en Ajustes → Tipos de cita.',
  releaseAt: 'Liberar a partir de (opcional)',
  releaseHint:
    'Desde esa hora de la sede, el día del hueco, se puede agendar cualquier tipo de cita. Vacío: no se libera.',
  reservedNeedsType: 'Marca al menos un tipo de cita para el hueco reservado.',
  reservedNeedsLocation: 'Un hueco reservado es de una sede: elige la sede.',
  reservedOneDay: 'Un hueco reservado tiene que caber en un solo día.',
  releaseBeforeStart: '«Liberar a partir de» tiene que ser antes de la hora de inicio.',
};

const selectClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

type Scope = 'provider' | 'location';

/** `YYYY-MM-DD` + `HH:mm` en el reloj de la sede (`timeZone`) → instante ISO; `null` con una hora inválida. */
function sedeInstant(date: string, time: string, timeZone: string): string | null {
  const minute = timeToMinutes(time);
  return minute === null ? null : wallInstant(date, minute, timeZone).toISOString();
}

function patientName(a: AffectedAppointmentsPage['items'][number]): string {
  return [a.patientFirstName, a.patientLastName].filter(Boolean).join(' ') || 'Paciente';
}

interface ScheduleBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Solo quien atiende (odontología y ADMIN): la API rechaza al resto. */
  staff: StaffMember[];
  locations: ClinicLocation[];
  /**
   * DX-378: los días y las horas del bloqueo son los del reloj de su sede; uno
   * de «todas las sedes», los de la sede de la pantalla (la activa o la
   * principal, como la API).
   */
  clock: AgendaClock;
  /** Sede activa (null = «Todas las sedes»): la propuesta para un bloqueo de sede. */
  activeLocationId: string | null;
  /** Día que se está mirando en la agenda (`YYYY-MM-DD`). */
  defaultDate: string;
  defaultProviderId?: string;
  /**
   * Odontólogo: solo bloquea su propia agenda (la API responde 403 a lo
   * demás), así que ni elige profesional ni puede bloquear la sede.
   */
  ownProviderId?: string | null;
  onCreated: (block: SavedScheduleBlock) => void;
}

/**
 * «Bloquear horario» (DX-122). Antes de crear, pregunta a la API qué citas
 * quedarían dentro: si hay, las enseña y pide confirmación explícita — un
 * bloqueo nunca borra ni mueve citas.
 */
export function ScheduleBlockDialog({
  open,
  onOpenChange,
  token,
  staff,
  locations,
  clock,
  activeLocationId,
  defaultDate,
  defaultProviderId,
  ownProviderId = null,
  onCreated,
}: ScheduleBlockDialogProps) {
  const ownOnly = ownProviderId !== null;
  const [scope, setScope] = useState<Scope>('provider');
  const [providerId, setProviderId] = useState(
    ownProviderId ??
      (staff.some((m) => m.userId === defaultProviderId) ? defaultProviderId : undefined) ??
      staff[0]?.userId ??
      '',
  );
  const [locationId, setLocationId] = useState(activeLocationId ?? locations[0]?.id ?? '');
  // Un miembro acotado a sedes no puede bloquear «todas»: la API responde 403.
  const restricted = getTokenAllowedLocationIds(token) !== null;
  const [providerLocationId, setProviderLocationId] = useState(
    restricted
      ? (locations.find((l) => l.id === activeLocationId)?.id ?? locations[0]?.id ?? '')
      : '',
  );
  const [kind, setKind] = useState<ScheduleBlockKind>('VACATION');
  const [wholeDays, setWholeDays] = useState(true);
  const [fromDate, setFromDate] = useState(defaultDate);
  const [toDate, setToDate] = useState(defaultDate);
  const [fromTime, setFromTime] = useState('13:00');
  const [toTime, setToTime] = useState('14:00');
  const [allowsBooking, setAllowsBooking] = useState(false);
  const [allowsTouched, setAllowsTouched] = useState(false);
  const [note, setNote] = useState('');
  // DX-446: tipos permitidos y liberación de un hueco reservado.
  const [types, setTypes] = useState<AppointmentType[] | null>(null);
  const [typesError, setTypesError] = useState(false);
  const [typesReload, setTypesReload] = useState(0);
  const [reservedTypeIds, setReservedTypeIds] = useState<string[]>([]);
  const [releaseAt, setReleaseAt] = useState('');
  const reserved = kind === 'RESERVED';

  useEffect(() => {
    if (!reserved || types !== null) return;
    let cancelled = false;
    listAppointmentTypes(token)
      .then((list) => {
        if (cancelled) return;
        // Urgencias primero y ya marcadas: es para lo que se reserva casi siempre.
        const sorted = [...list].sort((a, b) => Number(b.isUrgent) - Number(a.isUrgent));
        setTypes(sorted);
        setReservedTypeIds((current) =>
          current.length > 0 ? current : sorted.filter((t) => t.isUrgent).map((t) => t.id),
        );
      })
      .catch(() => {
        if (!cancelled) setTypesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reserved, types, token, typesReload]);

  function toggleType(id: string, checked: boolean) {
    setReservedTypeIds((current) => (checked ? [...current, id] : current.filter((t) => t !== id)));
  }
  const [affected, setAffected] = useState<AffectedAppointmentsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const staffName = (id: string) => staff.find((s) => s.userId === id)?.fullName ?? '';

  function changeKind(next: ScheduleBlockKind) {
    setKind(next);
    // Un almuerzo suele ser por horas y deja agendar en un apuro; unas
    // vacaciones son días enteros y no. Solo mientras la persona no lo toque.
    setWholeDays(next === 'VACATION');
    if (!allowsTouched) setAllowsBooking(next === 'LUNCH');
    if (next === 'RESERVED') {
      // Un reservado es por horas, de una sede y no deja agendar libremente.
      setAllowsBooking(false);
      setFromTime('15:00');
      setToTime('15:30');
      if (!providerLocationId) {
        setProviderLocationId(locations.find((l) => l.id === activeLocationId)?.id ?? locations[0]?.id ?? '');
      }
    }
    setAffected(null);
  }

  // La sede del bloqueo decide su reloj; sin la zona de esa sede no se calcula
  // con la de otra.
  const blockLocationId = scope === 'location' ? locationId : providerLocationId;
  const blockClock = blockLocationId ? clock.of(blockLocationId) : clock;

  function range(timeZone: string): { start: string; end: string } | null {
    if (!fromDate || !toDate) return null;
    const start = sedeInstant(fromDate, wholeDays ? '00:00' : fromTime, timeZone);
    const end = wholeDays
      ? sedeInstant(addCivilDays(toDate, 1), '00:00', timeZone)
      : sedeInstant(toDate, toTime, timeZone);
    return start && end ? { start, end } : null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!blockClock) {
      setError(SEDE_TIME_ZONE_ERROR);
      return;
    }
    const r = range(blockClock.timeZone);
    const target =
      scope === 'provider'
        ? { providerId, locationId: providerLocationId || undefined }
        : { locationId };
    if (
      !r ||
      (scope === 'provider' ? !providerId || (restricted && !providerLocationId) : !locationId)
    ) {
      setError(copy.missing);
      return;
    }
    if (new Date(r.end).getTime() <= new Date(r.start).getTime()) {
      setError(copy.backwards);
      return;
    }
    const releaseAtMinute = reserved && releaseAt ? timeToMinutes(releaseAt) : null;
    if (reserved) {
      if (!blockLocationId) {
        setError(copy.reservedNeedsLocation);
        return;
      }
      if (fromDate !== toDate) {
        setError(copy.reservedOneDay);
        return;
      }
      if (reservedTypeIds.length === 0) {
        setError(copy.reservedNeedsType);
        return;
      }
      const startMinute = timeToMinutes(fromTime);
      if (releaseAtMinute !== null && startMinute !== null && releaseAtMinute >= startMinute) {
        setError(copy.releaseBeforeStart);
        return;
      }
    }
    setSubmitting(true);
    try {
      // Primer envío: ¿hay citas dentro? Se enseñan y se pide confirmación.
      if (affected === null) {
        const found = await listAffectedAppointments(token, { ...r, ...target });
        if (found.total > 0) {
          setAffected(found);
          return;
        }
      }
      const block = await createScheduleBlock(token, {
        ...target,
        ...r,
        kind,
        allowsBooking: reserved ? false : allowsBooking,
        note: note.trim() || undefined,
        ...(reserved ? { reservedForTypeIds: reservedTypeIds, releaseAtMinute } : {}),
        confirmAffected: affected !== null && affected.total > 0,
      });
      onCreated(block);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const affectedList = affected?.items ?? [];
  /** «mar 4 mar · 9:00 a. m. – 9:30 a. m.», con el reloj de la sede de esa cita. */
  function affectedWhen(a: AffectedAppointmentsPage['items'][number]): string {
    const own = clock.of(a.locationId);
    if (!own) return sedeTimeRange(a.start, a.end, null);
    const day = civilDateLabel(wallDay(a.start, own.timeZone), { weekday: 'short', day: 'numeric', month: 'short' });
    return `${day} · ${sedeTimeRange(a.start, a.end, own)}`;
  }

  const affectedTotal = affected?.total ?? 0;
  const confirming = affectedTotal > 0;
  const noLocations = restricted && locations.length === 0;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={confirming ? copy.confirmTitle : copy.title}
      description={confirming ? copy.affected(affectedTotal) : copy.description}
      onSubmit={handleSubmit}
      submitLabel={confirming ? copy.confirmSubmit : copy.submit}
      submitting={submitting}
      submitDisabled={noLocations}
      error={error ?? (noLocations ? copy.noLocations : null)}
      size="lg"
    >
      {confirming ? (
        <ul aria-label={copy.affectedList} className="flex flex-col divide-y divide-hairline rounded-lg border border-border">
          {affectedList.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
              <span className="font-medium text-ink">{patientName(a)}</span>
              <span className="tabular-nums text-muted">
                {affectedWhen(a)} · {staffName(a.providerId)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {confirming && affectedTotal > affectedList.length ? (
        <p className="text-sm text-muted">{copy.affectedMore(affectedTotal - affectedList.length)}</p>
      ) : null}
      {confirming ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setAffected(null)}>
          {copy.back}
        </Button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {!ownOnly && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink">{copy.scope}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(['provider', 'location'] as Scope[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name="block-scope"
                      value={s}
                      checked={scope === s}
                      onChange={() => {
                        setScope(s);
                        setAffected(null);
                      }}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    {s === 'provider' ? copy.scopeProvider : copy.scopeLocation}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {scope === 'provider' ? (
            <>
              <FormField htmlFor="block-provider" label={copy.provider}>
                <select
                  id="block-provider"
                  className={selectClass}
                  value={providerId}
                  disabled={ownOnly}
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  {staff.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField htmlFor="block-provider-location" label={copy.location}>
                <select
                  id="block-provider-location"
                  className={selectClass}
                  value={providerLocationId}
                  onChange={(e) => setProviderLocationId(e.target.value)}
                >
                  {!restricted && !reserved && <option value="">{copy.allLocations}</option>}
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                {restricted && <p className="mt-1 text-xs text-muted">{copy.restrictedHint}</p>}
              </FormField>
            </>
          ) : (
            <FormField htmlFor="block-location" label={copy.location} className="sm:col-span-2">
              <select
                id="block-location"
                className={selectClass}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField htmlFor="block-kind" label={copy.kind}>
            <select
              id="block-kind"
              className={selectClass}
              value={kind}
              onChange={(e) => changeKind(e.target.value as ScheduleBlockKind)}
            >
              {SCHEDULE_BLOCK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === 'RESERVED' ? copy.reservedKind : SCHEDULE_BLOCK_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </FormField>
          {reserved ? (
            <span aria-hidden="true" />
          ) : (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={wholeDays}
                onChange={(e) => setWholeDays(e.target.checked)}
                className="size-4 accent-[var(--color-primary)]"
              />
              {copy.wholeDays}
            </label>
          )}

          <FormField htmlFor="block-from-date" label={copy.fromDate}>
            <Input
              id="block-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                if (e.target.value > toDate) setToDate(e.target.value);
              }}
            />
          </FormField>
          <FormField htmlFor="block-to-date" label={copy.toDate}>
            <Input
              id="block-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </FormField>
          {!wholeDays && (
            <>
              <FormField htmlFor="block-from-time" label={copy.fromTime}>
                <Input
                  id="block-from-time"
                  type="time"
                  step={300}
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                />
              </FormField>
              <FormField htmlFor="block-to-time" label={copy.toTime}>
                <Input
                  id="block-to-time"
                  type="time"
                  step={300}
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                />
              </FormField>
            </>
          )}

          {reserved ? (
            <>
              <fieldset className="sm:col-span-2" aria-describedby="block-reserved-types-hint">
                <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink">{copy.reservedTypes}</legend>
                <p id="block-reserved-types-hint" className="mb-2 text-xs text-muted">
                  {copy.reservedTypesHint}
                </p>
                {typesError ? (
                  <FieldError
                    label={copy.typesError}
                    className="h-10"
                    onRetry={() => {
                      setTypesError(false);
                      setTypes(null);
                      setTypesReload((k) => k + 1);
                    }}
                  />
                ) : types === null ? (
                  <p className="text-sm text-muted" aria-live="polite">
                    {copy.typesLoading}
                  </p>
                ) : types.length === 0 ? (
                  <p className="text-sm text-muted">{copy.typesEmpty}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {types.map((t) => (
                      <li key={t.id}>
                        <Checkbox
                          checked={reservedTypeIds.includes(t.id)}
                          onChange={(e) => toggleType(t.id, e.target.checked)}
                          label={
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: t.color }} />
                              <span className="min-w-0 break-words">{t.name}</span>
                              {t.isUrgent ? (
                                <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">
                                  {copy.urgentBadge}
                                </span>
                              ) : null}
                            </span>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <FormField htmlFor="block-release-at" label={copy.releaseAt} className="sm:col-span-2">
                <TimeField
                  id="block-release-at"
                  value={releaseAt || null}
                  aria-describedby="block-release-hint"
                  onChange={(value) => setReleaseAt(value ?? '')}
                />
                <p id="block-release-hint" className="mt-1 text-xs text-muted">
                  {copy.releaseHint}
                </p>
              </FormField>
            </>
          ) : (
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input
                type="checkbox"
                checked={allowsBooking}
                onChange={(e) => {
                  setAllowsBooking(e.target.checked);
                  setAllowsTouched(true);
                }}
                className="size-4 accent-[var(--color-primary)]"
              />
              {copy.allowsBooking}
            </label>
          )}

          <FormField htmlFor="block-note" label={copy.note} className="sm:col-span-2">
            <Input
              id="block-note"
              maxLength={200}
              placeholder={copy.notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </div>
      )}
    </FormModal>
  );
}
