import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { AuthLayout } from '@/components/auth/auth-layout';
import { authContext } from '@/components/auth/auth-clinic';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  task: '¿Olvidaste tu contraseña?',
  caption: 'Vuelve a tu clínica en un momento',
};

/** «¿Olvidaste tu contraseña?» (DX-010), pública y con la marca de la clínica. */
export default async function ForgotPasswordPage() {
  const { clinic } = await authContext();

  return (
    <AuthLayout clinic={clinic} task={copy.task} caption={copy.caption}>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
