'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { INVITATION_ACCEPTED_PARAM } from '@/lib/auth/password-reset-api';
import { Loader2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPublicInvitation,
  acceptInvitation,
  type PublicInvitation,
} from '@/lib/staff/invitations-api';
import { useAuthStore } from '@/lib/auth/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Verificando invitación…',
  // Sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  loadError: 'No pudimos verificar la invitación.',
  invitedAs: (role: string) => `Te invitaron como ${role}`,
  newUserHint:
    'Crea tu contraseña para activar tu cuenta. Si ya tenías una cuenta sin confirmar, puedes usar tu contraseña de siempre o elegir una nueva (cerraremos las otras sesiones).',
  existingUserHint: 'Ingresa tu contraseña de Dentalix para continuar.',
  forgotPassword: '¿Olvidaste tu contraseña?',
  passwordLabel: 'Contraseña',
  newPasswordHint: 'Mínimo 8 caracteres.',
  submit: 'Aceptar invitación',
  submitting: 'Activando…',
  genericError: 'No pudimos aceptar la invitación. Intenta de nuevo.',
  // 404 al verificar: el enlace no corresponde a ninguna invitación.
  notFound: 'Este enlace de invitación no existe. Revisa que esté completo o pide uno nuevo.',
  // 401 al aceptar con una cuenta existente: la contraseña no coincide.
  wrongPassword: 'La contraseña no es correcta. Usa la de tu cuenta de Dentalix o recupérala.',
  loginLink: 'Inicia sesión',
  expiredTitle: 'Invitación expirada',
  expiredMessage:
    'Este enlace de invitación ya venció. Pide a quien administra tu clínica que te envíe una nueva.',
  usedTitle: 'Invitación ya utilizada',
  usedMessage: 'Este enlace ya se usó para crear una cuenta. Si eres tú, inicia sesión.',
  revokedTitle: 'Invitación revocada',
  revokedMessage:
    'Esta invitación fue revocada. Contacta a quien administra tu clínica si crees que es un error.',
  notFoundTitle: 'Invitación no encontrada',
  notFoundMessage: 'No encontramos esta invitación. Verifica el enlace o solicita uno nuevo.',
};

// Local role labels — same duplication pattern as pending-invitations.tsx,
// staff-view.tsx, profile-view.tsx and user-menu.tsx (no shared constant yet).
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador/a',
  DENTIST: 'Odontólogo/a',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

const INVALID_STATUS_COPY: Record<
  Exclude<PublicInvitation['status'], 'VALID'>,
  { title: string; message: string }
> = {
  EXPIRED: { title: copy.expiredTitle, message: copy.expiredMessage },
  USED: { title: copy.usedTitle, message: copy.usedMessage },
  REVOKED: { title: copy.revokedTitle, message: copy.revokedMessage },
  NOT_FOUND: { title: copy.notFoundTitle, message: copy.notFoundMessage },
};

const ERROR_ID = 'accept-invitation-error';
const HINT_ID = 'accept-invitation-hint';

/**
 * Client form behind `/invitacion/[token]`. Looks up the invitation by its
 * raw token on mount (own loading/error state — this is a network call, not
 * the invitation's own VALID/EXPIRED/USED/REVOKED/NOT_FOUND status, which the
 * endpoint always returns as a 200). Only a `VALID` invitation renders the
 * password form; every other status renders its own explanatory message plus
 * a link back to `/login`, never the form.
 */
export function AcceptInvitationForm({
  inviteToken,
  hostClinicName = null,
}: {
  inviteToken: string;
  /** La clínica que la página ya titula (H1): no se repite aquí. */
  hostClinicName?: string | null;
}) {
  const router = useRouter();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);

  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await getPublicInvitation(inviteToken);
        if (cancelled) return;
        setInvitation(result);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          apiErrorMessage(err, {
            fallback: copy.loadError,
            byStatus: { 404: copy.notFound },
          }),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, reloadKey]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await acceptInvitation(inviteToken, password);
      // DX-021: la cuenta necesita segundo factor: entra por el login.
      if ('loginRequired' in res) {
        router.push(`/login?${INVITATION_ACCEPTED_PARAM}=1`);
        return;
      }
      // El refresh llega en la cookie HttpOnly (DX-062); el access, en memoria.
      setAccessToken(res.accessToken);
      router.push('/patients');
    } catch (err) {
      setSubmitError(
        apiErrorMessage(err, {
          fallback: copy.genericError,
          byStatus: { 401: copy.wrongPassword },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {copy.loading}
      </p>
    );
  }

  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  // Unreachable in practice — loading is false and loadError is null only
  // after the fetch resolved into `invitation`. Narrows the type below.
  if (!invitation) return null;

  if (invitation.status !== 'VALID') {
    const { title, message } = INVALID_STATUS_COPY[invitation.status];
    return (
      <div className="flex flex-col gap-3">
        <h2 className="t-title text-ink">{title}</h2>
        <p className="text-sm text-muted">{message}</p>
        <Link href="/login" className={`self-start ${AUTH_LINK_CLASS}`}>
          {copy.loginLink}
        </Link>
      </div>
    );
  }

  const roleLabel = invitation.role ? (ROLE_LABELS[invitation.role] ?? invitation.role) : null;

  return (
    <form onSubmit={handleSubmit} className={AUTH_FORM_CLASS}>
      <div className="flex flex-col gap-1">
        {invitation.clinicName && invitation.clinicName !== hostClinicName ? (
          <p className="t-title text-ink">{invitation.clinicName}</p>
        ) : null}
        {roleLabel ? <p className="text-sm text-muted">{copy.invitedAs(roleLabel)}</p> : null}
        {invitation.maskedEmail ? (
          <p className="text-sm text-muted">{invitation.maskedEmail}</p>
        ) : null}
        <p className="text-sm text-muted">
          {invitation.requiresCurrentPassword ? copy.existingUserHint : copy.newUserHint}
        </p>
      </div>

      <FormField
        htmlFor="accept-invitation-password"
        label={copy.passwordLabel}
        hint={invitation.requiresCurrentPassword ? undefined : copy.newPasswordHint}
        hintId={HINT_ID}
      >
        <Input
          id="accept-invitation-password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={invitation.requiresCurrentPassword ? 'current-password' : 'new-password'}
          required
          disabled={submitting}
          aria-invalid={submitError ? true : undefined}
          aria-describedby={
            submitError ? ERROR_ID : invitation.requiresCurrentPassword ? undefined : HINT_ID
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>

      {submitError ? (
        <InlineError id={ERROR_ID} variant="summary">
          {submitError}
        </InlineError>
      ) : null}

      {invitation.requiresCurrentPassword ? (
        <Link href="/olvide-contrasena" className={`-mt-2 self-start ${AUTH_LINK_CLASS}`}>
          {copy.forgotPassword}
        </Link>
      ) : null}

      <Button type="submit" size="lg" disabled={submitting} className={AUTH_SUBMIT_CLASS}>
        {submitting ? (
          <>
            <Loader2 className="animate-spin" /> {copy.submitting}
          </>
        ) : (
          copy.submit
        )}
      </Button>
    </form>
  );
}
