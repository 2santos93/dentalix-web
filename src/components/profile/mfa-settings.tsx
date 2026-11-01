'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/client';
import { normalizeTotpCode } from '@/lib/auth/break-glass';
import { loginLockedMessage } from '@/lib/auth/login-lockout';
import {
  confirmMyMfaEnrollment,
  disableMyMfa,
  getMyMfa,
  normalizeRecoveryCode,
  regenerateRecoveryCodes,
  startMyMfaEnrollment,
  type MfaEnrollment,
  type MyMfaStatus,
  type SecondFactor,
} from '@/lib/auth/mfa-api';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { SectionError } from '@/components/errors/section-error';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';
import { MfaSecretPanel } from '@/components/auth/mfa-secret-panel';
import { RecoveryCodesPanel } from '@/components/auth/recovery-codes-panel';

const copy = {
  rowLabel: 'Verificación en dos pasos',
  rowOff: 'Al entrar, además de tu contraseña se pedirá un código de tu móvil.',
  rowOn: 'Se pide al entrar en todas tus clínicas.',
  rowRequired: 'Se pide al entrar en todas tus clínicas. Es obligatoria en tu cuenta.',
  stateOn: 'Activa',
  stateOff: 'Desactivada',
  activate: 'Activar',
  disable: 'Desactivar',
  codesLabel: 'Códigos de recuperación',
  codesHelp: 'Para entrar si pierdes el móvil. Cada uno sirve una sola vez.',
  codesLeft: (n: number) => (n === 1 ? 'Queda 1' : `Quedan ${n}`),
  codesLow: 'Te quedan pocos códigos de recuperación. Genera unos nuevos antes de quedarte sin ninguno.',
  regenerate: 'Generar nuevos',
  loadError: 'No pudimos saber si tienes la verificación en dos pasos activa.',
  passwordLabel: 'Contraseña actual',
  codeLabel: 'Código de la app',
  codeInvalid: 'El código tiene 6 dígitos.',
  recoveryLabel: 'Código de recuperación',
  recoveryInvalid: 'Revisa el código: son 16 letras y números.',
  useRecovery: 'Usar un código de recuperación',
  useApp: 'Usar el código de la app',
  enrollTitle: 'Activar la verificación en dos pasos',
  enrollPasswordDescription: 'Confirma que eres tú para empezar.',
  enrollCodeDescription: 'Añade la cuenta a tu app y escribe el código que muestra.',
  enrollNext: 'Continuar',
  enrollSubmit: 'Activar',
  enrollError: 'No pudimos activar la verificación. Intenta de nuevo.',
  sessionsNote: 'Al activarla se cierran tus demás sesiones abiertas.',
  codesTitle: 'Guarda tus códigos de recuperación',
  codesDescription: 'Son tu forma de entrar si pierdes el móvil.',
  done: 'Listo',
  disableTitle: 'Desactivar la verificación en dos pasos',
  disableDescription:
    'Tu cuenta quedará protegida solo con la contraseña. Se borran tus códigos de recuperación y se cierran tus demás sesiones.',
  disableSubmit: 'Desactivar',
  disableError: 'No pudimos desactivarla. Intenta de nuevo.',
  regenerateTitle: 'Generar códigos nuevos',
  regenerateDescription: 'Los códigos anteriores dejarán de servir.',
  regenerateSubmit: 'Generar',
  regenerateError: 'No pudimos generar los códigos. Intenta de nuevo.',
};

/** 429 → la espera; lo demás, el mensaje de la API (ya claro) o `fallback`. */
function mfaError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds) {
    return loginLockedMessage(err.retryAfterSeconds);
  }
  return apiErrorMessage(err, fallback);
}

/**
 * Mi perfil → «Seguridad» (DX-021): activar o desactivar la verificación en
 * dos pasos y renovar los códigos de recuperación. Secreto y códigos solo
 * viven en el estado del diálogo abierto, nunca en almacenamiento.
 */
