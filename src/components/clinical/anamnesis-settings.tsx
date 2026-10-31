'use client';
import { useEffect, useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getAnamnesisSettings,
  saveAnamnesisSettings,
  type AnamnesisSettings,
} from '@/lib/clinical/medical-alerts';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Opciones del selector; la API acepta cualquier número de 1 a 60. */
const MONTH_OPTIONS = [3, 6, 12, 18, 24, 36, 48, 60];

const copy = {
  title: 'Vigencia de la anamnesis',
  hint:
    'Pasado este plazo desde la última anamnesis o la última confirmación «Sin cambios hoy», la agenda y la ficha la marcan como «Anamnesis caducada». Se recomienda revisarla al menos una vez al año.',
  months: (n: number) => (n === 1 ? '1 mes' : `${n} meses`),
  change: 'Cambiar',
  dialogTitle: 'Cambiar la vigencia de la anamnesis',
  dialogDescription: 'Se aplica a todos los pacientes de la clínica, en todas las sedes. El cambio queda en la auditoría.',
  fieldLabel: 'Meses de vigencia',
  save: 'Guardar',
  cancel: 'Cancelar',
  saved: 'Vigencia de la anamnesis guardada.',
  loadError: 'No pudimos cargar la vigencia de la anamnesis.',
  saveError: 'No pudimos guardar la vigencia. Intenta de nuevo.',
  forbiddenTitle: 'Solo administración cambia la vigencia de la anamnesis.',
  forbiddenHint: 'El equipo clínico ve en la agenda y en la ficha si la anamnesis está caducada.',
};


/**
 * Ajustes → Historia clínica (DX-247): cuántos meses vale la anamnesis en la
 * clínica (12 por defecto). Solo ADMIN la cambia, en un modal.
 */
export function AnamnesisSettingsSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [settings, setSettings] = useState<AnamnesisSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(12);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const fieldId = useId();

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getAnamnesisSettings(token)
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
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />;
  }
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
      <div role="status" aria-label="Cargando" className="max-w-[720px] rounded-lg border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
    );
  }

  const options = MONTH_OPTIONS.includes(settings.anamnesisValidityMonths)
    ? MONTH_OPTIONS
    : [...MONTH_OPTIONS, settings.anamnesisValidityMonths].sort((a, b) => a - b);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      setSettings(await saveAnamnesisSettings(token, { anamnesisValidityMonths: draft }));
      setNotice(copy.saved);
      setOpen(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-3">
      {/* Fila de ajuste: nombre y valor (dato) a la izquierda, «Cambiar» a la
          derecha; la explicación debajo. Sin icono: la fila del índice ya lo lleva. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="t-label text-muted">{copy.title}</p>
            <p data-testid="anamnesis-validity" className="t-data text-base text-ink">
              {copy.months(settings.anamnesisValidityMonths)}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 max-sm:w-full"
            onClick={() => {
              setDraft(settings.anamnesisValidityMonths);
              setSaveError(null);
              setNotice('');
              setOpen(true);
            }}
          >
            {copy.change}
          </Button>
        </div>
        <p className="text-sm text-muted">{copy.hint}</p>
      </div>
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
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className="text-sm font-medium text-ink">
                {copy.fieldLabel}
              </label>
              <NativeSelect
                id={fieldId}
                value={draft}
                onChange={(e) => setDraft(Number(e.target.value))}
                disabled={saving}
              >
                {options.map((m) => (
                  <option key={m} value={m}>
                    {copy.months(m)}
                  </option>
                ))}
              </NativeSelect>
            </div>
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
