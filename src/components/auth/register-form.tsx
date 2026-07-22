'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api/client';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  clinicNameLabel: 'Nombre de la clínica',
  subdomainLabel: 'Subdominio',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  passwordLabel: 'Contraseña',
  submit: 'Crear cuenta',
  submitting: 'Creando cuenta…',
  genericError: 'No pudimos crear la cuenta. Intenta de nuevo.',
};

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
}

export function RegisterForm({ tenant }: { tenant: string | null }) {
  const router = useRouter();
  const [clinicName, setClinicName] = useState('');
  const [subdomain, setSubdomain] = useState(tenant ?? '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: { clinicName, subdomain, fullName, email, password },
        tenant,
      });
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="register-clinic-name" className="text-sm font-medium text-ink">
          {copy.clinicNameLabel}
        </label>
        <input
          id="register-clinic-name"
          name="clinicName"
          type="text"
          required
          value={clinicName}
          onChange={(e) => setClinicName(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="register-subdomain" className="text-sm font-medium text-ink">
          {copy.subdomainLabel}
        </label>
        <input
          id="register-subdomain"
          name="subdomain"
          type="text"
          required
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="register-full-name" className="text-sm font-medium text-ink">
          {copy.fullNameLabel}
        </label>
        <input
          id="register-full-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="register-email" className="text-sm font-medium text-ink">
          {copy.emailLabel}
        </label>
        <input
          id="register-email"
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
        <label htmlFor="register-password" className="text-sm font-medium text-ink">
          {copy.passwordLabel}
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
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
