'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { ExternalLink } from '@/components/shared/external-link';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import {
  getOnlineBookingSettings,
  listOnlineTypes,
  ONLINE_ADVANCE_MAX_DAYS,
  ONLINE_DURATION_MAX,
  ONLINE_DURATION_MIN,
  ONLINE_LEAD_MAX_MINUTES,
  ONLINE_STEP_MAX,
  ONLINE_STEP_MIN,
  PUBLIC_BOOKING_PATH,
  saveOnlineBookingSettings,
  saveOnlineType,
  type OnlineBookingMode,
  type OnlineBookingSettings,
  type OnlineBookingSettingsInput,
  type OnlineType,
} from '@/lib/online-booking/online-booking-api';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRows, SettingsSection } from '@/components/settings/settings-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export const onlineBookingSettingsCopy = {
  pageSection: 'Página pública',
  pageSectionHint: 'El enlace que la clínica comparte con sus pacientes (web, redes, WhatsApp).',
  urlLabel: 'Dirección de la página',
  copyUrl: 'Copiar el enlace',
  copied: 'Enlace copiado.',
  copyFailed: 'No se pudo copiar. Selecciona el enlace y cópialo a mano.',
  openUrl: 'Abrir la página',
  statusOn: 'Activa',
  statusOff: 'Desactivada',
  offHint: 'Mientras está desactivada, la página dice que la reserva online no está disponible.',
  generalSection: 'Cómo se reserva',
  generalSectionHint: 'Quién puede reservar, con cuánta antelación y cada cuánto empiezan los huecos.',
  enabled: 'Reserva online activada',
  enabledHint: 'Los pacientes pueden pedir cita desde la página pública.',
  newMode: 'Pacientes nuevos',
  existingMode: 'Pacientes que ya tienen ficha',
  modeRequest: 'Solicitud',
  modeRequestHint: 'Recepción la revisa en «Solicitudes online» y la acepta o la rechaza.',
  modeDirect: 'Reserva directa',
  modeDirectHint: 'La cita queda en la agenda al momento, con la marca «Online».',
  leadNew: 'Antelación mínima · nuevos (minutos)',
  leadExisting: 'Antelación mínima · con ficha (minutos)',
  leadHint: '120 = no se ofrecen horas que empiecen en menos de 2 horas.',
  advance: 'Antelación máxima (días)',
  advanceHint: 'Hasta cuántos días adelante se ofrecen horas.',
  step: 'Los huecos empiezan cada',
  stepOption: (n: number) => `${n} minutos`,
  leadInvalid: `Escribe un número entero de minutos entre 0 y ${ONLINE_LEAD_MAX_MINUTES} (7 días).`,
  advanceInvalid: `Escribe un número entero de días entre 1 y ${ONLINE_ADVANCE_MAX_DAYS}.`,
  leadBeyondAdvance: 'La antelación mínima no puede ser mayor que la máxima: no quedaría ningún hueco.',
  saved: 'Ajustes de la reserva online guardados.',
  saveError: 'No pudimos guardar los ajustes. Intenta de nuevo.',
  readOnly: 'Lo cambia administración.',
  loadError: 'No pudimos cargar los ajustes de la reserva online.',
  typesSection: 'Tratamientos que se reservan online',
  typesSectionHint:
    'Los tipos de cita del catálogo. Solo los visibles se ofrecen; duración vacía = la del tipo, sin profesionales ni sedes = todos.',
  typesLabel: 'Tipos de cita y su configuración online',
  typesEmpty: 'La clínica no tiene tipos de cita. Créalos en Ajustes › Tipos de cita.',
  colType: 'Tipo de cita',
  colVisible: 'Visible online',
  colDuration: 'Duración (nuevo · con ficha)',
  colProviders: 'Profesionales',
  colLocations: 'Sedes',
  inactive: 'Inactivo en el catálogo',
  all: 'Todos',
  allLocations: 'Todas',
  minutes: (n: number) => `${n} min`,
  visibleLabel: (name: string) => `Ofrecer «${name}» online`,
  configure: 'Configurar',
  typeSaved: (name: string) => `«${name}» guardado.`,
  typeSaveError: 'No pudimos guardar el tipo de cita.',
  dialogTitle: (name: string) => `«${name}» en la reserva online`,
  dialogDescription: 'Duración y quién lo atiende cuando se reserva por internet. El cambio queda en la auditoría.',
  durationNew: 'Duración para pacientes nuevos (minutos)',
  durationExisting: 'Duración para pacientes con ficha (minutos)',
  durationHint: (n: number) => `Vacío = la del tipo (${n} min).`,
  durationInvalid: `Escribe un múltiplo de 5 entre ${ONLINE_DURATION_MIN} y ${ONLINE_DURATION_MAX}, o déjalo vacío.`,
  providersLegend: 'Profesionales',
  providersHint: 'Sin marcar ninguno: todos los que atienden en la sede.',
  locationsLegend: 'Sedes',
  locationsHint: 'Sin marcar ninguna: todas las sedes.',
  staffError: 'No pudimos cargar el personal.',
  save: 'Guardar',
};
const copy = onlineBookingSettingsCopy;

