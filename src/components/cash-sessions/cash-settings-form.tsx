'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { SettingRows } from '@/components/settings/settings-page';

const copy = {
  requireTitle: 'Exigir caja abierta',
  requireHint:
    'Sin la caja abierta en la sede, no se puede registrar un abono en efectivo. Los demás métodos siguen igual.',
  blindTitle: 'Arqueo ciego',
  blindHint:
    'Al cerrar, recepción cuenta por moneda y método antes de ver lo esperado. Administración lo ve siempre.',
  saving: 'Guardando…',
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

type SettingKey = 'requireOpenSession' | 'blindClose';

/**
 * Ajustes → Caja (DX-027): «exigir caja abierta» y «arqueo ciego» de la
 * clínica. Los dos nacen desactivados: el comportamiento de antes de la caja
 * por turno.
 *
 * Un solo modelo de guardado: cada interruptor se aplica al momento (DESIGN.md
 * → Switch), sin botón «Guardar» que pueda quedarse a medias ni un primario
 * apagado. Si la API falla, el interruptor vuelve a su sitio y se dice aquí.
 */
export function CashSettingsForm({ token, allowed }: CashSettingsFormProps) {
  const [settings, setSettings] = useState<CashSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState<SettingKey | null>(null);
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

  async function change(key: SettingKey, value: boolean) {
    if (!settings) return;
    const before = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(key);
    setSaveError(null);
    setNotice('');
    try {
      setSettings(await saveCashSettings(token, next));
      setNotice(copy.saved);
    } catch (err) {
      setSettings(before);
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(null);
    }
  }

  const rows: { key: SettingKey; title: string; hint: string }[] = [
    { key: 'requireOpenSession', title: copy.requireTitle, hint: copy.requireHint },
    { key: 'blindClose', title: copy.blindTitle, hint: copy.blindHint },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SettingRows>
        {rows.map((row) => (
          <Switch
            key={row.key}
            checked={settings[row.key]}
            disabled={saving !== null}
            aria-busy={saving === row.key || undefined}
            onChange={(e) => void change(row.key, e.target.checked)}
            label={<span className="font-medium">{row.title}</span>}
            description={<span className="text-sm">{row.hint}</span>}
            className="flex-row-reverse justify-between gap-4 px-4 py-4 sm:px-6 pointer-coarse:py-4"
          />
        ))}
      </SettingRows>
      {saveError ? <InlineError>{saveError}</InlineError> : null}
      <p role="status" className={notice || saving ? 'text-sm text-muted' : 'sr-only'}>
        {saving ? copy.saving : notice}
      </p>
    </div>
  );
}
