'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getLocationSchedule,
  replaceLocationSchedule,
  timeToMinutes,
  minutesToTime,
  WEEKDAY_LABELS,
  type BusinessHours,
  type BusinessHoursInput,
} from '@/lib/locations/schedule-api';
import { onLocationChange } from '@/lib/locations/location-store';
import { readyTimeZone, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { timeZoneLabel } from '@/lib/locations/regional-options';
import { getTokenRole } from '@/lib/auth/token-role';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TimeField } from '@/components/ui/date-field';
import { useDateLocale } from '@/components/ui/date-locale';
import { AsyncSection } from '@/components/shared/async-section';
import { Skeleton } from '@/components/ui/skeleton';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { weekOrder } from './week-order';

// Copy as constants (i18n-ready, es-first), igual que el resto de la app.
const copy = {
  // G1 (spec §6.5): la zona es un dato de la sede; aquí solo se muestra.
  timezoneLabel: 'Zona horaria',
  timezoneLoading: '…',
  timezoneWhere: 'Se cambia en',
  timezoneLink: 'Ajustes → Sedes',
  editing: (name: string) => `Editando: ${name}`,
  weekLabel: 'Horario de la semana',
  openLabel: 'Abierto',
  closedLabel: 'Cerrado',
  addRange: 'Agregar tramo',
  removeRange: 'Quitar tramo',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  rangeFrom: (day: string, n: number) => `${day}, tramo ${n}: desde`,
  rangeTo: (day: string, n: number) => `${day}, tramo ${n}: hasta`,
  save: 'Guardar horario',
  saved: 'Horario guardado.',
  unconfiguredNotice:
    'Esta sede no tiene horario configurado, así que hoy se puede agendar a cualquier hora. Define los tramos y guarda para empezar a restringir.',
  retry: 'Reintentar',
  // Sin "Intenta de nuevo." — alimenta AsyncSection -> SectionError, que trae su propio botón.
  genericLoadError: 'No pudimos cargar el horario.',
  genericSaveError: 'No pudimos guardar el horario. Intenta de nuevo.',
  invalidRange: 'Cada tramo debe tener una hora de fin posterior a la de inicio.',
  overlapping: 'Hay tramos solapados en el mismo día; únelos en uno.',
};

/** Tramo en edición: horas como texto `HH:MM`, que es lo que usan los inputs. */
interface DraftRange {
  start: string;
  end: string;
}

/** Los 7 días, cada uno con sus tramos. Sin tramos = cerrado. */
type DraftWeek = DraftRange[][];

const EMPTY_WEEK: DraftWeek = [[], [], [], [], [], [], []];

/** Tramo por defecto al abrir un día: una jornada de mañana razonable. */
const DEFAULT_RANGE: DraftRange = { start: '09:00', end: '13:00' };

function toDraft(hours: BusinessHours | null): DraftWeek {
  const week: DraftWeek = [[], [], [], [], [], [], []];
  if (!hours) return week;
  for (const r of hours.ranges) {
    if (r.weekday < 0 || r.weekday > 6) continue;
    week[r.weekday].push({
      start: minutesToTime(r.startMinute),
      end: minutesToTime(r.endMinute),
    });
  }
  for (const day of week) day.sort((a, b) => a.start.localeCompare(b.start));
  return week;
}

interface BusinessHoursFormProps {
  token: string;
}

/**
 * Configura el horario de atención de la sede ACTIVA (el cliente ya envía
 * `X-Location-Id`, así que cambiar de sede en el switcher recarga este horario).
 *
 * Semántica de guardado: se envía la semana COMPLETA (`PUT`), no parches por día
 * — es lo que hace atómico "así queda mi semana". Un día sin tramos viaja como
 * cerrado; la semana entera vacía deja la sede sin restricción.
 */
