'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getPublicInvitation,
  acceptInvitation,
  type PublicInvitation,
} from '@/lib/staff/invitations-api';
import { useAuthStore } from '@/lib/auth/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/molecules/form-field';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Verificando invitación…',
  // Sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  loadError: 'No pudimos verificar la invitación.',
  invitedAs: (role: string) => `Te invitaron como ${role}`,
  newUserHint: 'Crea tu contraseña para activar tu cuenta.',
  existingUserHint: 'Ingresa tu contraseña de Dentalix para continuar.',
  passwordLabel: 'Contraseña',
  submit: 'Aceptar invitación',
  submitting: 'Activando…',
  genericError: 'No pudimos aceptar la invitación. Intenta de nuevo.',
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

/**
 * Client form behind `/invitacion/[token]`. Looks up the invitation by its
 * raw token on mount (own loading/error state — this is a network call, not
 * the invitation's own VALID/EXPIRED/USED/REVOKED/NOT_FOUND status, which the
 * endpoint always returns as a 200). Only a `VALID` invitation renders the
 * password form; every other status renders its own explanatory message plus
 * a link back to `/login`, never the form.
 */
export function AcceptInvitationForm({ inviteToken }: { inviteToken: string }) {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);

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
        setLoadError(err instanceof ApiError ? err.message : copy.loadError);
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
      setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      router.push('/patients');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">{copy.loading}</p>;
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
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-sm text-muted">{message}</p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          {copy.loginLink}
        </Link>
      </div>
    );
  }

  const roleLabel = invitation.role ? (ROLE_LABELS[invitation.role] ?? invitation.role) : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {invitation.clinicName ? (
          <p className="font-medium text-ink">{invitation.clinicName}</p>
        ) : null}
        {roleLabel ? <p className="text-sm text-muted">{copy.invitedAs(roleLabel)}</p> : null}
        {invitation.maskedEmail ? (
          <p className="text-sm text-muted">{invitation.maskedEmail}</p>
        ) : null}
        <p className="text-sm text-muted">
          {invitation.userExists ? copy.existingUserHint : copy.newUserHint}
        </p>
      </div>

      <FormField htmlFor="accept-invitation-password" label={copy.passwordLabel}>
        <Input
          id="accept-invitation-password"
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
          disabled={submitting}
          aria-invalid={submitError ? true : undefined}
          aria-describedby={submitError ? ERROR_ID : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>

      {submitError ? (
        <InlineError id={ERROR_ID} variant="summary">
          {submitError}
        </InlineError>
      ) : null}

      <Button type="submit" size="lg" disabled={submitting} className="mt-1 w-full">
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
