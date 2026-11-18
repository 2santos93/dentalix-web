import type { Metadata } from 'next';
import { NotMeForm } from '@/components/auth/not-me-form';
import { AuthLayout } from '@/components/auth/auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { authContext } from '@/components/auth/auth-clinic';

const copy = {
  task: '¿No fuiste tú?',
  caption: 'Tu cuenta, solo tuya',
};

// El token va en la URL: que no se indexe ni salga en el Referer (como /restablecer).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` is a Promise in this Next version (see AGENTS.md).
export default async function NotMePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { clinic } = await authContext();
  return (
    <AuthLayout clinic={clinic} fromHost task={copy.task} caption={copy.caption} heroImage={randomHeroImage()}>
      <NotMeForm token={token} />
    </AuthLayout>
  );
}
