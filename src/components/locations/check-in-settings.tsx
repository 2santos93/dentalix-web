'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CHECK_IN_MINUTES_MAX,
  checkInQrUrl,
  createCheckInQr,
  getCheckInSettings,
  revokeCheckInQr,
  updateCheckInSettings,
  type CheckInSettings,
} from '@/lib/appointments/arrival-api';
import { SectionError } from '@/components/errors/section-error';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ExternalLink } from '@/components/shared/external-link';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRow, SettingRows, SettingsSection } from '@/components/settings/settings-page';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { posterHref } from './check-in-poster';

export const checkInSettingsCopy = {
  heading: 'Llegada de pacientes',
  support:
    '«Ya llegué»: el paciente avisa de su llegada desde el enlace de su cita o con el QR de la sede, y aparece en «En clínica» con lo que tenga pendiente.',
  linkEnabled: 'Ofrecer «Ya llegué» en el enlace de la cita',
  linkEnabledHint: 'El enlace del recordatorio muestra el botón el día de la cita, dentro de la ventana.',
  minutesBefore: 'Desde (minutos antes de la cita)',
  minutesAfter: 'Hasta (minutos después del inicio)',
  lateMinutes: 'Retraso que manda a recepción (minutos)',
  windowHint: 'De 0 a 240. Siempre el día de la cita, en la hora de la sede.',
  lateHint: 'Quien llegue más tarde que esto ve «Pasa por recepción».',
  range: `Escribe un número entero de 0 a ${CHECK_IN_MINUTES_MAX}.`,
  saveFor: (name: string) => `Guardar la llegada de pacientes de ${name}`,
  saved: (name: string) => `Llegada de pacientes de ${name} guardada.`,
  saveError: 'No pudimos guardar los cambios. Intenta de nuevo.',
  loadError: 'No pudimos cargar la llegada de pacientes.',
  loading: 'Cargando',
  qrHeading: 'QR de llegada',
  qrSupport:
    'Un cartel en la recepción o en la puerta. El paciente lo escanea, escribe su documento y su fecha de nacimiento y queda marcada su cita de hoy en esta sede.',
  qrStatus: 'Estado',
  qrActive: (date: string) => `Activo desde el ${date}`,
  qrNone: 'Sin QR',
  qrCreate: 'Generar QR',
  qrReplace: 'Generar otro',
  qrRevoke: 'Retirar QR',
  qrReplaceTitle: '¿Generar otro QR?',
  qrReplaceMessage: 'El cartel que tienes impreso dejará de valer: tendrás que imprimir el nuevo.',
  qrReplaceConfirm: 'Generar otro',
  qrRevokeTitle: '¿Retirar el QR?',
  qrRevokeMessage: 'El cartel impreso dejará de valer y los pacientes tendrán que pasar por recepción.',
  qrRevokeConfirm: 'Retirar',
  cancel: 'Cancelar',
  qrCreated: 'QR generado. Imprímelo ahora: por seguridad no se vuelve a mostrar.',
  qrRevoked: 'QR retirado.',
  qrNewTitle: 'Tu nuevo QR',
  qrNewHint: 'Solo se muestra ahora. Si pierdes el cartel, genera otro.',
  qrPrint: 'Imprimir cartel',
  qrLabel: (name: string) => `Código QR de llegada de ${name}`,
  qrError: 'No pudimos cambiar el QR. Intenta de nuevo.',
};

const copy = checkInSettingsCopy;

interface Draft {
  linkEnabled: boolean;
  minutesBefore: string;
  minutesAfter: string;
  lateMinutes: string;
}

function toDraft(s: CheckInSettings): Draft {
  return {
    linkEnabled: s.linkEnabled,
    minutesBefore: String(s.minutesBefore),
    minutesAfter: String(s.minutesAfter),
    lateMinutes: String(s.lateMinutes),
  };
}

function parseMinutes(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n <= CHECK_IN_MINUTES_MAX ? n : null;
}

