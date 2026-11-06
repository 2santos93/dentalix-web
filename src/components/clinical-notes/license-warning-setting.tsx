'use client';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getClinicalEntrySettings,
  updateClinicalEntrySettings,
} from '@/lib/patients/clinical-api';
import { EmptyState } from '@/components/shared/empty-state';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { SettingRows } from '@/components/settings/settings-page';

const copy = {
  label: 'Avisar al firmar una evolución sin registro profesional',
  hint: 'Antes y después de guardar, quien firma sin número de registro profesional en su ficha de Personal ve un aviso. No impide guardar. Cada evolución conserva el registro que su autor tenía al firmarla.',
  loadError: 'No pudimos cargar el aviso',
  saveError: 'No pudimos cambiar el aviso de registro profesional.',
  savedOn: 'Aviso de registro profesional activado.',
  savedOff: 'Aviso de registro profesional desactivado.',
  forbiddenTitle: 'Solo administración cambia este aviso.',
  forbiddenHint: 'Si la clínica lo activa, «Nueva evolución» avisa cuando firmas sin registro profesional.',
};

/**
 * Ajustes → Historia clínica (DX-540): la clínica decide si avisa al firmar
 * una evolución sin registro profesional. Desactivado de fábrica; ninguna
 * regla lo deduce del país. Se aplica al momento (Switch, sin «Guardar»),
 * como el modo estricto de la agenda.
 */
export function LicenseWarningSettingSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getClinicalEntrySettings(token)
      .then((s) => {
        if (cancelled) return;
        setEnabled(s.warnMissingProfessionalLicense);
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
      const saved = await updateClinicalEntrySettings(token, { warnMissingProfessionalLicense: next });
      setEnabled(saved.warnMissingProfessionalLicense);
      toast.success(saved.warnMissingProfessionalLicense ? copy.savedOn : copy.savedOff);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.saveError), { onRetry: () => void toggle(next) });
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />;
  }
  if (loadError) {
    return (
      <FieldError
        label={copy.loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        className="h-20 w-full"
      />
    );
  }
  if (enabled === null) return <Skeleton className="h-20 w-full" />;

  return (
    <SettingRows>
      <div className="px-4 py-3 sm:px-6 sm:py-4">
        <Switch
          className="max-w-prose"
          checked={enabled}
          disabled={saving}
          onChange={(e) => void toggle(e.target.checked)}
          label={copy.label}
          description={copy.hint}
        />
      </div>
    </SettingRows>
  );
}
