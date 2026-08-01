'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getLocationSchedule,
  replaceLocationSchedule,
  timeToMinutes,
  minutesToTime,
  WEEKDAY_LABELS,
  type BusinessHours,
} from '@/lib/locations/schedule-api';
import { onLocationChange } from '@/lib/locations/location-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/molecules/form-field';
import { AsyncSection } from '@/components/molecules/async-section';
import { Skeleton } from '@/components/ui/skeleton';

// Copy as constants (i18n-ready, es-first), igual que el resto de la app.
const copy = {
  timezoneLabel: 'Zona horaria',
  timezoneHint:
    'Zona de la sede (IANA). Se usa para decidir si una cita cae dentro del horario.',
  openLabel: 'Abierto',
  closedLabel: 'Cerrado',
  addRange: 'Agregar tramo',
  removeRange: 'Quitar tramo',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  save: 'Guardar horario',
  saved: 'Horario guardado.',
  unconfiguredNotice:
    'Esta sede no tiene horario configurado, así que hoy se puede agendar a cualquier hora. Define los tramos y guarda para empezar a restringir.',
  retry: 'Reintentar',
  genericLoadError: 'No pudimos cargar el horario. Intenta de nuevo.',
  genericSaveError: 'No pudimos guardar el horario. Intenta de nuevo.',
  invalidRange: 'Cada tramo debe tener una hora de fin posterior a la de inicio.',
  overlapping: 'Hay tramos solapados en el mismo día; únelos en uno.',
  emptyTimezone: 'Indica la zona horaria de la sede.',
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
  const [week, setWeek] = useState<DraftWeek>(EMPTY_WEEK);
  const [timezone, setTimezone] = useState('America/Bogota');
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
        setWeek(toDraft(hours));
        setTimezone(hours?.timezone ?? 'America/Bogota');
        setHadSchedule(hours !== null && hours.ranges.length > 0);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
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
  function buildPayload(): BusinessHours | string {
    if (timezone.trim() === '') return copy.emptyTimezone;
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
    return { timezone: timezone.trim(), ranges };
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
      setWeek(toDraft(updated));
      setTimezone(updated.timezone);
      setHadSchedule(updated.ranges.length > 0);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : copy.genericSaveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AsyncSection
      loading={loading}
      error={loadError}
      onRetry={() => setReloadKey((k) => k + 1)}
      retryLabel={copy.retry}
      skeleton={<Skeleton className="h-64 w-full rounded-xl" />}
    >
      <form onSubmit={handleSubmit} aria-label={copy.save} className="flex flex-col gap-6">
        {!hadSchedule && (
          <p role="status" className="text-sm text-muted">
            {copy.unconfiguredNotice}
          </p>
        )}

        <FormField htmlFor="schedule-timezone" label={copy.timezoneLabel} hint={copy.timezoneHint}>
          <Input
            id="schedule-timezone"
            type="text"
            required
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setSaved(false);
            }}
            className="max-w-xs"
          />
        </FormField>

        <div className="flex flex-col gap-3">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const ranges = week[weekday];
            const isOpen = ranges.length > 0;
            return (
              <Card key={weekday} className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{label}</span>
                  <label className="inline-flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={isOpen}
                      onChange={() => toggleDay(weekday)}
                      aria-label={`${copy.openLabel} ${label}`}
                    />
                    {isOpen ? copy.openLabel : copy.closedLabel}
                  </label>
                </div>

                {isOpen && (
                  <div className="flex flex-col gap-2">
                    {ranges.map((range, index) => (
                      <div key={index} className="flex flex-wrap items-end gap-2">
                        <FormField
                          htmlFor={`day-${weekday}-range-${index}-start`}
                          label={copy.fromLabel}
                        >
                          <Input
                            id={`day-${weekday}-range-${index}-start`}
                            type="time"
                            required
                            value={range.start}
                            onChange={(e) => editRange(weekday, index, { start: e.target.value })}
                            className="w-32 tabular-nums"
                          />
                        </FormField>
                        <FormField
                          htmlFor={`day-${weekday}-range-${index}-end`}
                          label={copy.toLabel}
                        >
                          <Input
                            id={`day-${weekday}-range-${index}-end`}
                            type="time"
                            required
                            value={range.end}
                            onChange={(e) => editRange(weekday, index, { end: e.target.value })}
                            className="w-32 tabular-nums"
                          />
                        </FormField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRange(weekday, index)}
                          aria-label={`${copy.removeRange} ${label} ${index + 1}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => addRange(weekday)}
                    >
                      <Plus className="size-3.5" /> {copy.addRange}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {saveError && (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        )}
        {saved && !saveError && (
          <p role="status" className="text-sm font-medium text-primary">
            {copy.saved}
          </p>
        )}

        <Button type="submit" loading={saving} className="self-start">
          {copy.save}
        </Button>
      </form>
    </AsyncSection>
  );
}