/**
 * DX-265: «Ya llegué» de UNA sede, en su ficha (DESIGN.md → «Per sede:
 * reached through its sede»). Solo ADMIN (quien lo monta lo decide; la API lo
 * exige también): la ventana, el umbral de retraso, si el enlace lo ofrece y
 * el QR imprimible.
 */
export function CheckInSettingsPanel({
  token,
  locationId,
  locationName,
  dateLabel,
}: {
  token: string;
  locationId: string;
  locationName: string;
  /** Fecha corta en el formato de la sede. */
  dateLabel: (iso: string) => string;
}) {
  const [settings, setSettings] = useState<CheckInSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getCheckInSettings(token, locationId)
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
  }, [token, locationId, reloadKey]);

  const saved = React.useMemo(() => (settings ? toDraft(settings) : null), [settings]);

  if (loadError) {
    return (
      <SettingsSection title={copy.heading} description={copy.support}>
        <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      </SettingsSection>
    );
  }
  if (!settings || !saved) {
    return (
      <SettingsSection title={copy.heading} description={copy.support}>
        <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-56" />
        </div>
      </SettingsSection>
    );
  }
  return (
    <>
      <SettingsSection title={copy.heading} description={copy.support}>
        <WindowForm
          token={token}
          locationId={locationId}
          locationName={locationName}
          saved={saved}
          onSaved={setSettings}
        />
      </SettingsSection>
      <QrSection
        token={token}
        locationId={locationId}
        locationName={locationName}
        settings={settings}
        dateLabel={dateLabel}
        onChange={setSettings}
      />
    </>
  );
}

