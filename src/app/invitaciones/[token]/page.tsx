'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import {
  getPublicInvitation,
  acceptInvitation,
  type PublicInvitation,
} from '@/lib/staff/invitations-api';
import { useAuthStore } from '@/lib/auth/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/molecules/form-field';
import { SectionError } from '@/components/errors/section-error';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Verificando invitación…',
  title: 'Únete a tu clínica',
  passwordLabel: 'Elige tu contraseña',
  submit: 'Entrar',
  submitting: 'Entrando…',
  retry: 'Reintentar',
  genericLoadError: 'No pudimos verificar la invitación.',
  genericAcceptError: 'No pudimos activar tu cuenta. Intenta de nuevo.',
  roles: {
    ADMIN: 'Administrador/a',
    DENTIST: 'Odontólogo/a',
    ASSISTANT: 'Asistente',
    RECEPTION: 'Recepción',
  } as Record<string, string>,
  // El backend distingue por qué una invitación no sirve; cada caso tiene su
  // salida distinta, así que no se colapsan en un único "enlace inválido".
  status: {
    EXPIRED: 'Esta invitación caducó. Pídele a tu clínica que te envíe una nueva.',
    USED: 'Esta invitación ya se usó. Inicia sesión con tu contraseña.',
    REVOKED: 'Esta invitación fue anulada. Consulta con tu clínica.',
    NOT_FOUND: 'No encontramos esta invitación. Revisa el enlace.',
  } as Record<string, string>,
};

export default function AcceptInvitationPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const inviteToken = params.token;
  const setTokens = useAuthStore((s) => s.setTokens);

  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getPublicInvitation(inviteToken);
        if (cancelled) return;
        setInvitation(data);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
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
      const session = await acceptInvitation(inviteToken, password);
      setTokens(session);
      // Mismo destino que el login normal. `/dashboard` NO sirve aquí: solo
      // ADMIN lo puede leer, y la mayoría de invitaciones son para roles que
      // recibirían un 403 nada más entrar.
      router.replace('/patients');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : copy.genericAcceptError);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="p-8 text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <SectionError
          description={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          retryLabel={copy.retry}
        />
      </div>
    );
  }

  // Cualquier estado distinto de VALID es terminal: no hay formulario que
  // ofrecer, solo explicar qué pasó.
  if (invitation && invitation.status !== 'VALID') {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <Card className="grid gap-4 p-6">
          <p className="text-sm text-ink">{copy.status[invitation.status]}</p>
        </Card>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col justify-center p-8">
      <Card className="grid gap-5 p-6">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">{copy.title}</h1>
          {invitation?.clinicName && (
            <p className="text-sm text-muted">
              {invitation.clinicName}
              {invitation.role ? ` · ${copy.roles[invitation.role] ?? invitation.role}` : ''}
            </p>
          )}
          {invitation?.maskedEmail && (
            <p className="text-sm text-muted">{invitation.maskedEmail}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <FormField htmlFor="invite-password" label={copy.passwordLabel}>
            <Input
              id="invite-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? copy.submitting : copy.submit}
          </Button>
        </form>
      </Card>
    </main>
  );
}
