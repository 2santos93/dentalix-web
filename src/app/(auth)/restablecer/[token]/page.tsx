import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { AuthLayout } from '@/components/auth/auth-layout';
import { authContext } from '@/components/auth/auth-clinic';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  task: 'Restablecer contraseña',
  caption: 'Una contraseña nueva y listo',
};

// El token va en la URL: que no salga en el Referer hacia ningún otro sitio.
export const metadata: Metadata = {
  referrer: 'no-referrer',
};

// `params` is a Promise in this Next version (see AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md)
// — must `await` it, not destructure it synchronously.
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { clinic } = await authContext();

  return (
    <AuthLayout clinic={clinic} task={copy.task} caption={copy.caption}>
      <ResetPasswordForm resetToken={token} />
    </AuthLayout>
  );
}
