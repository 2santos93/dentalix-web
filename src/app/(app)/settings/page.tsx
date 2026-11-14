'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsIndex } from '@/components/settings/settings-index';

const copy = {
  title: 'Ajustes',
  description: 'Tu cuenta y cómo funciona la clínica: sedes, agenda, cobro, historia clínica, datos y registros.',
};

/**
 * Índice de Ajustes (DX-282). Se llega desde «Ajustes» en el menú de cuenta;
 * cada rol ve solo las pantallas que puede abrir.
 */
export default function SettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <SettingsIndex token={accessToken} />
    </>
  );
}
