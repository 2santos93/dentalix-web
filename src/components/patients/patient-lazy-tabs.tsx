'use client';
import dynamic from 'next/dynamic';
import { SectionSkeleton } from '@/components/shared/async-section';

/*
 * DX-117 (FE-021): lo que la ficha del paciente NO necesita para pintar su
 * pestaña por defecto («Datos») llega en su propio trozo de JS, al abrir la
 * pestaña que lo usa. Antes todo iba en la primera carga de `/patients/[id]`
 * (164 KB gzip en la auditoría 2026-10-19).
 *
 * - Pestañas: cada panel (`PatientTabPanel`) solo monta su contenido cuando
 *   está activo, así que su trozo se pide al abrir la pestaña (o en la
 *   primera carga, si la URL ya trae `?tab=`). Mientras llega se pinta el
 *   esqueleto neutro de `AsyncSection`, el mismo que ve la pestaña mientras
 *   pide sus datos: no hay un segundo «salto» de geometría.
 * - Diálogos del menú «⋯» y «Editar»: siempre montados (cerrados), así que su
 *   trozo se pide justo después de pintar la ficha, fuera de la primera carga.
 *   Sin `loading`: cerrados no pintan nada.
 *
 * `ssr: false` como en el resto de la app (`clinical-entries-list`): la página
 * es `'use client'`, cuelga de `useSearchParams` bajo `Suspense` y no pinta
 * nada antes de tener sesión, así que en el servidor no había HTML que
 * perder. Las opciones van escritas en cada llamada: `next/dynamic` necesita
 * un objeto literal para generar su carga.
 */

// «Historia clínica». `MedicalHistoryPanel` NO entra aquí: «Registrar en
// Historia clínica» enfoca su título (`ANAMNESIS_HEADING_ID`) en el mismo
// efecto que abre la pestaña, y ese título tiene que existir ya.
export const ClinicalEntriesList = dynamic(
  () => import('@/components/patients/clinical-entries-list').then((m) => m.ClinicalEntriesList),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const PatientPostOpDeliveries = dynamic(
  () => import('@/components/postop/patient-postop-deliveries').then((m) => m.PatientPostOpDeliveries),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const ClinicalAlertBanner = dynamic(
  () => import('@/components/patients/clinical-alert-banner').then((m) => m.ClinicalAlertBanner),
  { ssr: false },
);

// Odontograma, periodontograma y plan de tratamiento.
export const OdontogramTab = dynamic(
  () => import('@/components/odontogram/odontogram-tab').then((m) => m.OdontogramTab),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const PerioTab = dynamic(() => import('@/components/perio/perio-tab').then((m) => m.PerioTab), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
export const TreatmentPlansTab = dynamic(
  () => import('@/components/treatment-plans/treatment-plans-tab').then((m) => m.TreatmentPlansTab),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

// Estado de cuenta, grupo familiar y cobranza.
export const AccountStatementView = dynamic(
  () => import('@/components/account-statement/account-statement-view').then((m) => m.AccountStatementView),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const FamilyAccountStatementSection = dynamic(
  () =>
    import('@/components/account-statement/family-account-statement-section').then(
      (m) => m.FamilyAccountStatementSection,
    ),
  { ssr: false },
);
export const PatientCollectionsSection = dynamic(
  () => import('@/components/collections/patient-collections-section').then((m) => m.PatientCollectionsSection),
  { ssr: false },
);

// Autorizaciones, consentimientos con firma, recetas, implantes, documentos y accesos.
export const DataConsentsTab = dynamic(
  () => import('@/components/data-consents/data-consents-tab').then((m) => m.DataConsentsTab),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const PatientConsentsTab = dynamic(
  () => import('@/components/consents/patient-consents-tab').then((m) => m.PatientConsentsTab),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const PatientPrescriptionsTab = dynamic(
  () => import('@/components/prescriptions/patient-prescriptions-tab').then((m) => m.PatientPrescriptionsTab),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const PatientImplantsTab = dynamic(
  () => import('@/components/implants/patient-implants-tab').then((m) => m.PatientImplantsTab),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const PatientDocumentsTab = dynamic(
  () => import('@/components/patient-documents/patient-documents-tab').then((m) => m.PatientDocumentsTab),
  { ssr: false, loading: () => <SectionSkeleton /> },
);
export const AuditLogView = dynamic(() => import('@/components/audit/audit-log-view').then((m) => m.AuditLogView), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});

// Diálogos (cerrados al pintar la ficha).
export const PatientEditModal = dynamic(
  () => import('@/components/patients/patient-edit-modal').then((m) => m.PatientEditModal),
  { ssr: false },
);
export const AnamnesisSendDialog = dynamic(
  () => import('@/components/anamnesis/anamnesis-send-dialog').then((m) => m.AnamnesisSendDialog),
  { ssr: false },
);
