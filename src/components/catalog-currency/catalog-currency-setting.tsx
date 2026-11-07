'use client';
import { useEffect, useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getClinicSettings, updateClinicSettings } from '@/lib/clinic/clinic-settings-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { clinicBaseCurrency } from '@/lib/locations/location-settings';
import { listCurrencies, type Currency } from '@/lib/reference/currencies-api';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormField } from '@/components/shared/form-field';
import { SettingRow, SettingRows, SettingsSection } from '@/components/settings/settings-page';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const catalogCurrencyCopy = {
  heading: 'Moneda del catálogo',
  support:
    'La moneda en la que están los precios del catálogo. Con ella, el presupuesto enseña el precio de lista y el ahorro por convenio.',
  label: 'Moneda de los precios del catálogo',
  unset: 'Sin fijar',
  unsetCommon: (code: string) => `Sin fijar: se usa ${code}, la moneda de tus sedes activas.`,
  unsetMixed:
    'Sin fijar: tus sedes activas usan monedas distintas, así que los ítems nuevos de los planes no enseñan precio de lista ni ahorro por convenio.',
  setHint: 'Los ítems que se agreguen a los planes la guardan. Los ya creados conservan la suya.',
  change: 'Cambiar',
  dialogTitle: 'Cambiar la moneda del catálogo',
  dialogDescription:
    'Elige la moneda en la que están los precios del catálogo. Solo afecta a los ítems que se agreguen a los planes desde ahora: los ya creados conservan la suya y ningún importe se convierte. El cambio queda en la auditoría.',
  fieldLabel: 'Moneda',
  unsetOption: 'Sin fijar (la de las sedes)',
  save: 'Guardar',
  cancel: 'Cancelar',
  saved: 'Moneda del catálogo guardada.',
  loading: 'Cargando',
  loadError: 'No pudimos cargar la moneda del catálogo.',
  saveError: 'No pudimos guardar la moneda del catálogo. Intenta de nuevo.',
};

const copy = catalogCurrencyCopy;

interface Loaded {
  catalogCurrency: string | null;
  locations: ClinicLocation[];
  currencies: Currency[];
}

/**
 * DX-502-bis, Ajustes › Monedas: la moneda del catálogo de precios de la
 * clínica (`catalogCurrency` de `/clinic/settings`). Es la que la API congela
 * en los ítems NUEVOS del plan; sin fijar, la común de las sedes activas o
 * ninguna (DX-502). Solo ADMIN: la página no la monta para el resto. Fila de
 * política con «Cambiar» en un diálogo (plantilla de Ajustes, sin SaveBar).
 */
export function CatalogCurrencySetting({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const fieldId = useId();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClinicSettings(token), listLocations(token), listCurrencies(token)])
      .then(([settings, locations, currencies]) => {
        if (cancelled) return;
        setLoaded({ catalogCurrency: settings.catalogCurrency ?? null, locations, currencies });
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loaded) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateClinicSettings(token, { catalogCurrency: draft === '' ? null : draft });
      setLoaded({ ...loaded, catalogCurrency: saved.catalogCurrency ?? null });
      setNotice(copy.saved);
      setOpen(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  } else if (!loaded) {
    body = (
      <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
    );
  } else {
    const current = loaded.catalogCurrency;
    const name = current ? loaded.currencies.find((c) => c.code === current)?.name : undefined;
    const common = clinicBaseCurrency(loaded.locations);
    const hint = current ? copy.setHint : common ? copy.unsetCommon(common) : copy.unsetMixed;
    body = (
      <div className="flex flex-col gap-3">
        <SettingRows>
          <SettingRow
            label={copy.label}
            description={hint}
            isDefault={current === null}
            value={
              <span data-testid="catalog-currency">{current ? (name ? `${current} · ${name}` : current) : copy.unset}</span>
            }
            action={
              <Button
                type="button"
                variant="secondary"
                className="max-sm:min-h-11"
                onClick={() => {
                  setDraft(current ?? '');
                  setSaveError(null);
                  setNotice('');
                  setOpen(true);
                }}
              >
                {copy.change}
              </Button>
            }
          />
        </SettingRows>
        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{copy.dialogTitle}</DialogTitle>
                <DialogDescription>{copy.dialogDescription}</DialogDescription>
              </DialogHeader>
              <FormField htmlFor={fieldId} label={copy.fieldLabel}>
                <NativeSelect
                  id={fieldId}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={saving}
                  selectClassName="max-sm:h-11"
                >
                  <option value="">{copy.unsetOption}</option>
                  {loaded.currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={saving}>
                    {copy.cancel}
                  </Button>
                </DialogClose>
                <Button type="submit" loading={saving} className="max-sm:min-h-11">
                  {copy.save}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <SettingsSection title={copy.heading} description={copy.support}>
      {body}
    </SettingsSection>
  );
}