interface GeneralDraft {
  enabled: boolean;
  newPatientMode: OnlineBookingMode;
  existingPatientMode: OnlineBookingMode;
  minLeadMinutesNew: string;
  minLeadMinutesExisting: string;
  maxAdvanceDays: string;
  slotStepMinutes: number;
}

const toDraft = (s: OnlineBookingSettings): GeneralDraft => ({
  enabled: s.enabled,
  newPatientMode: s.newPatientMode,
  existingPatientMode: s.existingPatientMode,
  minLeadMinutesNew: String(s.minLeadMinutesNew),
  minLeadMinutesExisting: String(s.minLeadMinutesExisting),
  maxAdvanceDays: String(s.maxAdvanceDays),
  slotStepMinutes: s.slotStepMinutes,
});

const EMPTY_DRAFT: GeneralDraft = {
  enabled: false,
  newPatientMode: 'REQUEST',
  existingPatientMode: 'REQUEST',
  minLeadMinutesNew: '120',
  minLeadMinutesExisting: '120',
  maxAdvanceDays: '60',
  slotStepMinutes: 15,
};

/** Un entero tecleado dentro de [min, max], o `null`. */
export function parseWhole(text: string, min: number, max: number): number | null {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** Duración: vacío = la del tipo (`null`); si no, múltiplo de 5 en [5, 480]. `undefined` = no válida. */
export function parseDuration(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const n = parseWhole(text, ONLINE_DURATION_MIN, ONLINE_DURATION_MAX);
  return n !== null && n % 5 === 0 ? n : undefined;
}

type GeneralErrors = Partial<Record<'minLeadMinutesNew' | 'minLeadMinutesExisting' | 'maxAdvanceDays', string>>;

/** Valida el borrador como la API; devuelve el cuerpo del PUT o los errores por campo. */
export function validateGeneral(d: GeneralDraft): { input: OnlineBookingSettingsInput } | { errors: GeneralErrors } {
  const errors: GeneralErrors = {};
  const leadNew = parseWhole(d.minLeadMinutesNew, 0, ONLINE_LEAD_MAX_MINUTES);
  const leadExisting = parseWhole(d.minLeadMinutesExisting, 0, ONLINE_LEAD_MAX_MINUTES);
  const advance = parseWhole(d.maxAdvanceDays, 1, ONLINE_ADVANCE_MAX_DAYS);
  if (leadNew === null) errors.minLeadMinutesNew = copy.leadInvalid;
  if (leadExisting === null) errors.minLeadMinutesExisting = copy.leadInvalid;
  if (advance === null) errors.maxAdvanceDays = copy.advanceInvalid;
  if (leadNew !== null && leadExisting !== null && advance !== null) {
    const limit = advance * 24 * 60;
    if (leadNew > limit) errors.minLeadMinutesNew = copy.leadBeyondAdvance;
    if (leadExisting > limit) errors.minLeadMinutesExisting = copy.leadBeyondAdvance;
  }
  if (Object.keys(errors).length > 0) return { errors };
  return {
    input: {
      enabled: d.enabled,
      newPatientMode: d.newPatientMode,
      existingPatientMode: d.existingPatientMode,
      minLeadMinutesNew: leadNew!,
      minLeadMinutesExisting: leadExisting!,
      maxAdvanceDays: advance!,
      slotStepMinutes: d.slotStepMinutes,
    },
  };
}

const STEPS = Array.from({ length: (ONLINE_STEP_MAX - ONLINE_STEP_MIN) / 5 + 1 }, (_, i) => ONLINE_STEP_MIN + i * 5);

/** La dirección pública de /reservar en el host de la clínica (el mismo que el de la app). */
function usePublicUrl(): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    // Solo en el navegador: el host de la pestaña es el subdominio de la clínica.
    const next = `${window.location.origin}${PUBLIC_BOOKING_PATH}`;
    queueMicrotask(() => setUrl(next));
  }, []);
  return url;
}

