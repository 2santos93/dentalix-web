'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getSecurityPolicy, updateSecurityPolicy } from '@/lib/auth/mfa-api';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';

const copy = {
  label: 'Exigir verificación en dos pasos a los administradores',
  hint: 'Quien no la tenga deberá activarla la próxima vez que inicie sesión. Las sesiones abiertas no se cierran.',
  notAllowed: 'Solo la administración ve y cambia la seguridad de la clínica.',
  loadError: 'No pudimos cargar el ajuste',
  saveError: 'No pudimos cambiar el ajuste.',
  savedOn: 'Ahora los administradores necesitan la verificación en dos pasos.',
  savedOff: 'La verificación en dos pasos ya no es obligatoria para los administradores.',
};

/** Política de seguridad de la clínica (DX-021). Se aplica al momento: Switch. */
export function ClinicSecuritySettings({ token, allowed }: { token: string; allowed: boolean }) {
  const [required, setRequired] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getSecurityPolicy(token)
      .then((res) => {
        if (cancelled) return;
        setRequired(res.requireAdminMfa);
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
      const saved = await updateSecurityPolicy(token, { requireAdminMfa: next });
      setRequired(saved.requireAdminMfa);
      toast.success(saved.requireAdminMfa ? copy.savedOn : copy.savedOff);
    } catch (err) {
      // 409: sin verificación propia; el mensaje de la API dice dónde activarla.
      notifyError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return <Callout tone="info">{copy.notAllowed}</Callout>;
  if (loadError) {
    return (
      <FieldError
        label={copy.loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        className="h-11 w-full sm:w-auto"
      />
    );
  }
  if (required === null) return <Skeleton className="h-20 w-full" />;

  return (
    <SettingRows>
      <SettingRow label={copy.label} description={copy.hint} inline>
        <Switch
          aria-label={copy.label}
          checked={required}
          disabled={saving}
          onChange={(e) => void toggle(e.target.checked)}
        />
      </SettingRow>
    </SettingRows>
  );
}
