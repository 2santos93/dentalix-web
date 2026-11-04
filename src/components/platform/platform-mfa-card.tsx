'use client';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { platformInstant } from '@/lib/format/platform-instant';
import {
  getPlatformMfa,
  regeneratePlatformRecoveryCodes,
  type PlatformMfaStatus,
} from '@/lib/platform/platform-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout } from '@/components/ui/callout';
import { SectionHeader } from '@/components/ui/section-header';
import { SectionError } from '@/components/errors/section-error';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';
import { ReauthDialog, RecoveryCodesDialog } from '@/components/profile/mfa-settings';

// La consola de plataforma no tiene sede (E8): los instantes salen en UTC con la palabra «UTC».
const copy = {
  title: 'Verificación en dos pasos',
  description: (date: string) =>
    `Activa desde el ${date}. Se pide al entrar a plataforma y en cada acceso de soporte a una clínica.`,
  // Espera de seguridad tras el alta (SEC-008): quien robe la contraseña no
  // puede enrolar y entrar a una clínica en el acto.
  pendingCooldown: (when: string) =>
    `Por seguridad, podrás usarla para entrar como soporte desde el ${when}. Si no la activaste tú, avisa al equipo de seguridad de Dentalix.`,
  loadError: 'No pudimos saber el estado de tu verificación en dos pasos.',
  codesLabel: 'Códigos de recuperación',
  codesHelp: 'Para entrar si pierdes el móvil. Cada uno sirve una sola vez.',
  codesLeft: (n: number) => (n === 1 ? 'Queda 1' : `Quedan ${n}`),
  codesNone: 'Ninguno',
  codesMissing:
    'No tienes códigos de recuperación: sin el móvil no podrías entrar. Genéralos ahora y guárdalos.',
  codesLow: 'Te quedan pocos códigos de recuperación. Genera unos nuevos antes de quedarte sin ninguno.',
  generate: 'Generar nuevos',
  generateTitle: 'Generar códigos nuevos',
  generateDescription: 'Los códigos anteriores dejarán de servir.',
  generateSubmit: 'Generar',
  generateError: 'No pudimos generar los códigos. Intenta de nuevo.',
};

/**
 * MFA del superadmin en el área de plataforma (SEC-008). DX-021-bis: se activa
 * en el login del apex, así que aquí siempre está activo; se consulta su estado
 * y se renuevan los códigos de recuperación.
 */
export function PlatformMfaCard({ token }: { token: string }) {
  const [status, setStatus] = useState<PlatformMfaStatus | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlatformMfa(token)
      .then((res) => {
        if (cancelled) return;
        setStatus(res);
        setCooldownUntil(
          res.breakGlassAvailableAt && new Date(res.breakGlassAvailableAt).getTime() > Date.now()
            ? res.breakGlassAvailableAt
            : null,
        );
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

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

  if (!status) {
    return <Skeleton className="h-24 w-full" aria-label={copy.title} />;
  }

  const remaining = status.recoveryCodesRemaining;

  return (
    <section aria-labelledby="platform-mfa-title" className="flex flex-col gap-3">
      <SectionHeader
        titleId="platform-mfa-title"
        title={copy.title}
        description={status.enabledAt ? copy.description(platformInstant(status.enabledAt)) : undefined}
      />
      {cooldownUntil ? (
        <Callout tone="warning">{copy.pendingCooldown(platformInstant(cooldownUntil))}</Callout>
      ) : null}
      <SettingRows>
        <SettingRow
          label={copy.codesLabel}
          description={copy.codesHelp}
          value={remaining > 0 ? copy.codesLeft(remaining) : copy.codesNone}
          action={
            <Button type="button" variant="secondary" onClick={() => setRegenerating(true)}>
              {copy.generate}
            </Button>
          }
        />
      </SettingRows>
      {remaining <= 2 ? (
        <Callout tone="warning">{remaining === 0 ? copy.codesMissing : copy.codesLow}</Callout>
      ) : null}
      {regenerating ? (
        <ReauthDialog
          title={copy.generateTitle}
          description={copy.generateDescription}
          submitLabel={copy.generateSubmit}
          errorFallback={copy.generateError}
          onClose={() => setRegenerating(false)}
          onConfirm={async (password, factor) => {
            const codes = await regeneratePlatformRecoveryCodes(token, password, factor);
            setStatus({ ...status, recoveryCodesRemaining: codes.length });
            setRegenerating(false);
            setFreshCodes(codes);
          }}
        />
      ) : null}
      {freshCodes ? (
        <RecoveryCodesDialog codes={freshCodes} onClose={() => setFreshCodes(null)} />
      ) : null}
    </section>
  );
}
