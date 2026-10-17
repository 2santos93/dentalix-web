'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import {
  BREAK_GLASS_REASON_MAX,
  BREAK_GLASS_REASON_MIN,
  normalizeTotpCode,
} from '@/lib/auth/break-glass';
import { cn } from '@/lib/utils';

const copy = {
  notice:
    'Estás entrando como soporte de Dentalix a una clínica de la que no eres miembro. La clínica verá este acceso con el motivo, y la sesión caduca sola (sin renovación).',
  codeLabel: 'Código de verificación',
  codeHint: 'Los 6 dígitos de tu app de autenticación.',
  codeInvalid: 'El código tiene 6 dígitos.',
  reasonLabel: 'Motivo del acceso',
  reasonHint: (n: number) => `${n}/${BREAK_GLASS_REASON_MAX} · p. ej. el número de ticket y qué vas a revisar.`,
  reasonTooShort: `Escribe un motivo de al menos ${BREAK_GLASS_REASON_MIN} caracteres.`,
  submit: 'Entrar como soporte',
  submitting: 'Entrando…',
  back: 'Volver',
};

// Mismo estilo que el átomo Input, para el <textarea> nativo (como en las fichas).
const textareaClass =
  'flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface BreakGlassStepProps {
  submitting: boolean;
  /** Error del último intento (código erróneo, bloqueo…), ya en español. */
  error: string | null;
  onSubmit: (input: { mfaCode: string; reason: string }) => void;
  onBack: () => void;
}

/**
 * Paso extra del login (SEC-008): un superadmin sin membresía en la clínica
 * acaba de dar su contraseña correcta y la API pide el código TOTP y el
 * motivo del acceso. La validación del cliente evita idas y vueltas; la que
 * manda es la de la API.
 */
export function BreakGlassStep({ submitting, error, onSubmit, onBack }: BreakGlassStepProps) {
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  const normalized = normalizeTotpCode(code);
  const codeError = touched && !normalized ? copy.codeInvalid : null;
  const reasonError =
    touched && reason.trim().length < BREAK_GLASS_REASON_MIN ? copy.reasonTooShort : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!normalized || reason.trim().length < BREAK_GLASS_REASON_MIN) return;
    onSubmit({ mfaCode: normalized, reason: reason.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <p
        role="note"
        className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning"
      >
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{copy.notice}</span>
      </p>

      <FormField htmlFor="break-glass-code" label={copy.codeLabel} hint={copy.codeHint} error={codeError}>
        <Input
          ref={codeRef}
          id="break-glass-code"
          name="mfaCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          disabled={submitting}
          value={code}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? fieldErrorId('break-glass-code') : undefined}
          onChange={(e) => setCode(e.target.value)}
          className="tabular-nums tracking-widest"
        />
      </FormField>

      <FormField
        htmlFor="break-glass-reason"
        label={copy.reasonLabel}
        hint={copy.reasonHint(reason.length)}
        error={reasonError}
      >
        <textarea
          id="break-glass-reason"
          name="breakGlassReason"
          rows={3}
          required
          maxLength={BREAK_GLASS_REASON_MAX}
          disabled={submitting}
          value={reason}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? fieldErrorId('break-glass-reason') : undefined}
          onChange={(e) => setReason(e.target.value)}
          className={cn(textareaClass, 'h-auto')}
        />
      </FormField>

      {error ? (
        <InlineError id="break-glass-error" variant="summary">
          {error}
        </InlineError>
      ) : null}

      <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft /> {copy.back}
        </Button>
        <Button type="submit" size="lg" disabled={submitting} className="sm:min-w-48">
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
