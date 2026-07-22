'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  subdomainLabel: 'Subdominio de la clínica',
  emailLabel: 'Correo electrónico',
  passwordLabel: 'Contraseña',
  submit: 'Iniciar sesión',
  submitting: 'Iniciando…',
  genericError: 'No pudimos iniciar sesión. Intenta de nuevo.',
};

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export function LoginForm({ tenant }: { tenant: string | null }) {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [subdomain, setSubdomain] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const effectiveTenant = tenant || (subdomain.trim().toLowerCase() || null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { subdomain: effectiveTenant, email, password },
        tenant: effectiveTenant,
      });
      setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      router.push('/patients');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!tenant && (
        <div className="flex flex-col gap-1">
          <label htmlFor="login-subdomain" className="text-sm font-medium text-ink">
            {copy.subdomainLabel}
          </label>
          <input
            id="login-subdomain"
            name="subdomain"
            type="text"
            autoComplete="off"
            required
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="login-email" className="text-sm font-medium text-ink">
          {copy.emailLabel}
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="login-password" className="text-sm font-medium text-ink">
          {copy.passwordLabel}
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {submitting ? copy.submitting : copy.submit}
      </button>
    </form>
  );
}
