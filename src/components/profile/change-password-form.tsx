'use client';
import * as React from 'react';
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { changePassword } from '@/lib/me/me-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';

// Copy as constants (i18n-ready) — same convention as login-form.tsx.
export const changePasswordCopy = {
  rowLabel: 'Contraseña',
  rowHelp: 'La que usas para entrar en Dentalix. Al cambiarla, se cierran tus otras sesiones abiertas.',
  open: 'Cambiar contraseña',
  title: 'Cambiar contraseña',
  description: 'Escribe la actual y la nueva dos veces.',
  currentLabel: 'Contraseña actual',
  newLabel: 'Nueva contraseña',
  newHint: 'Al menos 8 caracteres. Mejor una frase que solo tú recuerdes.',
  confirmLabel: 'Confirmar contraseña',
  submit: 'Cambiar contraseña',
  success: 'Tu contraseña fue actualizada.',
  mismatch: 'La nueva contraseña y su confirmación no coinciden.',
  tooShort: 'La nueva contraseña debe tener al menos 8 caracteres.',
  genericError: 'No pudimos cambiar tu contraseña. Intenta de nuevo.',
  // 401 de PATCH /me/password: la contraseña actual no coincide.
  wrongCurrent: 'La contraseña actual no es correcta.',
};

const copy = changePasswordCopy;

/**
 * Mi perfil → «Seguridad» (B6): una fila «Contraseña» con «Cambiar
 * contraseña» (secundario) que abre el diálogo. Antes eran tres campos
 * sueltos y un segundo botón primario en la misma vista que «Guardar».
 */
export function ChangePasswordForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: 'new' | 'confirm'; text: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setFieldError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (next.length < 8) {
      setFieldError({ field: 'new', text: copy.tooShort });
      document.getElementById('pwd-new')?.focus();
      return;
    }
    if (next !== confirm) {
      setFieldError({ field: 'confirm', text: copy.mismatch });
      document.getElementById('pwd-confirm')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(token, current, next);
      setSuccess(true);
      reset();
      setOpen(false);
    } catch (err) {
      setError(
        apiErrorMessage(err, {
          fallback: copy.genericError,
          byStatus: { 401: copy.wrongCurrent },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingRows>
        <SettingRow
          label={copy.rowLabel}
          description={copy.rowHelp}
          action={
            <Button
              type="button"
              variant="secondary"
              className="max-sm:w-full"
              onClick={() => {
                reset();
                setSuccess(false);
                setOpen(true);
              }}
            >
              <KeyRound aria-hidden />
              {copy.open}
            </Button>
          }
        />
      </SettingRows>
      {/* Siempre montada: el lector de pantalla anuncia el cambio al cerrar el diálogo. */}
      <p role="status" className="text-sm text-success-text empty:hidden">
        {success ? copy.success : null}
      </p>
      <FormModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title={copy.title}
        description={copy.description}
        onSubmit={handleSubmit}
        submitLabel={copy.submit}
        submitting={submitting}
        error={error}
      >
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
        <FormField
          htmlFor="pwd-new"
          label={copy.newLabel}
          hint={copy.newHint}
          hintId="pwd-new-hint"
          error={fieldError?.field === 'new' ? fieldError.text : null}
        >
          <Input
            id="pwd-new"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={fieldError?.field === 'new' ? true : undefined}
            aria-describedby={fieldError?.field === 'new' ? fieldErrorId('pwd-new') : 'pwd-new-hint'}
          />
        </FormField>
        <FormField
          htmlFor="pwd-confirm"
          label={copy.confirmLabel}
          error={fieldError?.field === 'confirm' ? fieldError.text : null}
        >
          <Input
            id="pwd-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={fieldError?.field === 'confirm' ? true : undefined}
            aria-describedby={fieldError?.field === 'confirm' ? fieldErrorId('pwd-confirm') : undefined}
          />
        </FormField>
      </FormModal>
    </div>
  );
}
