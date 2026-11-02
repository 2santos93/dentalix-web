'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getSecurityPolicy, updateSecurityPolicy, type SecurityPolicy } from '@/lib/auth/mfa-api';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';

const copy = {
  label: 'Exigir verificación en dos pasos a los administradores',
  hint: 'Quien no la tenga deberá activarla para volver a entrar: su sesión abierta se cierra.',
  allLabel: 'Exigirla a todo el equipo',
  allHint: 'Incluye a los administradores. Quien no la tenga deberá activarla para volver a entrar: su sesión abierta se cierra.',
  notAllowed: 'Solo la administración ve y cambia la seguridad de la clínica.',
  loadError: 'No pudimos cargar el ajuste',
  saveError: 'No pudimos cambiar el ajuste.',
  savedOn: 'Ahora los administradores necesitan la verificación en dos pasos.',
  savedOff: 'La verificación en dos pasos ya no es obligatoria para los administradores.',
  savedAllOn: 'Ahora todo el equipo necesita la verificación en dos pasos.',
  savedAllOff: 'La verificación en dos pasos ya no es obligatoria para todo el equipo.',
};

/** Política de seguridad de la clínica (DX-021). Se aplica al momento: Switch. */
export function ClinicSecuritySettings({ token, allowed }: { token: string; allowed: boolean }) {
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getSecurityPolicy(token)
      .then((res) => {
        if (cancelled) return;
        setPolicy(res);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  async function save(next: SecurityPolicy, message: string) {
    setSaving(true);
    try {
      setPolicy(await updateSecurityPolicy(token, next));
      toast.success(message);
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
  if (policy === null) return <Skeleton className="h-20 w-full" />;
  const all = policy.requireAllMfa === true;

  return (
    <SettingRows>
      <SettingRow label={copy.label} description={copy.hint} inline>
        <Switch
          aria-label={copy.label}
          checked={policy.requireAdminMfa}
          disabled={saving || all}
          onChange={(e) =>
            void save(
              { requireAdminMfa: e.target.checked, requireAllMfa: false },
              e.target.checked ? copy.savedOn : copy.savedOff,
            )
          }
        />
      </SettingRow>
      <SettingRow label={copy.allLabel} description={copy.allHint} inline>
        <Switch
          aria-label={copy.allLabel}
          checked={all}
          disabled={saving}
          onChange={(e) =>
            void save(
              { requireAdminMfa: policy.requireAdminMfa, requireAllMfa: e.target.checked },
              e.target.checked ? copy.savedAllOn : copy.savedAllOff,
            )
          }
        />
      </SettingRow>
    </SettingRows>
  );
}
