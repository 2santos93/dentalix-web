'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getCashSettings,
  saveCashSettings,
  type CashSettings,
} from '@/lib/cash-sessions/cash-sessions-api';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const copy = {
  requireTitle: 'Exigir caja abierta',
  requireHint:
    'Sin la caja abierta en la sede, no se puede registrar un abono en efectivo. Los demás métodos siguen igual.',
  blindTitle: 'Arqueo ciego',
  blindHint:
    'Al cerrar, recepción cuenta por moneda y método antes de ver lo esperado. Administración lo ve siempre.',
  save: 'Guardar',
  saved: 'Ajustes de caja guardados.',
  loadError: 'No pudimos cargar los ajustes de caja.',
  saveError: 'No pudimos guardar los ajustes de caja. Intenta de nuevo.',
  forbiddenTitle: 'Solo administración cambia los ajustes de caja.',
  forbiddenHint: 'Recepción abre y cierra su caja desde Caja → Turnos.',
};

interface CashSettingsFormProps {
  token: string;
  /** Solo ADMIN los cambia (la API lo exige también). */
  allowed: boolean;
}

/**
 * Ajustes → Caja (DX-027): «exigir caja abierta» y «arqueo ciego» de la
 * clínica. Los dos nacen desactivados: el comportamiento de antes de la caja
 * por turno.
 */
export function CashSettingsForm({ token, allowed }: CashSettingsFormProps) {
  const [settings, setSettings] = useState<CashSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getCashSettings(token)
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
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (!settings) {
    return (
      <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-56" />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    setNotice('');
    try {
      setSettings(await saveCashSettings(token, settings));
      setNotice(copy.saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
      <div className="divide-y divide-hairline rounded-xl border border-border bg-surface">
        <SettingSwitch
          title={copy.requireTitle}
          hint={copy.requireHint}
          checked={settings.requireOpenSession}
          disabled={saving}
          onChange={(requireOpenSession) => setSettings({ ...settings, requireOpenSession })}
        />
        <SettingSwitch
          title={copy.blindTitle}
          hint={copy.blindHint}
          checked={settings.blindClose}
          disabled={saving}
          onChange={(blindClose) => setSettings({ ...settings, blindClose })}
        />
      </div>
      {saveError ? <InlineError>{saveError}</InlineError> : null}
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      <Button type="submit" loading={saving} className="self-start max-sm:w-full">
        {copy.save}
      </Button>
    </form>
  );
}

function SettingSwitch({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <p id={`${id}-title`} className="font-medium text-ink">
          {title}
        </p>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-bg',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
