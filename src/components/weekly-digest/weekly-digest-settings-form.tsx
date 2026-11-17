'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getWeeklyDigestSettings,
  updateWeeklyDigestSettings,
  type WeeklyDigestSettings,
} from '@/lib/clinic/weekly-digest-api';
import { weekdayName, type RegionalFormat } from '@/lib/format/regional-format';
import { pickSedeFormat } from '@/lib/locations/use-sede-format';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { SectionError } from '@/components/errors/section-error';
import { FormField } from '@/components/shared/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Callout } from '@/components/ui/callout';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRows } from '@/components/settings/settings-page';
import { cn } from '@/lib/utils';

/** La semana del resumen va de lunes a domingo: el selector empieza por el lunes. */
export const WEEKLY_DIGEST_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKLY_DIGEST_HOURS = Array.from({ length: 24 }, (_, h) => h);

export const weeklyDigestSettingsCopy = {
  enabledLabel: 'Enviar el resumen semanal',
  enabledHint:
    'Cobrado, producido, citas atendidas, inasistencias, pacientes nuevos, presupuestos, saldo vencido y cajas sin cerrar de cada sede, frente a la semana anterior. Solo cifras: ningún dato de pacientes.',
  weekdayLabel: 'Día',
  hourLabel: 'Hora',
  recipientsLegend: 'Destinatarios',
  recipientsHint: 'Solo pueden recibirlo los administradores activos de la clínica.',
  noCandidates: 'No hay administradores activos con quien compartirlo.',
  unverified: 'Sin verificar: no lo recibirá hasta confirmar su correo.',
  noRecipients: 'Está activado pero sin destinatarios: no saldrá ningún resumen hasta que elijas al menos uno.',
  when: (weekday: string, at: string, sede: string) =>
    `Llega cada ${weekday} ${at}, hora de ${sede}, con las cifras de la semana anterior completa (de lunes a domingo).`,
  whenNoSede: (weekday: string) =>
    `Llega cada ${weekday} a la hora elegida en la zona de la sede principal, con las cifras de la semana anterior completa (de lunes a domingo).`,
  sedeName: (name: string, timeZone: string) => `${name} (${timeZone})`,
  save: 'Guardar',
  saved: 'Resumen semanal guardado.',
  loadError: 'No pudimos cargar el resumen semanal.',
  saveError: 'No pudimos guardar el resumen semanal. Intenta de nuevo.',
  loading: 'Cargando',
};

const copy = weeklyDigestSettingsCopy;

interface DigestDraft {
  enabled: boolean;
  weekday: number;
  hour: number;
  /** Ordenados: el orden de las casillas no es un cambio. */
  recipients: string[];
}

const EMPTY_DRAFT: DigestDraft = { enabled: false, weekday: 1, hour: 7, recipients: [] };

function toDraft(settings: WeeklyDigestSettings): DigestDraft {
  return {
    enabled: settings.enabled,
    weekday: settings.weekday,
    hour: settings.hour,
    recipients: [...settings.recipientMembershipIds].sort(),
  };
}

function sameDraft(a: DigestDraft, b: DigestDraft): boolean {
  return (
    a.enabled === b.enabled &&
    a.weekday === b.weekday &&
    a.hour === b.hour &&
    a.recipients.length === b.recipients.length &&
    a.recipients.every((id, i) => id === b.recipients[i])
  );
}

/** La hora en el reloj de la sede principal (12/24 h); sin su formato, «7 h». */
export function digestHourLabel(hour: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.clock(hour, 0) : `${hour} h`;
}

/** «a las 7:00 a. m.», pero «a la 1:00 p. m.». */
function atHour(label: string): string {
  return /^1(?!\d)/.test(label) ? `a la ${label}` : `a las ${label}`;
}

/**
 * Ajustes › Resumen semanal (DX-568): activarlo, el día y la hora (en la zona
 * de la sede principal) y qué administradores lo reciben. Solo ADMIN: la
 * página decide el permiso y no monta esto sin él.
 */
