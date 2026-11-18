import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { SESSIONS_CLOSED_PARAM } from '@/lib/auth/password-reset-api';
import { AuthLayout } from '@/components/auth/auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { authContext } from '@/components/auth/auth-clinic';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  task: 'Restablecer contraseña',
  caption: 'Una contraseña nueva y listo',
};

// El token va en la URL: que no se indexe ni salga en el Referer hacia
// ningún otro sitio (DX-118, FE-034).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` is a Promise in this Next version (see AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md)
// — must `await` it, not destructure it synchronously.
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sessionsClosed = (await searchParams)[SESSIONS_CLOSED_PARAM] === '1';
  const { clinic } = await authContext();

  return (
    <AuthLayout clinic={clinic} fromHost task={copy.task} caption={copy.caption}
      heroImage={randomHeroImage()}>
      <ResetPasswordForm resetToken={token} sessionsClosed={sessionsClosed} />
    </AuthLayout>
  );
}