export function MfaSettings({ token }: { token: string }) {
  const [status, setStatus] = useState<MyMfaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<'enroll' | 'disable' | 'regenerate' | null>(null);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyMfa(token)
      .then((res) => {
        if (cancelled) return;
        setStatus(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
    // `reloadKey`, no `token`: activar/desactivar renueva el token y el estado ya está al día.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

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
  if (!status) return <Skeleton className="h-20 w-full" aria-label={copy.rowLabel} />;

  return (
    <>
      <SettingRows>
        <SettingRow
          label={copy.rowLabel}
          description={
            !status.enabled
              ? copy.rowOff
              : status.required
                ? copy.rowRequired
                : copy.rowOn
          }
          value={status.enabled ? copy.stateOn : copy.stateOff}
          action={
            !status.enabled ? (
              <Button type="button" variant="secondary" onClick={() => setDialog('enroll')}>
                {copy.activate}
              </Button>
            ) : status.required ? null : (
              <Button type="button" variant="secondary" onClick={() => setDialog('disable')}>
                {copy.disable}
              </Button>
            )
          }
        />
        {status.enabled ? (
          <SettingRow
            label={copy.codesLabel}
            description={copy.codesHelp}
            value={copy.codesLeft(status.recoveryCodesRemaining)}
            action={
              <Button type="button" variant="secondary" onClick={() => setDialog('regenerate')}>
                {copy.regenerate}
              </Button>
            }
          />
        ) : null}
      </SettingRows>
      {status.enabled && status.recoveryCodesRemaining <= 2 ? (
        <Callout tone="warning" className="mt-3">
          {copy.codesLow}
        </Callout>
      ) : null}

      {dialog === 'enroll' ? (
        <EnrollDialog
          token={token}
          onClose={() => setDialog(null)}
          onEnabled={(res, codes) => {
            setStatus(res);
            setDialog(null);
            setFreshCodes(codes);
          }}
        />
      ) : null}
      {dialog === 'disable' ? (
        <ReauthDialog
          title={copy.disableTitle}
          description={copy.disableDescription}
          submitLabel={copy.disableSubmit}
          errorFallback={copy.disableError}
          onClose={() => setDialog(null)}
          onConfirm={async (password, factor) => {
            await disableMyMfa(token, password, factor);
            setStatus({ ...status, enabled: false, enabledAt: null, recoveryCodesRemaining: 0 });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'regenerate' ? (
        <ReauthDialog
          title={copy.regenerateTitle}
          description={copy.regenerateDescription}
          submitLabel={copy.regenerateSubmit}
          errorFallback={copy.regenerateError}
          onClose={() => setDialog(null)}
          onConfirm={async (password, factor) => {
            const codes = await regenerateRecoveryCodes(token, password, factor);
            setStatus({ ...status, recoveryCodesRemaining: codes.length });
            setDialog(null);
            setFreshCodes(codes);
          }}
        />
      ) : null}
      {freshCodes ? (
        <RecoveryCodesDialog codes={freshCodes} onClose={() => setFreshCodes(null)} />
      ) : null}
    </>
  );
}

function PasswordField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <FormField htmlFor="mfa-password" label={copy.passwordLabel}>
      <Input
        id="mfa-password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

function TotpField({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error: string | null;
}) {
  return (
    <FormField htmlFor="mfa-code" label={copy.codeLabel} error={error}>
      <Input
        id="mfa-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        required
        disabled={disabled}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId('mfa-code') : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="tabular-nums tracking-widest"
      />
    </FormField>
  );
}

function EnrollDialog({
  token,
  onClose,
  onEnabled,
}: {
  token: string;
  onClose: () => void;
  onEnabled: (status: MyMfaStatus, codes: string[]) => void;
}) {
  const [password, setPassword] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = normalizeTotpCode(code);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (enrollment) {
      setTouched(true);
      if (!normalized) return;
    }
    setSubmitting(true);
    try {
      if (!enrollment) {
        setEnrollment(await startMyMfaEnrollment(token, password));
        setPassword('');
      } else {
        const res = await confirmMyMfaEnrollment(token, normalized!);
        onEnabled(
          {
            enabled: res.enabled,
            enabledAt: res.enabledAt,
            recoveryCodesRemaining: res.recoveryCodesRemaining,
            required: res.required,
          },
          res.recoveryCodes,
        );
      }
    } catch (err) {
      setError(mfaError(err, copy.enrollError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.enrollTitle}
      description={enrollment ? copy.enrollCodeDescription : copy.enrollPasswordDescription}
      onSubmit={handleSubmit}
      submitLabel={enrollment ? copy.enrollSubmit : copy.enrollNext}
      submitting={submitting}
      error={error}
    >
      {enrollment ? (
        <>
          <MfaSecretPanel secret={enrollment.secret} otpauthUri={enrollment.otpauthUri} />
          <TotpField
            value={code}
            onChange={setCode}
            disabled={submitting}
            error={touched && !normalized ? copy.codeInvalid : null}
          />
          <p className="text-xs text-muted">{copy.sessionsNote}</p>
        </>
      ) : (
        <PasswordField value={password} onChange={setPassword} disabled={submitting} />
      )}
    </FormModal>
  );
}

/** Contraseña + segundo factor: lo que pide la API para desactivar o regenerar. */
function ReauthDialog({
  title,
  description,
  submitLabel,
  errorFallback,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  submitLabel: string;
  errorFallback: string;
  onClose: () => void;
  onConfirm: (password: string, factor: SecondFactor) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = useRecovery ? normalizeRecoveryCode(value) : normalizeTotpCode(value);
  const fieldError =
    touched && !normalized ? (useRecovery ? copy.recoveryInvalid : copy.codeInvalid) : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!normalized) return;
    setSubmitting(true);
    try {
      await onConfirm(
        password,
        useRecovery ? { recoveryCode: normalized } : { code: normalized },
      );
    } catch (err) {
      setError(mfaError(err, errorFallback));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
      submitting={submitting}
      error={error}
    >
      <PasswordField value={password} onChange={setPassword} disabled={submitting} />
      {useRecovery ? (
        <FormField htmlFor="mfa-recovery" label={copy.recoveryLabel} error={fieldError}>
          <Input
            id="mfa-recovery"
            name="recoveryCode"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            required
            disabled={submitting}
            value={value}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? fieldErrorId('mfa-recovery') : undefined}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
          />
        </FormField>
      ) : (
        <TotpField value={value} onChange={setValue} disabled={submitting} error={fieldError} />
      )}
      <Button
        type="button"
        variant="link"
        className="self-start px-0"
        onClick={() => {
          setUseRecovery((v) => !v);
          setValue('');
          setTouched(false);
        }}
      >
        {useRecovery ? copy.useApp : copy.useRecovery}
      </Button>
    </FormModal>
  );
}

/** Se muestran una sola vez: el diálogo no se cierra sin confirmar que se guardaron. */
function RecoveryCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <FormModal
      open
      onOpenChange={(open) => {
        if (!open && saved) onClose();
      }}
      title={copy.codesTitle}
      description={copy.codesDescription}
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      submitLabel={copy.done}
      submitDisabled={!saved}
    >
      <RecoveryCodesPanel codes={codes} saved={saved} onSavedChange={setSaved} />
    </FormModal>
  );
}