function WindowForm({
  token,
  locationId,
  locationName,
  saved,
  onSaved,
}: {
  token: string;
  locationId: string;
  locationName: string;
  saved: Draft;
  onSaved: (next: CheckInSettings) => void;
}) {
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const formId = `check-in-settings-${locationId}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const minutesBefore = parseMinutes(draft.minutesBefore);
    const minutesAfter = parseMinutes(draft.minutesAfter);
    const lateMinutes = parseMinutes(draft.lateMinutes);
    const errors: Partial<Record<keyof Draft, string>> = {};
    if (minutesBefore === null) errors.minutesBefore = copy.range;
    if (minutesAfter === null) errors.minutesAfter = copy.range;
    if (lateMinutes === null) errors.lateMinutes = copy.range;
    setFieldErrors(errors);
    if (minutesBefore === null || minutesAfter === null || lateMinutes === null) return;
    setSaving(true);
    try {
      const res = await updateCheckInSettings(token, locationId, {
        linkEnabled: draft.linkEnabled,
        minutesBefore,
        minutesAfter,
        lateMinutes,
      });
      onSaved(res);
      commit(toDraft(res));
      toast.success(copy.saved(locationName));
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  const minutesField = (key: 'minutesBefore' | 'minutesAfter' | 'lateMinutes', label: string, hint: string) => {
    const id = `${formId}-${key}`;
    const fieldError = fieldErrors[key] ?? null;
    return (
      <FormField htmlFor={id} label={label} hint={hint} hintId={`${id}-hint`} error={fieldError}>
        <Input
          id={id}
          inputMode="numeric"
          className="w-28 tabular-nums"
          value={draft[key]}
          disabled={saving}
          maxLength={3}
          onChange={(e) => update({ [key]: e.target.value.replace(/\D/g, '') } as Partial<Draft>)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? fieldErrorId(id) : `${id}-hint`}
        />
      </FormField>
    );
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Checkbox
          id={`${formId}-link`}
          checked={draft.linkEnabled}
          disabled={saving}
          onChange={(e) => update({ linkEnabled: e.target.checked })}
          label={copy.linkEnabled}
          description={copy.linkEnabledHint}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {minutesField('minutesBefore', copy.minutesBefore, copy.windowHint)}
          {minutesField('minutesAfter', copy.minutesAfter, copy.windowHint)}
        </div>
        {minutesField('lateMinutes', copy.lateMinutes, copy.lateHint)}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        form={formId}
        error={error}
        saveAriaLabel={copy.saveFor(locationName)}
        onDiscard={() => {
          discard();
          setError(null);
          setFieldErrors({});
        }}
      />
    </form>
  );
}

function QrSection({
  token,
  locationId,
  locationName,
  settings,
  dateLabel,
  onChange,
}: {
  token: string;
  locationId: string;
  locationName: string;
  settings: CheckInSettings;
  dateLabel: (iso: string) => string;
  onChange: (next: CheckInSettings) => void;
}) {
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null);
  const [confirm, setConfirm] = useState<'replace' | 'revoke' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El token solo vive aquí, en memoria, justo tras generarlo.
  const [fresh, setFresh] = useState<string | null>(null);

  async function create() {
    setBusy('create');
    setError(null);
    try {
      const res = await createCheckInQr(token, locationId);
      const { token: qrToken, ...rest } = res;
      onChange(rest);
      setFresh(qrToken);
      toast.success(copy.qrCreated);
      setConfirm(null);
    } catch (err) {
      setError(apiErrorMessage(err, copy.qrError));
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy('revoke');
    setError(null);
    try {
      onChange(await revokeCheckInQr(token, locationId));
      setFresh(null);
      toast.success(copy.qrRevoked);
      setConfirm(null);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err, copy.qrError) : copy.qrError);
    } finally {
      setBusy(null);
    }
  }

  const url = fresh ? checkInQrUrl(window.location.origin, fresh) : null;

  return (
    <SettingsSection title={copy.qrHeading} description={copy.qrSupport}>
      <SettingRows>
        <SettingRow
          label={copy.qrStatus}
          value={settings.qrActive && settings.qrCreatedAt ? copy.qrActive(dateLabel(settings.qrCreatedAt)) : copy.qrNone}
          action={
            <div className="flex flex-wrap gap-2 max-sm:w-full">
              <Button
                type="button"
                variant={settings.qrActive ? 'secondary' : 'default'}
                className="max-sm:flex-1"
                loading={busy === 'create' && confirm === null}
                disabled={busy !== null}
                onClick={() => (settings.qrActive ? setConfirm('replace') : void create())}
              >
                <QrCode aria-hidden /> {settings.qrActive ? copy.qrReplace : copy.qrCreate}
              </Button>
              {settings.qrActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="max-sm:flex-1"
                  disabled={busy !== null}
                  onClick={() => setConfirm('revoke')}
                >
                  {copy.qrRevoke}
                </Button>
              ) : null}
            </div>
          }
        />
      </SettingRows>
      {error && confirm === null ? <p className="text-sm text-danger-text">{error}</p> : null}
      {url && fresh ? (
        <div
          data-testid="check-in-qr-fresh"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-start sm:p-6"
        >
          <div className="rounded-lg border border-border bg-white p-3">
            <QRCodeSVG value={url} size={176} level="M" title={copy.qrLabel(locationName)} />
          </div>
          <div className="flex min-w-0 flex-col gap-2 max-sm:items-center max-sm:text-center">
            <p className="t-title text-ink">{copy.qrNewTitle}</p>
            <p className="text-sm text-muted">{copy.qrNewHint}</p>
            <Button asChild className="w-fit">
              <ExternalLink href={posterHref(fresh, locationName)}>
                <Printer aria-hidden /> {copy.qrPrint}
              </ExternalLink>
            </Button>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) {
            setConfirm(null);
            setError(null);
          }
        }}
        title={confirm === 'revoke' ? copy.qrRevokeTitle : copy.qrReplaceTitle}
        description={confirm === 'revoke' ? copy.qrRevokeMessage : copy.qrReplaceMessage}
        confirmLabel={confirm === 'revoke' ? copy.qrRevokeConfirm : copy.qrReplaceConfirm}
        cancelLabel={copy.cancel}
        confirming={busy !== null}
        error={confirm !== null ? error : null}
        onConfirm={() => void (confirm === 'revoke' ? revoke() : create())}
      />
    </SettingsSection>
  );
}