/**
 * Ajustes › Reserva online (DX-016): la URL pública para copiarla, cómo se
 * reserva (activar, modos, antelaciones, paso de los huecos: una SaveBar) y
 * los tipos de cita que se ofrecen (visible al momento con un Switch; duración,
 * profesionales y sedes en su diálogo). Lo leen los roles de la agenda; solo
 * ADMIN lo cambia (la API responde 403 a los demás).
 */
export function OnlineBookingSettingsSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [settings, setSettings] = useState<OnlineBookingSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getOnlineBookingSettings(token)
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
      <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72 max-w-full" />
        <Skeleton className="mt-6 h-4 w-56" />
      </div>
    );
  }
  return (
    <>
      <PublicPageSection enabled={settings.enabled} />
      <GeneralSection token={token} allowed={allowed} settings={settings} onSaved={setSettings} />
      <TypesSection token={token} allowed={allowed} />
    </>
  );
}

function PublicPageSection({ enabled }: { enabled: boolean }) {
  const url = usePublicUrl();
  const labelId = useId();
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
    }
  }
  return (
    <SettingsSection title={copy.pageSection} description={copy.pageSectionHint}>
      <SettingRows className="max-w-[720px]">
        <div className="flex min-w-0 flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span id={labelId} className="font-medium text-ink">
              {copy.urlLabel}
            </span>
            <Badge variant={enabled ? 'success' : 'neutral'} data-testid="online-booking-status">
              {enabled ? copy.statusOn : copy.statusOff}
            </Badge>
          </div>
          {enabled ? null : <p className="max-w-[60ch] text-sm text-muted">{copy.offHint}</p>}
          <code
            aria-labelledby={labelId}
            className="t-id min-w-0 select-all break-all rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink"
            data-testid="online-booking-url"
          >
            {url}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" className="max-sm:min-h-11" disabled={!url} onClick={() => void copyUrl()}>
              <Copy aria-hidden /> {copy.copyUrl}
            </Button>
            <Button asChild variant="ghost" size="sm" className="max-sm:min-h-11">
              <ExternalLink href={PUBLIC_BOOKING_PATH}>
                <ExternalLinkIcon aria-hidden /> {copy.openUrl}
              </ExternalLink>
            </Button>
          </div>
        </div>
      </SettingRows>
    </SettingsSection>
  );
}

