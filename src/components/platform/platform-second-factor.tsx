'use client';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { loginLockedMessage } from '@/lib/auth/login-lockout';
import {
  MFA_CHALLENGE_EXPIRED,
  MFA_ENROLLMENT_REQUIRED,
  verifyLoginMfa,
  type MfaChallenge,
  type SecondFactor,
} from '@/lib/auth/mfa-api';
import { MfaEnrollStep } from '@/components/auth/mfa-enroll-step';
import { MfaLoginStep } from '@/components/auth/mfa-login-step';

const copy = {
  genericError: 'No pudimos verificar el código. Intenta de nuevo.',
  badCode: 'El código no es correcto o ya se usó. Espera al siguiente código de la app e intenta de nuevo.',
};

/**
 * Segundo paso del acceso de plataforma (DX-021-bis): el código o, sin MFA, su
 * alta. Los mismos pasos que una clínica, sin «recordar este dispositivo»: al
 * superadmin se le pide siempre.
 */
export function PlatformSecondFactor({
  challenge,
  onDone,
  onExpired,
  onBack,
}: {
  challenge: MfaChallenge;
  onDone: (accessToken: string) => void;
  onExpired: () => void;
  onBack: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(factor: SecondFactor) {
    setSubmitting(true);
    setError(null);
    try {
      onDone((await verifyLoginMfa(challenge.mfaToken, factor)).accessToken);
    } catch (err) {
      if (err instanceof ApiError && err.code === MFA_CHALLENGE_EXPIRED) {
        onExpired();
      } else if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds) {
        setLocked(true);
        setError(loginLockedMessage(err.retryAfterSeconds));
      } else {
        setError(apiErrorMessage(err, { fallback: copy.genericError, byStatus: { 401: copy.badCode } }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (challenge.mfa === MFA_ENROLLMENT_REQUIRED) {
    return (
      <MfaEnrollStep
        mfaToken={challenge.mfaToken}
        emailCodeRequired={challenge.emailCodeRequired === true}
        onDone={onDone}
        onExpired={onExpired}
      />
    );
  }
  return (
    <MfaLoginStep
      submitting={submitting}
      locked={locked}
      error={error}
      onSubmit={(factor) => void verify(factor)}
      onBack={onBack}
    />
  );
}
