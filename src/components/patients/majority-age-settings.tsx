'use client';
import { useEffect, useId, useState } from 'react';
import { Lock, UserCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPatientSettings,
  MAJORITY_AGE_OPTIONS,
  savePatientSettings,
  type PatientSettings,
} from '@/lib/patients/patient-settings-api';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const copy = {
  // La página ya se titula «Mayoría de edad»: la tarjeta nombra el ajuste en
  // vez de repetir el H1 (igual que «Vigencia de la anamnesis» bajo
  // «Historia clínica»).
  title: 'Edad desde la que el paciente es adulto',
  hint:
    'Por debajo de esta edad, los recordatorios, recibos y estados de cuenta del paciente van a su responsable, y la ficha avisa si no tiene uno. Una clínica nueva empieza con 18 años.',
  years: (n: number) => `${n} años`,
  change: 'Cambiar',
  dialogTitle: 'Cambiar la mayoría de edad',
  dialogDescription:
    'Se aplica desde ya a todos los pacientes de la clínica, en todas las sedes. El cambio queda en la auditoría.',
  fieldLabel: 'Edad',
  save: 'Guardar',
  cancel: 'Cancelar',
  saved: 'Mayoría de edad guardada.',
  loadError: 'No pudimos cargar la mayoría de edad.',
  saveError: 'No pudimos guardar la mayoría de edad. Intenta de nuevo.',
  forbiddenTitle: 'Solo administración cambia la mayoría de edad.',
  forbiddenHint: 'La ficha de cada paciente dice si es menor y a quién van sus avisos.',
};

// 44 px bajo `sm` (DESIGN.md, objetivo táctil de móvil).
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-11';

/**
 * Una API anterior a esta pantalla no tiene la ruta: `/patients/settings` cae
 * en `GET /patients/:id` y responde 500 (id que no es UUID), que ya va al
 * `fallback`. El 404 se fija también, para que diga qué no cargó y no
 * «no encontramos lo que buscas».
 */
const loadErrorOptions = { fallback: copy.loadError, byStatus: { 404: copy.loadError } };

/**
 * Ajustes → Mayoría de edad (DX-328): desde qué edad un paciente es adulto en
 * la clínica (18 en una clínica nueva). Solo ADMIN la cambia, en un modal.
 */
export function MajorityAgeSettingsSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [settings, setSettings] = useState<PatientSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(18);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const fieldId = useId();

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getPatientSettings(token)
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, loadErrorOptions));
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
      <div role="status" aria-label="Cargando" className="max-w-2xl rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
    );
  }

  const options = MAJORITY_AGE_OPTIONS.includes(settings.majorityAge)
    ? MAJORITY_AGE_OPTIONS
    : [...MAJORITY_AGE_OPTIONS, settings.majorityAge].sort((a, b) => a - b);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      setSettings(await savePatientSettings(token, { majorityAge: draft }));
      setNotice(copy.saved);
      setOpen(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <UserCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{copy.title}</p>
            <p data-testid="majority-age" className="t-data text-ink tabular-nums">
              {copy.years(settings.majorityAge)}
            </p>
            <p className="mt-1 text-sm text-muted">{copy.hint}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 max-sm:min-h-11 max-sm:w-full"
          onClick={() => {
            setDraft(settings.majorityAge);
            setSaveError(null);
            setNotice('');
            setOpen(true);
          }}
        >
          {copy.change}
        </Button>
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
              <select
                id={fieldId}
                className={fieldClass}
                value={draft}
                onChange={(e) => setDraft(Number(e.target.value))}
                disabled={saving}
              >
                {options.map((age) => (
                  <option key={age} value={age}>
                    {copy.years(age)}
                  </option>
                ))}
              </select>
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
