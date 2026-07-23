'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ApiError } from '@/lib/api/client';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { MedicalHistoryPanel } from '@/components/patients/medical-history-panel';
import { ClinicalEntriesList } from '@/components/patients/clinical-entries-list';
import { PatientDetailTabs, type PatientDetailTabKey } from '@/components/patients/patient-detail-tabs';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { parseTenantFromHost } from '@/lib/tenant';
import { OdontogramChart } from '@/components/odontogram/odontogram-chart';
import { ToothTimeline } from '@/components/odontogram/tooth-timeline';
import { ToothRecordPanel } from '@/components/odontogram/tooth-record-panel';
import { getOdontogram, type ToothGroup, type ToothSurface } from '@/lib/odontogram/odontogram-api';
import { projectOdontogram } from '@/lib/odontogram/projection';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  backLink: 'Volver a pacientes',
  checkingSession: 'Verificando sesión…',
  loading: 'Cargando paciente…',
  genericError: 'No pudimos cargar el paciente. Intenta de nuevo.',
  retry: 'Reintentar',
  tabData: 'Datos',
  tabClinicalHistory: 'Historia clínica',
  tabOdontogram: 'Odontograma',
  odontogramLoading: 'Cargando odontograma…',
  odontogramGenericError: 'No pudimos cargar el odontograma. Intenta de nuevo.',
  catalogGenericError: 'No pudimos cargar el catálogo. Intenta de nuevo.',
  selectToothPrompt: 'Selecciona un diente para ver su historial y registrar un hallazgo o procedimiento.',
  toothHeading: (fdi: string) => `Diente ${fdi}`,
  docTypeLabel: 'Tipo de documento',
  docNumberLabel: 'Número de documento',
  birthDateLabel: 'Fecha de nacimiento',
  sexLabel: 'Sexo',
  phoneLabel: 'Teléfono',
  emailLabel: 'Correo electrónico',
  addressLabel: 'Dirección',
  notesLabel: 'Notas',
  fieldFallback: '—',
  anamnesisHeading: 'Anamnesis',
  entriesHeading: 'Evoluciones',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return copy.fieldFallback;
  return new Date(iso).toLocaleDateString('es');
}

interface OdontogramTabProps {
  token: string;
  patientId: string;
}

/**
 * Composes Task 5's `OdontogramChart` with Task 6's `ToothTimeline` +
 * `ToothRecordPanel`. Loads the odontogram + the dental catalog once, then:
 * - clicking a tooth (or a surface) selects it, showing that tooth's
 *   timeline + record form below the chart;
 * - clicking a surface additionally pre-checks that surface in the form;
 * - a successful `addToothRecord` (inside `ToothRecordPanel`) bumps
 *   `reloadKey` (re-fetches the odontogram -> the chart recolors) and
 *   `timelineRefreshKey` (re-fetches that tooth's timeline).
 */
function OdontogramTab({ token, patientId }: OdontogramTabProps) {
  const [toothGroups, setToothGroups] = useState<ToothGroup[]>([]);
  const [catalogItems, setCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [initialSurface, setInitialSurface] = useState<ToothSurface | null>(null);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [groups, catalog] = await Promise.all([
          getOdontogram(token, patientId),
          listCatalogItems(token, { activeOnly: true }),
        ]);
        if (cancelled) return;
        setToothGroups(groups);
        setCatalogItems(catalog);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : `${copy.odontogramGenericError} ${copy.catalogGenericError}`,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const states = projectOdontogram(toothGroups, catalogById);

  function handleSelectTooth(fdi: string) {
    setSelectedTooth(fdi);
    setInitialSurface(null);
  }

  function handleSelectSurface(fdi: string, surface: ToothSurface) {
    setSelectedTooth(fdi);
    setInitialSurface(surface);
  }

  function handleRecordAdded() {
    // Refetches the odontogram (so the chart recolors with the new record)
    // and bumps the timeline's refresh key (so it re-fetches that tooth's
    // history) — the record itself was already POSTed by ToothRecordPanel.
    setReloadKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.odontogramLoading}
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink"
        >
          {copy.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <OdontogramChart
        states={states}
        catalogById={catalogById}
        selectedTooth={selectedTooth ?? undefined}
        onSelectTooth={handleSelectTooth}
        onSelectSurface={handleSelectSurface}
      />

      {selectedTooth ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-ink">{copy.toothHeading(selectedTooth)}</h2>
            <ToothTimeline
              token={token}
              patientId={patientId}
              toothNumber={selectedTooth}
              catalogById={catalogById}
              refreshKey={timelineRefreshKey}
            />
          </section>
          <section className="flex flex-col gap-3">
            <ToothRecordPanel
              token={token}
              patientId={patientId}
              toothNumber={selectedTooth}
              initialSurface={initialSurface ?? undefined}
              onRecordAdded={handleRecordAdded}
            />
          </section>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted">
          {copy.selectToothPrompt}
        </p>
      )}
    </div>
  );
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

  const tenant = typeof window !== 'undefined' ? parseTenantFromHost(window.location.host) : null;

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
        const data = await getPatient(accessToken as string, patientId, tenant);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="flex min-h-full flex-1 flex-col gap-6 bg-bg px-4 py-8 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/patients" className="text-sm font-medium text-primary">
            {copy.backLink}
          </Link>
          <h1 className="text-2xl font-semibold text-ink">
            {loading ? copy.loading : patient ? fullName(patient) : ''}
          </h1>
        </div>
        <ThemeToggle />
      </div>

      {loading ? (
        <p role="status" className="text-sm text-muted">
          {copy.loading}
        </p>
      ) : error ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setRetryCount((c) => c + 1);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink"
          >
            {copy.retry}
          </button>
        </div>
      ) : patient ? (
        <div className="flex flex-col gap-4">
          <PatientDetailTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tablistLabel={fullName(patient)}
            dataLabel={copy.tabData}
            clinicalHistoryLabel={copy.tabClinicalHistory}
            odontogramLabel={copy.tabOdontogram}
          />

          {activeTab === 'data' && (
            <div
              role="tabpanel"
              id="tabpanel-data"
              aria-labelledby="tab-data"
              className="rounded-lg border border-border bg-surface p-4"
            >
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.docTypeLabel}</dt>
                  <dd className="text-ink">{patient.docType}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.docNumberLabel}</dt>
                  <dd className="text-ink">{patient.docNumber ?? copy.fieldFallback}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.birthDateLabel}</dt>
                  <dd className="text-ink">{formatDate(patient.birthDate)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.sexLabel}</dt>
                  <dd className="text-ink">{patient.sex}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.phoneLabel}</dt>
                  <dd className="text-ink">{patient.phone ?? copy.fieldFallback}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.emailLabel}</dt>
                  <dd className="text-ink">{patient.email ?? copy.fieldFallback}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.addressLabel}</dt>
                  <dd className="text-ink">{patient.address ?? copy.fieldFallback}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted">{copy.notesLabel}</dt>
                  <dd className="text-ink">{patient.notes ?? copy.fieldFallback}</dd>
                </div>
              </dl>
            </div>
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
                <MedicalHistoryPanel token={accessToken} tenant={tenant} patientId={patientId} />
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-ink">{copy.entriesHeading}</h2>
                <ClinicalEntriesList token={accessToken} tenant={tenant} patientId={patientId} />
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
        </div>
      ) : null}
    </div>
  );
}
