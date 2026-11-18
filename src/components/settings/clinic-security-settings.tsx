'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getSecurityPolicy, updateSecurityPolicy, type SecurityPolicy } from '@/lib/auth/mfa-api';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
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
  // DX-137
  idleLabel: 'Cierre de sesión por inactividad',
  idleHint: 'Si nadie usa la pantalla durante este tiempo, la sesión se cierra y hay que volver a entrar.',
  idleValue: (m: number) => (m % 60 === 0 ? `${m / 60} ${m === 60 ? 'hora' : 'horas'}` : `${m} minutos`),
  idleChange: 'Cambiar',
  idleChangeLabel: 'Cambiar el cierre de sesión por inactividad',
  idleTitle: 'Cierre de sesión por inactividad',
  idleDescription:
    'Se aplica a todo el equipo en esta clínica. En recepción, donde el ordenador se comparte, conviene un tiempo corto.',
  idleField: 'Cerrar la sesión tras',
  idleSaved: (m: string) => `Listo: la sesión se cerrará tras ${m} sin uso.`,
  idleSaveError: 'No pudimos cambiar el cierre por inactividad. Intenta de nuevo.',
};

/** DX-137: valores que se ofrecen (la API acepta 15–240 min). */
const IDLE_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const;
const IDLE_DEFAULT = 60;

/** Política de seguridad de la clínica (DX-021). Se aplica al momento: Switch. */
export function ClinicSecuritySettings({ token, allowed }: { token: string; allowed: boolean }) {
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
  const [idleDraft, setIdleDraft] = useState(IDLE_DEFAULT);
  const [idleSaving, setIdleSaving] = useState(false);
  const [idleError, setIdleError] = useState<string | null>(null);

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

  async function saveIdle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!policy) return;
    setIdleSaving(true);
    setIdleError(null);
    try {
      const next = await updateSecurityPolicy(token, {
        requireAdminMfa: policy.requireAdminMfa,
        requireAllMfa: policy.requireAllMfa,
        sessionIdleMinutes: idleDraft,
      });
      setPolicy(next);
      setIdleOpen(false);
      toast.success(copy.idleSaved(copy.idleValue(next.sessionIdleMinutes ?? idleDraft)));
    } catch (err) {
      setIdleError(apiErrorMessage(err, copy.idleSaveError));
    } finally {
      setIdleSaving(false);
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
  const idleMinutes = policy.sessionIdleMinutes ?? IDLE_DEFAULT;

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
      <SettingRow
        label={copy.idleLabel}
        description={copy.idleHint}
        value={copy.idleValue(idleMinutes)}
        isDefault={idleMinutes === IDLE_DEFAULT}
        action={
          <Button
            type="button"
            variant="secondary"
            aria-label={copy.idleChangeLabel}
            onClick={() => {
              setIdleDraft(idleMinutes);
              setIdleError(null);
              setIdleOpen(true);
            }}
          >
            {copy.idleChange}
          </Button>
        }
      />
      <FormModal
        open={idleOpen}
        onOpenChange={setIdleOpen}
        title={copy.idleTitle}
        description={copy.idleDescription}
        onSubmit={(e) => void saveIdle(e)}
        submitting={idleSaving}
        error={idleError}
        fullScreenOnMobile={false}
      >
        <FormField htmlFor="session-idle-minutes" label={copy.idleField}>
          <NativeSelect
            id="session-idle-minutes"
            value={String(idleDraft)}
            onChange={(e) => setIdleDraft(Number(e.target.value))}
          >
            {IDLE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {copy.idleValue(m)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </FormModal>
    </SettingRows>
  );
}
