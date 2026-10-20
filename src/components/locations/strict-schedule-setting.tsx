'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getProviderScheduleSettings,
  updateProviderScheduleSettings,
} from '@/lib/locations/provider-schedule-api';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { Skeleton } from '@/components/ui/skeleton';

const copy = {
  label: 'Modo estricto: no permitir citas fuera del horario del profesional',
  hint: 'Desactivado (por defecto), la cita se agenda y se avisa a quien la crea. Activado, se rechaza.',
  onReadOnly: 'Modo estricto activado: no se pueden agendar citas fuera del horario del profesional.',
  offReadOnly: 'Se puede citar fuera del horario del profesional; la agenda lo avisa.',
  loadError: 'No pudimos cargar el ajuste',
  saveError: 'No pudimos cambiar el modo estricto.',
  savedOn: 'Modo estricto activado.',
  savedOff: 'Modo estricto desactivado.',
};

/** Ajuste de clínica del DX-233: aviso (defecto) o 409 fuera de horario. */
export function StrictScheduleSetting({ token, canEdit }: { token: string; canEdit: boolean }) {
  const [strict, setStrict] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProviderScheduleSettings(token)
      .then((s) => {
        if (cancelled) return;
        setStrict(s.strictProviderSchedule);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      const saved = await updateProviderScheduleSettings(token, { strictProviderSchedule: next });
      setStrict(saved.strictProviderSchedule);
      toast.success(saved.strictProviderSchedule ? copy.savedOn : copy.savedOff);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.saveError), { onRetry: () => void toggle(next) });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <FieldError
        label={copy.loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        className="h-11 w-full sm:w-auto"
      />
    );
  }
  if (strict === null) return <Skeleton className="h-11 w-full max-w-md" />;

  if (!canEdit) {
    return <p className="text-sm text-muted">{strict ? copy.onReadOnly : copy.offReadOnly}</p>;
  }

  return (
    <label className="flex max-w-prose items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
        checked={strict}
        disabled={saving}
        aria-describedby="strict-schedule-hint"
        onChange={(e) => void toggle(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-ink">{copy.label}</span>
        <span id="strict-schedule-hint" className="text-xs text-muted">
          {copy.hint}
        </span>
      </span>
    </label>
  );
}
