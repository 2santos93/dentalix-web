'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ApiError } from '@/lib/api/client';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { MedicalHistoryPanel } from '@/components/patients/medical-history-panel';
import { ClinicalEntriesList } from '@/components/patients/clinical-entries-list';
import { ClinicalAlertBanner } from '@/components/patients/clinical-alert-banner';
import { PatientDetailTabs, type PatientDetailTabKey } from '@/components/patients/patient-detail-tabs';
import { PatientDataPanel } from '@/components/patients/patient-data-panel';
import { PatientEditModal } from '@/components/patients/patient-edit-modal';
import { OdontogramTab } from '@/components/odontogram/odontogram-tab';
import { TreatmentPlansTab } from '@/components/treatment-plans/treatment-plans-tab';
import { SectionError } from '@/components/errors/section-error';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  backLink: 'Volver a pacientes',
  checkingSession: 'Verificando sesión…',
  loading: 'Cargando paciente…',
  genericError: 'No pudimos cargar el paciente.',
  tabData: 'Datos',
  tabClinicalHistory: 'Historia clínica',
  tabOdontogram: 'Odontograma',
  tabTreatmentPlans: 'Plan de tratamiento',
  anamnesisHeading: 'Anamnesis',
  entriesHeading: 'Evoluciones',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [activeTab, setActiveTab] = useState<PatientDetailTabKey>('data');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Don't decide anything until the persisted store has rehydrated —
    // accessToken is null until then, and redirecting on that would bounce
    // an already-authenticated user.
    if (!hasHydrated) return;

    if (!accessToken) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getPatient(accessToken as string, patientId);
        if (cancelled) return;
        setPatient(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : copy.genericError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [accessToken, router, hasHydrated, patientId, retryCount]);

  if (!hasHydrated) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-bg px-4 py-8">
        <p role="status" className="text-sm text-muted">
          {copy.checkingSession}
        </p>
      </div>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/patients"
          className="text-sm font-medium text-primary hover:underline"
        >
          {copy.backLink}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {loading ? copy.loading : patient ? fullName(patient) : ''}
        </h1>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-muted">
          {copy.loading}
        </p>
      ) : error ? (
        <SectionError
          description={error}
          onRetry={() => {
            setLoading(true);
            setError(null);
            setRetryCount((c) => c + 1);
          }}
        />
      ) : patient ? (
        <div className="flex flex-col gap-4">
          <ClinicalAlertBanner token={accessToken} patientId={patientId} />

          <PatientDetailTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tablistLabel={fullName(patient)}
            dataLabel={copy.tabData}
            clinicalHistoryLabel={copy.tabClinicalHistory}
            odontogramLabel={copy.tabOdontogram}
            treatmentPlansLabel={copy.tabTreatmentPlans}
          />

          {activeTab === 'data' && (
            <div role="tabpanel" id="tabpanel-data" aria-labelledby="tab-data">
              <PatientDataPanel patient={patient} onEdit={() => setEditing(true)} />
            </div>
          )}

          {patient && (
            <PatientEditModal
              open={editing}
              patient={patient}
              token={accessToken}
              onOpenChange={setEditing}
              onSaved={(updated) => setPatient(updated)}
            />
          )}

          {activeTab === 'clinical-history' && (
            <div
              role="tabpanel"
              id="tabpanel-clinical-history"
              aria-labelledby="tab-clinical-history"
              className="flex flex-col gap-8"
            >
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-ink">{copy.anamnesisHeading}</h2>
                <MedicalHistoryPanel token={accessToken} patientId={patientId} />
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-ink">{copy.entriesHeading}</h2>
                <ClinicalEntriesList token={accessToken} patientId={patientId} />
              </section>
            </div>
          )}

          {activeTab === 'odontogram' && (
            <div
              role="tabpanel"
              id="tabpanel-odontogram"
              aria-labelledby="tab-odontogram"
              className="flex flex-col gap-4"
            >
              <OdontogramTab token={accessToken} patientId={patientId} />
            </div>
          )}

          {activeTab === 'treatment-plans' && (
            <div
              role="tabpanel"
              id="tabpanel-treatment-plans"
              aria-labelledby="tab-treatment-plans"
              className="flex flex-col gap-4"
            >
              <TreatmentPlansTab token={accessToken} patientId={patientId} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