export function WeeklyDigestSettingsForm({ token }: { token: string }) {
  const [settings, setSettings] = useState<WeeklyDigestSettings | null>(null);
  const saved = useMemo(() => (settings ? toDraft(settings) : EMPTY_DRAFT), [settings]);
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved, sameDraft);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const locations = useLocationsState(token);
  const id = useId();
  const formId = `${id}-form`;
  const weekdayId = `${id}-weekday`;
  const hourId = `${id}-hour`;
  const recipientsHintId = `${id}-recipients-hint`;

  useEffect(() => {
    let cancelled = false;
    getWeeklyDigestSettings(token)
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  if (loadError) {
    return (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!settings) {
    return (
      <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-56" />
        <Skeleton className="mt-4 h-4 w-40" />
      </div>
    );
  }

  // La zona y el reloj son los de la sede principal (la activa más antigua),
  // como el envío: nunca los del navegador.
  const principal = locations.status === 'ready' ? locations.locations.find((l) => l.isActive) : undefined;
  const fmt = locations.status === 'ready' ? pickSedeFormat(locations.locations, null) : null;
  const weekday = weekdayName(draft.weekday);
  const when =
    principal?.timeZone && fmt
      ? copy.when(weekday, atHour(digestHourLabel(draft.hour, fmt)), copy.sedeName(principal.name, principal.timeZone))
      : copy.whenNoSede(weekday);

  function edit(patch: Partial<DigestDraft>) {
    update(patch);
    setNotice('');
    setSaveError(null);
  }

  function toggleRecipient(membershipId: string, checked: boolean) {
    const next = new Set(draft.recipients);
    if (checked) next.add(membershipId);
    else next.delete(membershipId);
    edit({ recipients: [...next].sort() });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setNotice('');
    setSaving(true);
    try {
      const next = await updateWeeklyDigestSettings(token, {
        enabled: draft.enabled,
        weekday: draft.weekday,
        hour: draft.hour,
        recipientMembershipIds: draft.recipients,
      });
      commit(toDraft(next));
      setSettings(next);
      setNotice(copy.saved);
    } catch (err) {
      // El 400 de la API (p. ej. alguien dejó de ser administrador) ya viene en español.
      setSaveError(apiErrorMessage(err, copy.saveError));
      if (err instanceof ApiError && err.status === 400) setReloadKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  }

  const noRecipients = draft.enabled && draft.recipients.length === 0;

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <SettingRows>
        <div className="px-4 py-4 sm:px-6">
          <Checkbox
            label={copy.enabledLabel}
            description={copy.enabledHint}
            checked={draft.enabled}
            disabled={saving}
            onChange={(e) => edit({ enabled: e.target.checked })}
          />
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField htmlFor={weekdayId} label={copy.weekdayLabel}>
              <NativeSelect
                id={weekdayId}
                value={String(draft.weekday)}
                disabled={saving}
                onChange={(e) => edit({ weekday: Number(e.target.value) })}
              >
                {WEEKLY_DIGEST_WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {capitalize(weekdayName(day))}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField htmlFor={hourId} label={copy.hourLabel}>
              <NativeSelect
                id={hourId}
                value={String(draft.hour)}
                disabled={saving}
                onChange={(e) => edit({ hour: Number(e.target.value) })}
                selectClassName="t-data"
              >
                {WEEKLY_DIGEST_HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {digestHourLabel(hour, fmt)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <p className="text-sm text-muted" data-testid="weekly-digest-when">
            {when}
          </p>
        </div>
        <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 px-4 py-4 sm:px-6" aria-describedby={recipientsHintId}>
          <legend className="float-left mb-1 p-0 text-sm font-medium text-ink">{copy.recipientsLegend}</legend>
          <p id={recipientsHintId} className="clear-left text-sm text-muted">
            {copy.recipientsHint}
          </p>
          {settings.candidates.length === 0 ? (
            <p className="text-sm text-muted">{copy.noCandidates}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {settings.candidates.map((candidate) => (
                <li key={candidate.membershipId} className="min-w-0">
                  <Checkbox
                    label={candidate.name}
                    description={
                      <span className="flex flex-col">
                        <span className="break-all">{candidate.email}</span>
                        {candidate.verified ? null : <span className="text-warning-text">{copy.unverified}</span>}
                      </span>
                    }
                    checked={draft.recipients.includes(candidate.membershipId)}
                    disabled={saving}
                    onChange={(e) => toggleRecipient(candidate.membershipId, e.target.checked)}
                  />
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </SettingRows>
      {noRecipients ? (
        <Callout tone="warning" data-testid="weekly-digest-no-recipients">
          {copy.noRecipients}
        </Callout>
      ) : null}
      <p
        ref={noticeRef}
        role="status"
        tabIndex={-1}
        className={cn(
          notice ? 'text-sm text-success-text' : 'sr-only',
          'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
        )}
      >
        {notice}
      </p>
      <SaveBar
        dirty={dirty}
        saving={saving}
        form={formId}
        savedFocusTo={noticeRef}
        error={saveError}
        saveLabel={copy.save}
        onDiscard={() => {
          discard();
          setSaveError(null);
        }}
      />
    </form>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
