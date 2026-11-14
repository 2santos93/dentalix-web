'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  RECEIPT_LEGEND_MAX,
  getReceiptSettings,
  saveLocationReceiptLegend,
  type ReceiptSettings,
} from '@/lib/payments/receipt-settings-api';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingsSection } from '@/components/settings/settings-page';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export const locationReceiptLegendCopy = {
  heading: 'Leyenda del recibo',
  support: 'La sede imprime la leyenda de la clínica en sus recibos de caja, salvo que tenga una propia.',
  override: 'Usar una leyenda propia en esta sede',
  overrideHint: 'Se aplica a los recibos que la sede emita desde ahora.',
  inherited: (legend: string) => `Usa la de la clínica: «${legend}».`,
  inheritedNone: 'La clínica no tiene leyenda: los recibos de esta sede no imprimen ninguna.',
  clinicLink: 'Cambiar la de la clínica en Caja',
  legend: 'Leyenda de esta sede',
  legendHint: (n: number) => `Vacía: esta sede no imprime ninguna. ${n}/${RECEIPT_LEGEND_MAX}`,
  saveFor: (name: string) => `Guardar la leyenda del recibo de ${name}`,
  saved: (name: string) => `Leyenda del recibo de ${name} guardada.`,
  loadError: 'No pudimos cargar la leyenda del recibo.',
  saveError: 'No pudimos guardar la leyenda del recibo. Intenta de nuevo.',
  loading: 'Cargando',
};

const copy = locationReceiptLegendCopy;

interface Draft {
  override: boolean;
  legend: string;
}

/**
 * DX-515: la leyenda del recibo de UNA sede, en su ficha (DESIGN.md → «Per
 * sede: reached through its sede»), con la barra «Cambios sin guardar». Solo
 * ADMIN (quien la monta lo decide; la API lo exige también).
 */
export function LocationReceiptLegendForm({
  token,
  locationId,
  locationName,
}: {
  token: string;
  locationId: string;
  locationName: string;
}) {
  const [settings, setSettings] = useState<ReceiptSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getReceiptSettings(token)
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

  const own = settings?.locations.find((l) => l.locationId === locationId) ?? null;
  const saved = React.useMemo<Draft | null>(
    () => (own ? { override: own.override, legend: own.legend ?? '' } : null),
    [own],
  );

  return (
    <SettingsSection title={copy.heading} description={copy.support}>
      {loadError ? (
        <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !settings || !saved ? (
        <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-56" />
        </div>
      ) : (
        <LegendFields
          token={token}
          locationId={locationId}
          locationName={locationName}
          clinicLegend={settings.legend}
          saved={saved}
          onSaved={(next) =>
            setSettings({
              ...settings,
              locations: settings.locations.map((l) => (l.locationId === next.locationId ? next : l)),
            })
          }
        />
      )}
    </SettingsSection>
  );
}

function LegendFields({
  token,
  locationId,
  locationName,
  clinicLegend,
  saved,
  onSaved,
}: {
  token: string;
  locationId: string;
  locationName: string;
  clinicLegend: string | null;
  saved: Draft;
  onSaved: (next: ReceiptSettings['locations'][number]) => void;
}) {
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formId = `location-receipt-legend-${locationId}`;
  const legendId = `${formId}-legend`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    setSaving(true);
    try {
      const res = await saveLocationReceiptLegend(token, locationId, {
        override: draft.override,
        legend: draft.override ? draft.legend.trim() || null : null,
      });
      onSaved(res);
      commit({ override: res.override, legend: res.legend ?? '' });
      toast.success(copy.saved(locationName));
    } catch (err) {
      const message = apiErrorMessage(err, copy.saveError);
      if (err instanceof ApiError && err.status === 400) setFieldError(message);
      else setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Checkbox
          id={`${formId}-override`}
          checked={draft.override}
          disabled={saving}
          onChange={(e) => update({ override: e.target.checked })}
          label={copy.override}
          description={copy.overrideHint}
        />
        {draft.override ? (
          <FormField
            htmlFor={legendId}
            label={copy.legend}
            hint={copy.legendHint(draft.legend.length)}
            hintId={`${legendId}-hint`}
            error={fieldError}
          >
            <Textarea
              id={legendId}
              rows={2}
              autoGrow
              maxLength={RECEIPT_LEGEND_MAX}
              value={draft.legend}
              disabled={saving}
              onChange={(e) => update({ legend: e.target.value.replace(/[\r\n]+/g, ' ') })}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? fieldErrorId(legendId) : `${legendId}-hint`}
              className="max-h-40"
            />
          </FormField>
        ) : (
          <p className="text-sm text-muted" data-testid="inherited-legend">
            {clinicLegend ? copy.inherited(clinicLegend) : copy.inheritedNone}{' '}
            <Link href="/settings/caja" className="font-medium text-primary-text underline-offset-4 hover:underline">
              {copy.clinicLink}
            </Link>
          </p>
        )}
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
          setFieldError(null);
        }}
      />
    </form>
  );
}
