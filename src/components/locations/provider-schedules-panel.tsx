'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import {
  getProviderSchedule,
  getRoster,
  listProviderOverrides,
  replaceProviderSchedule,
  type ProviderOverride,
  type Roster,
  type RosterLocation,
} from '@/lib/locations/provider-schedule-api';
import {
  buildSchedulePayload,
  localDateString,
  mondayOf,
  toScheduleDraft,
  type ScheduleDraft,
} from '@/lib/locations/provider-schedule';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { ProviderWeekEditor } from './provider-week-editor';
import { ProviderOverrides } from './provider-overrides';
import { StrictScheduleSetting } from './strict-schedule-setting';

const copy = {
  provider: 'Profesional',
  retry: 'Reintentar',
  loadError: 'No pudimos cargar los profesionales.',
  scheduleLoadError: 'No pudimos cargar el horario del profesional.',
  noProviders: 'No hay profesionales que atiendan pacientes',
  noProvidersHint: 'Los odontólogos y administradores activos aparecen aquí para definir su horario.',
  noLocations: 'No hay sedes activas',
  noAllowedLocations: 'No atiende en ninguna de estas sedes: asígnale sedes en su ficha de Personal.',
  unconfigured:
    'Este profesional aún no tiene horario: se le puede citar en cualquier horario de la sede.',
  weekly: 'Horario semanal',
  weeklyHint:
    'En qué sede atiende cada día y en qué tramos. Un día sin tramos en ninguna sede es libre. «Buscar hueco» y la agenda solo proponen dentro de este horario y del de la sede.',
  save: 'Guardar horario',
  saved: 'Horario guardado.',
  saveError: 'No pudimos guardar el horario. Intenta de nuevo.',
  readOnly: 'Solo un administrador puede cambiar los horarios de los profesionales.',
  strictTitle: 'Citas fuera de horario',
};

const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:max-w-xs';

function PanelSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full max-w-xs" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

interface ProviderSchedulesPanelProps {
  token: string;
  /** ADMIN: edita horario, excepciones y modo estricto. */
  canEdit: boolean;
}

/**
 * Pestaña «Profesionales» de `/settings/horarios` (DX-233): elige un
 * profesional, edita su semana (una columna por sede) y sus excepciones por
 * fecha; abajo, el modo estricto de la clínica.
 */
export function ProviderSchedulesPanel({ token, canEdit }: ProviderSchedulesPanelProps) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterKey, setRosterKey] = useState(0);
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRoster(null);
      try {
        // DX-089: `GET /staff` trae las sedes permitidas de cada profesional
        // (como las columnas de la agenda); el editor solo le ofrece esas.
        const [r, members] = await Promise.all([
          getRoster(token, { weekStart: mondayOf(localDateString(new Date())), days: 1 }),
          listStaff(token),
        ]);
        if (cancelled) return;
        setStaff(members);
        setRoster(r);
        setRosterError(null);
      } catch (err) {
        if (!cancelled) setRosterError(apiErrorMessage(err, copy.loadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, rosterKey]);

  if (rosterError) {
    return <SectionError description={rosterError} onRetry={() => setRosterKey((k) => k + 1)} retryLabel={copy.retry} />;
  }
  if (!roster) return <PanelSkeleton />;
  if (roster.providers.length === 0) {
    return <EmptyState role="status" title={copy.noProviders} description={copy.noProvidersHint} />;
  }
  if (roster.locations.length === 0) return <EmptyState role="status" title={copy.noLocations} />;

  const selected = roster.providers.find((p) => p.providerId === providerId) ?? roster.providers[0];
  const allowed = staff.find((m) => m.userId === selected.providerId)?.locationIds ?? null;
  const providerLocations =
    allowed === null ? roster.locations : roster.locations.filter((l) => allowed.includes(l.id));

  return (
    <div className="flex flex-col gap-8">
      <FormField htmlFor="provider-schedule-provider" label={copy.provider}>
        <select
          id="provider-schedule-provider"
          className={fieldClass}
          value={selected.providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          {roster.providers.map((p) => (
            <option key={p.providerId} value={p.providerId}>
              {p.fullName}
            </option>
          ))}
        </select>
      </FormField>

      {providerLocations.length === 0 ? (
        <EmptyState role="status" title={copy.noAllowedLocations} />
      ) : (
        <ProviderScheduleDetail
          key={selected.providerId}
          token={token}
          providerId={selected.providerId}
          locations={providerLocations}
          canEdit={canEdit}
        />
      )}

      <section aria-labelledby="strict-schedule-title" className="flex flex-col gap-2 border-t border-border pt-6">
        <h3 id="strict-schedule-title" className="text-base font-semibold text-ink">
          {copy.strictTitle}
        </h3>
        <StrictScheduleSetting token={token} canEdit={canEdit} />
      </section>
    </div>
  );
}

function ProviderScheduleDetail({
  token,
  providerId,
  locations,
  canEdit,
}: {
  token: string;
  providerId: string;
  /** Las sedes en las que se le puede poner horario (DX-089). */
  locations: RosterLocation[];
  canEdit: boolean;
}) {
  // Por los ids: el padre filtra las sedes en cada render (array nuevo) y la
  // carga no debe repetirse por eso.
  const idsKey = locations.map((l) => l.id).join(',');
  const locationIds = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  const locationNames = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l.name])), [locations]);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [configured, setConfigured] = useState(false);
  const [overrides, setOverrides] = useState<ProviderOverride[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDraft(null);
      try {
        const [schedule, list] = await Promise.all([
          getProviderSchedule(token, providerId),
          listProviderOverrides(token, providerId),
        ]);
        if (cancelled) return;
        setDraft(toScheduleDraft(schedule, locationIds));
        setConfigured(schedule.configured);
        setOverrides(list);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.scheduleLoadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, providerId, locationIds, reloadKey]);

  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} retryLabel={copy.retry} />;
  }
  if (!draft) return <PanelSkeleton />;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    setSaved(false);
    const result = buildSchedulePayload(draft, locationNames);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await replaceProviderSchedule(token, providerId, result.payload);
      setDraft(toScheduleDraft(updated, locationIds));
      setConfigured(updated.configured);
      setSaved(true);
      toast.success(copy.saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={save} aria-labelledby="provider-weekly-title" className="flex flex-col gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h3 id="provider-weekly-title" className="text-base font-semibold text-ink">
            {copy.weekly}
          </h3>
          <p className="text-sm text-muted">{copy.weeklyHint}</p>
        </div>
        {!configured ? (
          <p role="status" className="rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-sm text-ink">
            {copy.unconfigured}
          </p>
        ) : null}
        {!canEdit ? <p className="text-xs text-muted">{copy.readOnly}</p> : null}
        <ProviderWeekEditor
          draft={draft}
          locations={locations}
          canEdit={canEdit}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
            setSaveError(null);
          }}
        />
        {saveError ? <InlineError>{saveError}</InlineError> : null}
        {saved && !saveError ? (
          <p role="status" className="text-sm font-medium text-success">
            {copy.saved}
          </p>
        ) : null}
        {canEdit ? (
          <Button type="submit" loading={saving} className="w-full sm:w-auto sm:self-start">
            {copy.save}
          </Button>
        ) : null}
      </form>

      <ProviderOverrides
        token={token}
        providerId={providerId}
        locations={locations}
        overrides={overrides}
        canEdit={canEdit}
        onChange={setOverrides}
      />
    </div>
  );
}
