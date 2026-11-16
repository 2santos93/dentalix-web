'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getOrthoSettings, updateOrthoSettings, type OrthoSettings } from '@/lib/ortho/ortho-api';
import { EmptyState } from '@/components/shared/empty-state';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SettingRows, SettingsSection } from '@/components/settings/settings-page';

export const orthoSettingsCopy = {
  moduleTitle: 'Módulo de ortodoncia',
  enabled: 'Usar la ortodoncia en esta clínica',
  enabledHint:
    'Añade la pestaña «Ortodoncia» a la ficha del paciente y la lista de pacientes atrasados o sin próxima cita en Pacientes.',
  gaugesTitle: 'Calibres de arco',
  gaugesDescription: 'Los que ofrece «Registrar control». Un control guardado conserva el calibre elegido aunque lo quites.',
  gauges: 'Un calibre por línea',
  gaugesHint: 'Por ejemplo 0.016 o 0.016x0.022. Entre 1 y 40, sin repetir.',
  saveGauges: 'Guardar calibres',
  loadError: 'No pudimos cargar los ajustes de ortodoncia',
  saveError: 'No pudimos guardar los ajustes de ortodoncia.',
  savedOn: 'Ortodoncia activada.',
  savedOff: 'Ortodoncia desactivada.',
  savedGauges: 'Calibres guardados.',
  forbiddenTitle: 'Solo administración cambia los ajustes de ortodoncia.',
  forbiddenHint: 'Si la clínica la activa, verás la pestaña «Ortodoncia» en la ficha del paciente.',
};
const copy = orthoSettingsCopy;

const parseGauges = (text: string) =>
  text
    .split('\n')
    .map((g) => g.trim())
    .filter((g) => g !== '');

/** Ajustes › Ortodoncia (DX-190): activar el módulo y la lista de calibres. Solo ADMIN. */
export function OrthoSettingsSection({ token, allowed }: { token: string; allowed: boolean }) {
  const ids = useId();
  const [settings, setSettings] = useState<OrthoSettings | null>(null);
  const [gaugesText, setGaugesText] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [gaugesError, setGaugesError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getOrthoSettings(token)
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setGaugesText(s.wireGauges.join('\n'));
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      const saved = await updateOrthoSettings(token, { enabled: next });
      setSettings(saved);
      toast.success(saved.enabled ? copy.savedOn : copy.savedOff);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.saveError), { onRetry: () => void toggle(next) });
    } finally {
      setSaving(false);
    }
  }

  async function saveGauges(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setGaugesError(null);
    try {
      const saved = await updateOrthoSettings(token, { wireGauges: parseGauges(gaugesText) });
      setSettings(saved);
      setGaugesText(saved.wireGauges.join('\n'));
      toast.success(copy.savedGauges);
    } catch (err) {
      setGaugesError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />;
  }
  if (loadError) {
    return <FieldError label={copy.loadError} onRetry={() => setReloadKey((k) => k + 1)} className="h-20 w-full" />;
  }
  if (settings === null) return <Skeleton className="h-40 w-full" />;

  return (
    <>
      <SettingsSection title={copy.moduleTitle}>
        <SettingRows>
          <div className="px-4 py-3 sm:px-6 sm:py-4">
            <Switch
              className="max-w-prose"
              checked={settings.enabled}
              disabled={saving}
              onChange={(e) => void toggle(e.target.checked)}
              label={copy.enabled}
              description={copy.enabledHint}
            />
          </div>
        </SettingRows>
      </SettingsSection>
      <SettingsSection title={copy.gaugesTitle} description={copy.gaugesDescription}>
        <form onSubmit={(e) => void saveGauges(e)} noValidate className="flex flex-col gap-3">
          <SettingRows>
            <div className="px-4 py-3 sm:px-6 sm:py-4">
              <FormField htmlFor={`${ids}-gauges`} label={copy.gauges} hint={copy.gaugesHint} error={gaugesError}>
                <Textarea
                  id={`${ids}-gauges`}
                  rows={6}
                  autoGrow
                  className="t-data max-w-md"
                  value={gaugesText}
                  onChange={(e) => setGaugesText(e.target.value)}
                />
              </FormField>
            </div>
          </SettingRows>
          <Button type="submit" disabled={saving} className="w-full sm:w-auto sm:self-start">
            {copy.saveGauges}
          </Button>
        </form>
      </SettingsSection>
    </>
  );
}
