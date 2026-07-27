'use client';
import * as React from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { changePassword } from '@/lib/me/me-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/molecules/form-field';

// Copy as constants (i18n-ready) — same convention as login-form.tsx.
const copy = {
  currentLabel: 'Contraseña actual',
  newLabel: 'Nueva contraseña',
  confirmLabel: 'Confirmar contraseña',
  submit: 'Cambiar contraseña',
  submitting: 'Cambiando…',
  success: 'Tu contraseña fue actualizada.',
  mismatch: 'La nueva contraseña y su confirmación no coinciden.',
  tooShort: 'La nueva contraseña debe tener al menos 8 caracteres.',
  genericError: 'No pudimos cambiar tu contraseña. Intenta de nuevo.',
};

export function ChangePasswordForm({ token }: { token: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) {
      setError(copy.tooShort);
      return;
    }
    if (next !== confirm) {
      setError(copy.mismatch);
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(token, current, next);
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <FormField htmlFor="pwd-current" label={copy.currentLabel}>
        <Input
          id="pwd-current"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </FormField>
      <FormField htmlFor="pwd-new" label={copy.newLabel}>
        <Input
          id="pwd-new"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </FormField>
      <FormField htmlFor="pwd-confirm" label={copy.confirmLabel}>
        <Input
          id="pwd-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </FormField>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-success">
          {copy.success}
        </p>
      )}
      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </div>
    </form>
  );
}
