'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { normalizeTotpCode } from '@/lib/auth/break-glass';
import {
  confirmPlatformMfa,
  getPlatformMfa,
  groupSecret,
  startPlatformMfaEnrollment,
  type PlatformMfaEnrollment,
  type PlatformMfaStatus,
} from '@/lib/platform/platform-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';

const copy = {
  title: 'Verificación en dos pasos',
  offDescription:
    'Obligatoria para entrar como soporte a una clínica. Sin ella, el acceso a las clínicas queda bloqueado.',
  onDescription: (date: string) => `Activa desde el ${date}. Se pide en cada acceso de soporte a una clínica.`,
  // Espera de seguridad tras el alta (SEC-008): quien robe la contraseña no
  // puede enrolar y entrar a una clínica en el acto.
  pendingCooldown: (when: string) =>
    `Por seguridad, podrás usarla para entrar como soporte desde el ${when}. Si no la activaste tú, avisa al equipo de seguridad de Dentalix.`,
  activate: 'Activar',
  starting: 'Preparando…',
  loadError: 'No pudimos saber si tienes la verificación en dos pasos activa.',
  startError: 'No pudimos empezar la activación.',
  modalTitle: 'Activar la verificación en dos pasos',
  modalDescription:
    'Añade la cuenta en tu app de autenticación (Google Authenticator, 1Password, Authy…) y escribe el código que muestra.',
  secretLabel: 'Clave para la app',
  secretHint: 'Si la app no abre el enlace, escribe esta clave a mano (tipo «basada en tiempo»).',
  openInApp: 'Abrir en la app de autenticación',
  codeLabel: 'Código de la app',
  codeInvalid: 'El código tiene 6 dígitos.',
  submit: 'Activar',
  confirmError: 'No pudimos activar la verificación. Intenta de nuevo.',
  done: 'Verificación en dos pasos activada.',
};

/**
 * Alta del MFA (TOTP) del superadmin en el área de plataforma (SEC-008): es
 * obligatorio para el acceso de soporte a una clínica. Dos pasos contra la
 * API: «Activar» pide un secreto nuevo y abre el modal con la clave y el
 * enlace `otpauth://`; el modal lo confirma con un código de la app. El
 * secreto solo vive en el estado del modal (nunca en almacenamiento).
 */
export function PlatformMfaCard({ token }: { token: string }) {
  const [status, setStatus] = useState<PlatformMfaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [enrollment, setEnrollment] = useState<PlatformMfaEnrollment | null>(null);
  const [justEnabled, setJustEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlatformMfa(token)
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
  }, [token, reloadKey]);

  async function handleStart() {
    setStarting(true);
    try {
      setEnrollment(await startPlatformMfaEnrollment(token));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.startError), { onRetry: () => void handleStart() });
    } finally {
      setStarting(false);
    }
  }

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

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <ShieldCheck
          aria-hidden
          className={status.enabled ? 'mt-0.5 size-5 shrink-0 text-success-text' : 'mt-0.5 size-5 shrink-0 text-warning-text'}
        />
        <div className="min-w-0">
          <h2 className="font-medium text-ink">{copy.title}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {status.enabled && status.enabledAt
              ? copy.onDescription(formatDate(status.enabledAt))
              : copy.offDescription}
          </p>
          {status.enabled &&
          status.breakGlassAvailableAt &&
          new Date(status.breakGlassAvailableAt).getTime() > Date.now() ? (
            <p className="mt-1 text-sm text-warning-text">
              {copy.pendingCooldown(formatDateTime(status.breakGlassAvailableAt))}
            </p>
          ) : null}
          {justEnabled ? (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success-text">
              <CheckCircle2 className="size-4" aria-hidden /> {copy.done}
            </p>
          ) : null}
        </div>
      </div>
      {status.enabled ? null : (
        <Button type="button" onClick={() => void handleStart()} loading={starting} className="w-full sm:w-auto">
          {starting ? copy.starting : copy.activate}
        </Button>
      )}
      {enrollment ? (
        <EnrollMfaModal
          token={token}
          enrollment={enrollment}
          onClose={() => setEnrollment(null)}
          onEnabled={(next) => {
            setStatus(next);
            setJustEnabled(true);
            setEnrollment(null);
          }}
        />
      ) : null}
    </Card>
  );
}

function EnrollMfaModal({
  token,
  enrollment,
  onClose,
  onEnabled,
}: {
  token: string;
  enrollment: PlatformMfaEnrollment;
  onClose: () => void;
  onEnabled: (status: PlatformMfaStatus) => void;
}) {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = normalizeTotpCode(code);
  const codeError = touched && !normalized ? copy.codeInvalid : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!normalized) return;
    setSubmitting(true);
    setError(null);
    try {
      onEnabled(await confirmPlatformMfa(token, normalized));
    } catch (err) {
      setError(apiErrorMessage(err, copy.confirmError));
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
      title={copy.modalTitle}
      description={copy.modalDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-ink">{copy.secretLabel}</p>
        <code
          data-testid="mfa-secret"
          className="block select-all break-all rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm tracking-wider text-ink"
        >
          {groupSecret(enrollment.secret)}
        </code>
        <p className="text-xs text-muted">{copy.secretHint}</p>
        <a
          href={enrollment.otpauthUri}
          className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {copy.openInApp}
        </a>
      </div>
      <FormField htmlFor="platform-mfa-code" label={copy.codeLabel} error={codeError}>
        <Input
          id="platform-mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          value={code}
          disabled={submitting}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? fieldErrorId('platform-mfa-code') : undefined}
          onChange={(e) => setCode(e.target.value)}
          className="tabular-nums tracking-widest"
        />
      </FormField>
    </FormModal>
  );
}