export function BusinessHoursForm({ token }: BusinessHoursFormProps) {
  // Lo guardado (lo que dio la API) y el borrador: la barra «Cambios sin
  // guardar» aparece solo cuando difieren (DESIGN.md → Settings pages).
  const [savedWeek, setSavedWeek] = useState<DraftWeek>(EMPTY_WEEK);
  const { draft: week, setDraft: setWeek, dirty, discard, commit } = useSettingsDraft(savedWeek);
  const { locale } = useDateLocale();
  const order = weekOrder(locale);
  // Qué sede se está editando: la activa; en «Todas las sedes», la principal
  // (la misma regla que la API y que `pickSedeTimeZone`).
  const locationsState = useLocationsState(token);
  const editingSede =
    locationsState.status === 'ready'
      ? ((locationsState.activeLocationId
          ? locationsState.locations.find((l) => l.id === locationsState.activeLocationId)
          : undefined) ?? locationsState.locations.find((l) => l.isActive))
      : undefined;
  // Zona del horario que dio la API (= la de la sede); sin horario, la de la
  // sede leída de la lista de sedes. Nunca una zona de reserva.
  const [scheduleZone, setScheduleZone] = useState<string | null>(null);
  const sedeZone = useSedeTimeZone(token);
  const timezone = scheduleZone ?? readyTimeZone(sedeZone);
  // Sin zona en el horario ni en la sede (sin configurar o la lista no cargó):
  // el error de la sede con su reintento, nunca otra zona.
  const zoneError = timezone === null && sedeZone.status === 'error' ? sedeZone : null;
  const isAdmin = getTokenRole(token) === 'ADMIN';
  const [hadSchedule, setHadSchedule] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Recarga al cambiar de sede: el horario es POR sede, así que mostrar el de la
  // anterior sería engañoso (y guardar, destructivo).
  useEffect(() => onLocationChange(() => setReloadKey((k) => k + 1)), []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const hours = await getLocationSchedule(token);
        if (cancelled) return;
        // Otra sede: lo de antes no se arrastra.
        const next = toDraft(hours);
        setSavedWeek(next);
        setWeek(next);
        setScheduleZone(hours?.timezone ?? null);
        setHadSchedule(hours !== null && hours.ranges.length > 0);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, copy.genericLoadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  function updateDay(weekday: number, ranges: DraftRange[]) {
    setSaved(false);
    setSaveError(null);
    setWeek((prev) => prev.map((day, i) => (i === weekday ? ranges : day)));
  }

  function toggleDay(weekday: number) {
    const isOpen = week[weekday].length > 0;
    updateDay(weekday, isOpen ? [] : [{ ...DEFAULT_RANGE }]);
  }

  function addRange(weekday: number) {
    updateDay(weekday, [...week[weekday], { ...DEFAULT_RANGE }]);
  }

  function removeRange(weekday: number, index: number) {
    updateDay(
      weekday,
      week[weekday].filter((_, i) => i !== index),
    );
  }

  function editRange(weekday: number, index: number, patch: Partial<DraftRange>) {
    updateDay(
      weekday,
      week[weekday].map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  /** Valida y arma el payload, o devuelve el mensaje de error. */
  function buildPayload(): BusinessHoursInput | string {
    const ranges = [];
    for (let weekday = 0; weekday <= 6; weekday++) {
      const day = week[weekday]
        .map((r) => ({
          startMinute: timeToMinutes(r.start),
          endMinute: timeToMinutes(r.end),
        }))
        .filter(
          (r): r is { startMinute: number; endMinute: number } =>
            r.startMinute !== null && r.endMinute !== null,
        );
      if (day.length !== week[weekday].length) return copy.invalidRange;
      if (day.some((r) => r.endMinute <= r.startMinute)) return copy.invalidRange;
      // Mismo criterio medio-abierto que el backend: contiguo no es solape.
      const sorted = [...day].sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startMinute < sorted[i - 1].endMinute) return copy.overlapping;
      }
      ranges.push(...sorted.map((r) => ({ weekday, ...r })));
    }
    return { ranges };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    const payload = buildPayload();
    if (typeof payload === 'string') {
      setSaveError(payload);
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await replaceLocationSchedule(token, payload);
      const next = toDraft(updated);
      setSavedWeek(next);
      commit(next);
      setScheduleZone(updated.timezone);
      setHadSchedule(updated.ranges.length > 0);
      setSaved(true);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.genericSaveError));
    } finally {
      setSaving(false);
    }
  }

  const zoneText = timezone ? timeZoneLabel(timezone) : copy.timezoneLoading;

  return (
    <AsyncSection
      loading={loading}
      error={loadError}
      onRetry={() => setReloadKey((k) => k + 1)}
      retryLabel={copy.retry}
      skeleton={<Skeleton className="h-64 w-full rounded-xl" />}
    >
      <form onSubmit={handleSubmit} aria-label={copy.save} id="business-hours-form" noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm text-muted">
          {editingSede ? <p className="font-medium text-ink">{copy.editing(editingSede.name)}</p> : null}
          <p>
            {copy.timezoneLabel}:{' '}
            {zoneError ? null : <span className="font-medium text-ink">{zoneText}</span>}
            {' · '}
            {copy.timezoneWhere}{' '}
            {isAdmin ? (
              <Link
                href="/settings/sedes"
                className="whitespace-nowrap font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
              >
                {copy.timezoneLink}
              </Link>
            ) : (
              copy.timezoneLink
            )}
          </p>
        </div>
        {zoneError ? (
          <SedeConfigError kind="timeZone" variant="field" onRetry={zoneError.retry} className="max-w-xs" />
        ) : null}
        {!hadSchedule && (
          <p role="status" className="max-w-[68ch] text-sm text-muted">
            {copy.unconfiguredNotice}
          </p>
        )}

        {/* Una fila por día en una sola tarjeta (antes, 7 tarjetas a todo el
            ancho): la semana entera cabe en una pantalla de escritorio. El
            orden sigue el formato regional de la sede. */}
        <ul
          aria-label={copy.weekLabel}
          className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface"
        >
          {order.map((weekday) => {
            const label = WEEKDAY_LABELS[weekday];
            const ranges = week[weekday];
            const isOpen = ranges.length > 0;
            return (
              <li
                key={weekday}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-6"
              >
                <div className="flex min-h-10 items-center justify-between gap-3 sm:w-44 sm:shrink-0">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="text-sm text-muted">
                      {isOpen ? copy.openLabel : copy.closedLabel}
                    </span>
                    {/* Siempre «Abierto»: el nombre no cambia con el estado. */}
                    <Switch
                      checked={isOpen}
                      onChange={() => toggleDay(weekday)}
                      aria-label={`${copy.openLabel} ${label}`}
                    />
                  </span>
                </div>

                {isOpen ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {ranges.map((range, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <TimeField
                          id={`day-${weekday}-range-${index}-start`}
                          value={range.start || null}
                          onChange={(v) => editRange(weekday, index, { start: v ?? '' })}
                          aria-label={copy.rangeFrom(label, index + 1)}
                          required
                          className="w-32"
                        />
                        <span aria-hidden className="text-muted">
                          –
                        </span>
                        <TimeField
                          id={`day-${weekday}-range-${index}-end`}
                          value={range.end || null}
                          onChange={(v) => editRange(weekday, index, { end: v ?? '' })}
                          aria-label={copy.rangeTo(label, index + 1)}
                          required
                          className="w-32"
                        />
                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="icon-sm"
                          onClick={() => removeRange(weekday, index)}
                          aria-label={`${copy.removeRange} ${label} ${index + 1}`}
                          title={`${copy.removeRange} ${index + 1}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => addRange(weekday)}
                      aria-label={`${copy.addRange} ${label}`}
                    >
                      <Plus aria-hidden /> {copy.addRange}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {saved && !dirty && !saveError ? (
          <p role="status" className="text-sm font-medium text-success-text">
            {copy.saved}
          </p>
        ) : null}

        <SaveBar
          dirty={dirty}
          saving={saving}
          form="business-hours-form"
          error={saveError}
          saveLabel={copy.save}
          onDiscard={() => {
            discard();
            setSaveError(null);
          }}
        />
      </form>
    </AsyncSection>
  );
}
