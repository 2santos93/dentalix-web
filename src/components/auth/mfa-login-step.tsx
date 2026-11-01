'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { normalizeTotpCode } from '@/lib/auth/break-glass';
import { normalizeRecoveryCode, type SecondFactor } from '@/lib/auth/mfa-api';
import { AUTH_FORM_CLASS, AUTH_LINK_CLASS } from './auth-layout';

const copy = {
  intro: 'Tu cuenta tiene la verificación en dos pasos activa.',
  codeLabel: 'Código de verificación',
  codeHint: 'Los 6 dígitos de tu app de autenticación.',
  codeInvalid: 'El código tiene 6 dígitos.',
  recoveryLabel: 'Código de recuperación',
  recoveryHint: 'Uno de los 10 que guardaste. Cada uno sirve una sola vez.',
  recoveryInvalid: 'Revisa el código: son 16 letras y números, como ABCD-EFGH-2345-6723.',
  useRecovery: '¿No tienes el móvil? Usa un código de recuperación',
  useApp: 'Usar el código de la app',
  submit: 'Verificar',
  submitting: 'Verificando…',
  back: 'Volver',
};

/**
 * Segundo paso del login (DX-021): el código de la app o, sin el móvil, uno de
 * recuperación. La contraseña ya valió; el error y la espera (429) los pinta
 * `LoginForm`, que es quien llama a la API.
 */
export function MfaLoginStep({
  submitting,
  locked = false,
  error,
  onSubmit,
  onBack,
}: {
  submitting: boolean;
  locked?: boolean;
  error: string | null;
  onSubmit: (factor: SecondFactor) => void;
  onBack: () => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [useRecovery]);

  const normalized = useRecovery ? normalizeRecoveryCode(value) : normalizeTotpCode(value);
  const fieldError =
    touched && !normalized ? (useRecovery ? copy.recoveryInvalid : copy.codeInvalid) : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (submitting || locked || !normalized) return;
    onSubmit(useRecovery ? { recoveryCode: normalized } : { code: normalized });
  }

  const id = 'login-mfa-code';
  return (
    <form onSubmit={handleSubmit} className={AUTH_FORM_CLASS} noValidate>
      <p className="text-sm text-muted">{copy.intro}</p>
      <FormField
        htmlFor={id}
        label={useRecovery ? copy.recoveryLabel : copy.codeLabel}
        hint={useRecovery ? copy.recoveryHint : copy.codeHint}
        error={fieldError}
      >
        <Input
          key={useRecovery ? 'recovery' : 'code'}
          ref={inputRef}
          id={id}
          name={useRecovery ? 'recoveryCode' : 'mfaCode'}
          inputMode={useRecovery ? 'text' : 'numeric'}
          autoComplete={useRecovery ? 'off' : 'one-time-code'}
          autoCapitalize={useRecovery ? 'characters' : undefined}
          spellCheck={false}
          maxLength={useRecovery ? 24 : 7}
          required
          disabled={submitting}
          value={value}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? fieldErrorId(id) : undefined}
          onChange={(e) => setValue(e.target.value)}
          className={useRecovery ? 'font-mono' : 'tabular-nums tracking-widest'}
        />
      </FormField>

      <button
        type="button"
        className={`self-start ${AUTH_LINK_CLASS}`}
        onClick={() => {
          setUseRecovery((v) => !v);
          setValue('');
          setTouched(false);
        }}
      >
        {useRecovery ? copy.useApp : copy.useRecovery}
      </button>

      {error ? (
        <InlineError id="login-mfa-error" variant="summary">
          {error}
        </InlineError>
      ) : null}

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft /> {copy.back}
        </Button>
        <Button type="submit" size="lg" disabled={submitting || locked} className="sm:min-w-48">
          {submitting ? (
            <>
              <Loader2 className="animate-spin" /> {copy.submitting}
            </>
          ) : (
            copy.submit
          )}
        </Button>
      </div>
    </form>
  );
}
