import Link from 'next/link';
import { AcceptInvitationForm } from '@/components/auth/accept-invitation-form';
import { AuthLayout } from '@/components/auth/auth-layout';
import { authContext } from '@/components/auth/auth-clinic';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  task: 'Acepta tu invitación',
  loginPrompt: '¿Ya tienes cuenta?',
  loginLink: 'Inicia sesión',
  caption: 'Únete al equipo de tu clínica',
};

// `params` is a Promise in this Next version (see AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md)
// — must `await` it, not destructure it synchronously.
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { clinic } = await authContext();

  return (
    <AuthLayout
      clinic={clinic}
      task={copy.task}
      caption={copy.caption}
      footer={
        <>
          {copy.loginPrompt}{' '}
          <Link href="/login" className="font-medium text-primary-text hover:underline">
            {copy.loginLink}
          </Link>
        </>
      }
    >
      <AcceptInvitationForm inviteToken={token} hostClinicName={clinic?.name ?? null} />
    </AuthLayout>
  );
}