function GeneralSection({
  token,
  allowed,
  settings,
  onSaved,
}: {
  token: string;
  allowed: boolean;
  settings: OnlineBookingSettings;
  onSaved: (next: OnlineBookingSettings) => void;
}) {
  const saved = useMemo(() => toDraft(settings), [settings]);
  const { draft, update, dirty, discard, commit } = useSettingsDraft<GeneralDraft>(saved ?? EMPTY_DRAFT);
  const [errors, setErrors] = useState<GeneralErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const fid = (name: string) => `${id}-${name}`;
  const formId = fid('form');

  function patch(p: Partial<GeneralDraft>) {
    update(p);
    setNotice('');
    setSaveError(null);
    const keys = Object.keys(p);
    if (keys.some((k) => k in errors)) setErrors({});
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!allowed) return;
    const checked = validateGeneral(draft);
    if ('errors' in checked) {
      setErrors(checked.errors);
      const first = (['minLeadMinutesNew', 'minLeadMinutesExisting', 'maxAdvanceDays'] as const).find((k) => checked.errors[k]);
      if (first) document.getElementById(fid(first))?.focus();
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveOnlineBookingSettings(token, checked.input);
      commit(toDraft(res));
      onSaved(res);
      setNotice(copy.saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  const numberField = (key: keyof GeneralErrors, label: string, hint: string) => (
    <FormField htmlFor={fid(key)} label={label} hint={hint} error={errors[key]}>
      <Input
        id={fid(key)}
        inputMode="numeric"
        value={draft[key]}
        disabled={!allowed || saving}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<GeneralDraft>)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? fieldErrorId(fid(key)) : undefined}
        className="sm:w-40"
      />
    </FormField>
  );

  const modeGroup = (key: 'newPatientMode' | 'existingPatientMode', legend: string) => (
    <RadioGroup
      id={fid(key)}
      legend={legend}
      value={draft[key]}
      disabled={!allowed || saving}
      onValueChange={(v) => patch({ [key]: v as OnlineBookingMode } as Partial<GeneralDraft>)}
      optionsClassName="grid gap-2 sm:grid-cols-2"
    >
      <RadioCard id={fid(key)} value="REQUEST" title={copy.modeRequest} description={copy.modeRequestHint} />
      <RadioCard value="DIRECT" title={copy.modeDirect} description={copy.modeDirectHint} />
    </RadioGroup>
  );

  return (
    <SettingsSection title={copy.generalSection} description={copy.generalSectionHint}>
      <form id={formId} onSubmit={handleSave} noValidate className="flex max-w-[720px] flex-col gap-4">
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-4 sm:p-6">
          <Checkbox
            label={copy.enabled}
            description={copy.enabledHint}
            checked={draft.enabled}
            disabled={!allowed || saving}
            onChange={(e) => patch({ enabled: e.target.checked })}
            data-testid="online-booking-enabled"
          />
          {modeGroup('newPatientMode', copy.newMode)}
          {modeGroup('existingPatientMode', copy.existingMode)}
          <div className="grid gap-4 sm:grid-cols-2">
            {numberField('minLeadMinutesNew', copy.leadNew, copy.leadHint)}
            {numberField('minLeadMinutesExisting', copy.leadExisting, copy.leadHint)}
            {numberField('maxAdvanceDays', copy.advance, copy.advanceHint)}
            <FormField htmlFor={fid('step')} label={copy.step}>
              <NativeSelect
                id={fid('step')}
                value={String(draft.slotStepMinutes)}
                disabled={!allowed || saving}
                onChange={(e) => patch({ slotStepMinutes: Number(e.target.value) })}
                className="sm:w-40"
              >
                {STEPS.map((n) => (
                  <option key={n} value={n}>
                    {copy.stepOption(n)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {!allowed ? <p className="text-sm text-muted">{copy.readOnly}</p> : null}
        </div>
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
        {allowed ? (
          <SaveBar
            dirty={dirty}
            saving={saving}
            form={formId}
            savedFocusTo={noticeRef}
            error={saveError}
            onDiscard={() => {
              discard();
              setErrors({});
              setSaveError(null);
            }}
          />
        ) : null}
      </form>
    </SettingsSection>
  );
}

function TypesSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [types, setTypes] = useState<OnlineType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OnlineType | null>(null);
  const locationsState = useLocationsState(token);
  const locations = locationsState.status === 'ready' ? locationsState.locations.filter((l) => l.isActive) : [];
  const locationName = (lid: string) => locations.find((l) => l.id === lid)?.name ?? null;
  const [staff, setStaff] = useState<StaffMember[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOnlineTypes(token)
      .then((res) => {
        if (cancelled) return;
        setTypes(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    listStaff(token)
      .then((res) => {
        if (!cancelled) setStaff(res);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const providers = (staff ?? []).filter((m) => m.role === 'DENTIST' || m.role === 'ADMIN');
  const providerName = (pid: string) => providers.find((p) => p.userId === pid)?.fullName ?? null;
  const names = (ids: string[], name: (id: string) => string | null, all: string) =>
    ids.length === 0 ? all : ids.map(name).filter(Boolean).join(', ') || String(ids.length);

  function replace(next: OnlineType) {
    setTypes((prev) => (prev ? prev.map((t) => (t.appointmentTypeId === next.appointmentTypeId ? next : t)) : prev));
  }

  async function toggleVisible(type: OnlineType, visible: boolean) {
    setPendingId(type.appointmentTypeId);
    // El Switch cambia al momento; si la API lo rechaza, vuelve a como estaba.
    replace({ ...type, visibleOnline: visible });
    try {
      const res = await saveOnlineType(token, type.appointmentTypeId, {
        visibleOnline: visible,
        durationNewMinutes: type.durationNewMinutes,
        durationExistingMinutes: type.durationExistingMinutes,
        providerIds: type.providerIds,
        locationIds: type.locationIds,
      });
      replace(res);
      toast.success(copy.typeSaved(res.name));
    } catch (err) {
      replace(type);
      notifyError(apiErrorMessage(err, copy.typeSaveError), { onRetry: () => void toggleVisible(type, visible) });
    } finally {
      setPendingId(null);
    }
  }

  const columns: DataListColumn<OnlineType>[] = [
    {
      id: 'type',
      header: copy.colType,
      mobile: 'primary',
      cell: (t) => (
        <span className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
          {t.name}
          {!t.active ? <Badge variant="neutral">{copy.inactive}</Badge> : null}
        </span>
      ),
      mobileCell: (t) => t.name,
    },
    {
      id: 'visible',
      header: copy.colVisible,
      mobile: 'trailing',
      cell: (t) => (
        <Switch
          aria-label={copy.visibleLabel(t.name)}
          checked={t.visibleOnline}
          disabled={!allowed || !t.active || pendingId === t.appointmentTypeId}
          onChange={(e) => void toggleVisible(t, e.target.checked)}
          data-testid={`online-type-visible-${t.appointmentTypeId}`}
        />
      ),
    },
    {
      id: 'duration',
      header: copy.colDuration,
      cellClassName: 'tabular-nums',
      cell: (t) =>
        `${copy.minutes(t.durationNewMinutes ?? t.durationMinutes)} · ${copy.minutes(t.durationExistingMinutes ?? t.durationMinutes)}`,
    },
    {
      id: 'providers',
      header: copy.colProviders,
      cell: (t) => names(t.providerIds, providerName, copy.all),
    },
    {
      id: 'locations',
      header: copy.colLocations,
      cell: (t) => names(t.locationIds, locationName, copy.allLocations),
    },
  ];

  return (
    <SettingsSection title={copy.typesSection} description={copy.typesSectionHint}>
      {error ? (
        <SectionError description={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !types ? (
        <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="mt-4 h-4 w-56" />
        </div>
      ) : types.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted">{copy.typesEmpty}</p>
      ) : (
        <DataList
          label={copy.typesLabel}
          rows={types}
          columns={columns}
          getRowKey={(t) => t.appointmentTypeId}
          getRowLabel={(t) => t.name}
          rowActions={
            allowed
              ? (t) => [
                  {
                    label: copy.configure,
                    onSelect: () => setEditing(t),
                  },
                ]
              : undefined
          }
        />
      )}
      {editing ? (
        <TypeDialog
          key={editing.appointmentTypeId}
          token={token}
          type={editing}
          providers={providers}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          staffFailed={staff !== null && staff.length === 0}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            replace(next);
            setEditing(null);
            toast.success(copy.typeSaved(next.name));
          }}
        />
      ) : null}
    </SettingsSection>
  );
}

function TypeDialog({
  token,
  type,
  providers,
  locations,
  staffFailed,
  onClose,
  onSaved,
}: {
  token: string;
  type: OnlineType;
  providers: StaffMember[];
  locations: { id: string; name: string }[];
  staffFailed: boolean;
  onClose: () => void;
  onSaved: (next: OnlineType) => void;
}) {
  const id = useId();
  const [durationNew, setDurationNew] = useState(type.durationNewMinutes === null ? '' : String(type.durationNewMinutes));
  const [durationExisting, setDurationExisting] = useState(
    type.durationExistingMinutes === null ? '' : String(type.durationExistingMinutes),
  );
  const [providerIds, setProviderIds] = useState<string[]>(type.providerIds);
  const [locationIds, setLocationIds] = useState<string[]>(type.locationIds);
  const [errors, setErrors] = useState<{ durationNew?: string; durationExisting?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value));

  async function submit() {
    const dNew = parseDuration(durationNew);
    const dExisting = parseDuration(durationExisting);
    const found: typeof errors = {};
    if (dNew === undefined) found.durationNew = copy.durationInvalid;
    if (dExisting === undefined) found.durationExisting = copy.durationInvalid;
    setErrors(found);
    if (dNew === undefined || dExisting === undefined) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveOnlineType(token, type.appointmentTypeId, {
        visibleOnline: type.visibleOnline,
        durationNewMinutes: dNew,
        durationExistingMinutes: dExisting,
        providerIds,
        locationIds,
      });
      onSaved(res);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.typeSaveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={copy.dialogTitle(type.name)}
      description={copy.dialogDescription}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      submitLabel={copy.save}
      submitting={saving}
      error={saveError}
      touchTargets
      ownValidation
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor={`${id}-new`} label={copy.durationNew} hint={copy.durationHint(type.durationMinutes)} error={errors.durationNew}>
            <Input
              id={`${id}-new`}
              inputMode="numeric"
              value={durationNew}
              onChange={(e) => setDurationNew(e.target.value)}
              aria-invalid={errors.durationNew ? true : undefined}
            />
          </FormField>
          <FormField
            htmlFor={`${id}-existing`}
            label={copy.durationExisting}
            hint={copy.durationHint(type.durationMinutes)}
            error={errors.durationExisting}
          >
            <Input
              id={`${id}-existing`}
              inputMode="numeric"
              value={durationExisting}
              onChange={(e) => setDurationExisting(e.target.value)}
              aria-invalid={errors.durationExisting ? true : undefined}
            />
          </FormField>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">{copy.providersLegend}</legend>
          <p className="text-xs text-muted">{copy.providersHint}</p>
          {staffFailed ? <InlineError>{copy.staffError}</InlineError> : null}
          {providers.map((p) => (
            <Checkbox
              key={p.userId}
              label={p.fullName}
              checked={providerIds.includes(p.userId)}
              onChange={(e) => setProviderIds((l) => toggle(l, p.userId, e.target.checked))}
            />
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">{copy.locationsLegend}</legend>
          <p className="text-xs text-muted">{copy.locationsHint}</p>
          {locations.map((l) => (
            <Checkbox
              key={l.id}
              label={l.name}
              checked={locationIds.includes(l.id)}
              onChange={(e) => setLocationIds((list) => toggle(list, l.id, e.target.checked))}
            />
          ))}
        </fieldset>
      </div>
    </FormModal>
  );
}
