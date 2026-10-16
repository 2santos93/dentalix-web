'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/lib/auth/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  emailLabel: 'Correo electrónico',
  passwordLabel: 'Contraseña',
  showPassword: 'Mostrar clave',
  hidePassword: 'Ocultar clave',
  submit: 'Iniciar sesión',
  submitting: 'Iniciando…',
  genericError: 'No pudimos iniciar sesión. Intenta de nuevo.',
  // 401 del login: credenciales, no sesión caducada (la API dice «Invalid credentials»).
  invalidCredentials: 'Correo o contraseña incorrectos.',
};

const ERROR_ID = 'login-error';

// El refresh llega en la cookie HttpOnly (DX-062): el body solo trae el access.
interface LoginResponse {
  accessToken: string;
}

export function LoginForm() {
  const router = useRouter();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setAccessToken(res.accessToken);
      router.push('/patients');
    } catch (err) {
      setError(
        apiErrorMessage(err, {
          fallback: copy.genericError,
          byStatus: { 401: copy.invalidCredentials },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField htmlFor="login-email" label={copy.emailLabel}>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="login-password" label={copy.passwordLabel}>
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={submitting}
            aria-pressed={showPassword}
            aria-label={showPassword ? copy.hidePassword : copy.showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </FormField>

      {error ? (
        <InlineError id={ERROR_ID} variant="summary">
          {error}
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
