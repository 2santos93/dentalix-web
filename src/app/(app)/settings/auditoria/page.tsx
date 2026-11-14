'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage } from '@/components/settings/settings-page';
import { AuditLogView, auditFiltersFromSearch } from '@/components/audit/audit-log-view';

const copy = {
  title: 'Auditoría',
  description:
    'Quién vio o cambió datos clínicos y financieros de la clínica, cuándo y desde dónde. El registro no se puede editar ni borrar.',
};

/**
 * Registro de auditoría de la clínica (DX-009). Solo ADMIN: el menú solo le
 * enseña la entrada a ese rol y la API responde 403 a los demás (la vista
 * pinta el aviso). `?patientId=` abre la lista filtrada por un paciente.
 *
 * `useSearchParams` exige un límite de Suspense (como la ficha del paciente).
 */
export default function AuditSettingsPage() {
  return (
    <Suspense fallback={null}>
      <AuditSettingsView />
    </Suspense>
  );
}

function AuditSettingsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  const patientId = searchParams.get('patientId') ?? undefined;
  // SEC-043-bis: el enlace «recibos consultados» del cierre de caja abre la
  // auditoría ya filtrada (quién, recibos y días).
  const initialFilters = auditFiltersFromSearch(searchParams);
  const filtersKey = searchParams.toString();

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic" width="wide">
      <AuditLogView
        // Otra ficha, otra lista: el estado de filtros y páginas no se arrastra.
        key={patientId ?? `clinic:${filtersKey}`}
        token={accessToken}
        patientId={patientId}
        initialFilters={initialFilters}
        onClearPatient={patientId ? () => router.replace(pathname) : undefined}
      />
    </SettingsPage>
  );
}
