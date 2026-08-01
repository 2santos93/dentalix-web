'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/molecules/form-field';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  clinicNameLabel: 'Nombre de la clínica',
  subdomainLabel: 'Subdominio',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  passwordLabel: 'Contraseña',
  showPassword: 'Mostrar clave',
  hidePassword: 'Ocultar clave',
  submit: 'Crear cuenta',
  submitting: 'Creando cuenta…',
  genericError: 'No pudimos crear la cuenta. Intenta de nuevo.',
};

const ERROR_ID = 'register-error';

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: { clinicName, subdomain, fullName, email, password },
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
      <FormField htmlFor="register-clinic-name" label={copy.clinicNameLabel}>
        <Input
          id="register-clinic-name"
          name="clinicName"
          type="text"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={clinicName}
          onChange={(e) => setClinicName(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="register-subdomain" label={copy.subdomainLabel}>
        <Input
          id="register-subdomain"
          name="subdomain"
          type="text"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="register-full-name" label={copy.fullNameLabel}>
        <Input
          id="register-full-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="register-email" label={copy.emailLabel}>
        <Input
          id="register-email"
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

      <FormField htmlFor="register-password" label={copy.passwordLabel}>
        <div className="relative">
          <Input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
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
