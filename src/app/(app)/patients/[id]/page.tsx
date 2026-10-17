'use client';
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { MedicalHistoryPanel } from '@/components/patients/medical-history-panel';
import { ClinicalEntriesList } from '@/components/patients/clinical-entries-list';
import { ClinicalAlertBanner } from '@/components/patients/clinical-alert-banner';
import {
  PatientDetailTabs,
  type PatientDetailTabKey,
} from '@/components/patients/patient-detail-tabs';
import { PatientDataPanel } from '@/components/patients/patient-data-panel';
import { PatientEditModal } from '@/components/patients/patient-edit-modal';
import { PatientRecordHeader } from '@/components/patients/patient-record-header';
import { PatientRetentionSection } from '@/components/patients/patient-retention-section';
import { PatientCommunicationSection } from '@/components/patients/patient-communication-section';
import { canEditCommunication, withCommunication } from '@/lib/patients/communication-api';
import { OdontogramTab } from '@/components/odontogram/odontogram-tab';
import { TreatmentPlansTab } from '@/components/treatment-plans/treatment-plans-tab';
import { SectionError } from '@/components/errors/section-error';
import { AccountStatementView } from '@/components/account-statement/account-statement-view';
import { getTokenRole } from '@/lib/auth/token-role';
import { patientTabAccess, resolvePatientTab } from '@/lib/patients/patient-tab-access';
import { DataConsentsTab } from '@/components/data-consents/data-consents-tab';
import { PatientConsentsTab } from '@/components/consents/patient-consents-tab';
import { PerioTab } from '@/components/perio/perio-tab';
import { PatientPrescriptionsTab } from '@/components/prescriptions/patient-prescriptions-tab';
import { PatientImplantsTab } from '@/components/implants/patient-implants-tab';
import { canRegisterImplants } from '@/lib/implants/implants-api';
import { AuditLogView } from '@/components/audit/audit-log-view';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  checkingSession: 'Verificando sesión…',
  loading: 'Cargando paciente…',
  genericError: 'No pudimos cargar el paciente.',
  notFound: 'No se encontró el paciente: puede que se haya eliminado o que el enlace sea incorrecto.',
  tabData: 'Datos',
  tabClinicalHistory: 'Historia clínica',
  tabOdontogram: 'Odontograma',
  tabTreatmentPlans: 'Plan de tratamiento',
  tabAccountStatement: 'Estado de cuenta',
  tabDataConsents: 'Autorizaciones',
  tabConsents: 'Consentimientos',
  tabPerio: 'Periodontograma',
  tabPrescriptions: 'Recetas',
  tabImplants: 'Implantes',
  tabAccessLog: 'Accesos',
  anamnesisHeading: 'Anamnesis',
  entriesHeading: 'Evoluciones',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

/**
 * A tabpanel that is ALWAYS in the DOM (so every tab's `aria-controls` resolves
 * to a real element, instead of three of the four dangling at any moment) but
 * only mounts its children while it is the active one.
 *
 * That split is deliberate: `OdontogramTab`, `MedicalHistoryPanel`,
 * `ClinicalEntriesList` and `TreatmentPlansTab` all fetch on mount, so
 * rendering every panel eagerly would turn opening a patient into four round
 * trips. The panel element is a bare `<div>` — cheap enough to always exist,
 * and `hidden` keeps it out of both the layout and the accessibility tree.
 *
 * `tabIndex={-1}` makes the panel programmatically focusable so activating a
 * tab can drop focus into the content it just revealed.
 */
function TabPanel({
  tab,
  activeTab,
  register,
  className,
  children,
}: {
  tab: PatientDetailTabKey;
  activeTab: PatientDetailTabKey;
  register: (tab: PatientDetailTabKey, el: HTMLDivElement | null) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = activeTab === tab;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tab}`}
      aria-labelledby={`tab-${tab}`}
      ref={(el) => register(tab, el)}
      tabIndex={-1}
      hidden={!active}
      // The layout classes only apply while the panel is showing: a `display`
      // utility (`flex`) would otherwise win over `hidden`'s `display: none`.
      className={active ? className : undefined}
    >
      {active ? children : null}
    </div>
  );
}

/**
 * `useSearchParams` opts the subtree into client-side rendering, which Next
 * requires to sit under a Suspense boundary. The page is `'use client'` and
 * fully data-driven anyway (nothing below renders before the session
 * bootstrap resolves), so the boundary costs nothing visible.
 */
export default function PatientDetailPage() {
  return (
    <Suspense fallback={null}>
      <PatientDetailView />
    </Suspense>
  );
}

function PatientDetailView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const panels = useRef(new Map<PatientDetailTabKey, HTMLDivElement>());
  const firstRender = useRef(true);

  // La pestaña abierta vive en la URL, no en `useState`: así se puede marcar,
  // compartir y comparar dos fichas en dos pestañas del navegador, el botón
  // Atrás vuelve a la pestaña anterior en vez de salir del paciente, y
  // recargar el móvil devuelve al usuario donde estaba. Un valor desconocido o
  // ausente cae en «Datos» sin romper nada.
  // Qué pestañas ve el rol: las que la API le deja leer (DX-057). Recepción no
  // ve las clínicas (historia, odontograma, plan de tratamiento ni
  // consentimientos), que le responderían 403; DENTIST/ASSISTANT no ven el
  // estado de cuenta. Un `?tab=` sin acceso (enlace compartido) cae en «Datos»,
  // igual que cualquier valor desconocido.
  const access = patientTabAccess(getTokenRole(accessToken));
  const activeTab = resolvePatientTab(searchParams.get('tab'), access);
  // El diente en foco también viaja en la URL: es el puente entre el
  // odontograma (diente seleccionado) y el plan de tratamiento (ítems de ese
  // diente resaltados). Solo se valida contra el formato FDI en cada consumidor.
  const focusedTooth = searchParams.get('tooth');

  /**
   * Reescribe los parámetros SIN navegar: `router.replace` mantiene una sola
   * entrada por cambio de pestaña en vez de llenar el historial, y
   * `scroll: false` evita el salto al principio de la página que haría una
   * navegación normal. Pasar `null` borra el parámetro.
   */
  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  function registerPanel(tab: PatientDetailTabKey, el: HTMLDivElement | null) {
    if (el) panels.current.set(tab, el);
    else panels.current.delete(tab);
  }

  // Activating a tab moves focus into its panel. The tabs use manual
  // activation (arrows move focus, Enter/Space select — see
  // `PatientDetailTabs`), so this only ever fires on a deliberate selection,
  // never while arrowing across the tablist. Without it, focus stays in the
  // tablist and a screen reader user has to hunt for the content that just
  // replaced what was on screen.
  useEffect(() => {
    // The page opening on "Datos" is not a tab change; stealing focus on first
    // paint would move it away from wherever the browser put it.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panels.current.get(activeTab)?.focus();
  }, [activeTab]);

  useEffect(() => {
    // Don't decide anything until the session bootstrap has resolved —
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
        setError(
          apiErrorMessage(err, { fallback: copy.genericError, byStatus: { 404: copy.notFound } }),
        );
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
    // Sin `gap`: el espacio bajo la cabecera lo pone el `mb-8` de `PageHeader`,
    // igual que en las otras ocho páginas que lo usan.
    <div className="flex flex-1 flex-col">
      <PatientRecordHeader
        patient={loading ? null : patient}
        loading={loading}
        onEdit={() => setEditing(true)}
      />

      {loading ? (
        // El texto ya se ve en el título de la cabecera; aquí solo queda el
        // anuncio para lectores de pantalla, que un `<h1>` no hace por sí solo.
        <p role="status" className="sr-only">
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
          {/* Las alertas salen de la anamnesis (dato clínico): sin acceso, la
              API responde 403 y el banner solo diría que no pudo comprobarlas. */}
          {access['clinical-history'] ? (
            <ClinicalAlertBanner token={accessToken} patientId={patientId} />
          ) : null}

          {/* DX-039: aviso de retención legal para todos; controles, solo ADMIN. */}
          <PatientRetentionSection
            patient={patient}
            token={accessToken}
            isAdmin={getTokenRole(accessToken) === 'ADMIN'}
            onUpdated={setPatient}
            onArchived={() => router.push('/patients')}
          />

          <PatientDetailTabs
            activeTab={activeTab}
            onTabChange={(tab) => setParams({ tab })}
            tablistLabel={fullName(patient)}
            dataLabel={copy.tabData}
            clinicalHistoryLabel={access['clinical-history'] ? copy.tabClinicalHistory : undefined}
            odontogramLabel={access.odontogram ? copy.tabOdontogram : undefined}
            treatmentPlansLabel={access['treatment-plans'] ? copy.tabTreatmentPlans : undefined}
            accountStatementLabel={
              access['account-statement'] ? copy.tabAccountStatement : undefined
            }
            dataConsentsLabel={access['data-consents'] ? copy.tabDataConsents : undefined}
            consentsLabel={access.consents ? copy.tabConsents : undefined}
            perioLabel={access.perio ? copy.tabPerio : undefined}
            prescriptionsLabel={access.prescriptions ? copy.tabPrescriptions : undefined}
            implantsLabel={access.implants ? copy.tabImplants : undefined}
            accessLogLabel={access['access-log'] ? copy.tabAccessLog : undefined}
          />

          <TabPanel
            tab="data"
            activeTab={activeTab}
            register={registerPanel}
            className="flex flex-col gap-4"
          >
            <PatientDataPanel patient={patient} />
            {/* DX-128: canal de los recordatorios, móvil, opt-in y baja. Lo ven
                todos; lo cambian recepción y ADMIN. */}
            <PatientCommunicationSection
              // Se relee si la ficha cambia (p. ej. el teléfono en «Editar»).
              key={patient.updatedAt}
              token={accessToken}
              patientId={patientId}
              canEdit={canEditCommunication(getTokenRole(accessToken))}
              // Sin tocar `updatedAt`: la sección no se vuelve a montar.
              onChanged={(c) =>
                setPatient((prev) => (prev ? withCommunication(prev, c) : prev))
              }
            />
          </TabPanel>

          <PatientEditModal
            open={editing}
            patient={patient}
            token={accessToken}
            onOpenChange={setEditing}
            onSaved={(updated) => setPatient(updated)}
          />

          {access['clinical-history'] ? (
            <TabPanel
              tab="clinical-history"
              activeTab={activeTab}
              register={registerPanel}
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
            </TabPanel>
          ) : null}

          {access.odontogram ? (
            <TabPanel
              tab="odontogram"
              activeTab={activeTab}
              register={registerPanel}
              className="flex flex-col gap-4"
            >
              {/* El diente seleccionado se siembra desde `?tooth=` (así funciona
                «Ver en el odontograma» desde el plan) y se devuelve a la URL en
                cada selección, para que recargar o compartir el enlace vuelva
                al mismo diente. */}
              <OdontogramTab
                token={accessToken}
                patientId={patientId}
                initialTooth={focusedTooth}
                onToothChange={(tooth) => setParams({ tooth })}
                planHref={(tooth) => `${pathname}?tab=treatment-plans&tooth=${tooth}`}
                implantHref={
                  canRegisterImplants(getTokenRole(accessToken))
                    ? (tooth) => `${pathname}?tab=implants&registerTooth=${tooth}`
                    : undefined
                }
              />
            </TabPanel>
          ) : null}

          {access.perio ? (
            <TabPanel tab="perio" activeTab={activeTab} register={registerPanel}>
              <PerioTab token={accessToken} patientId={patientId} />
            </TabPanel>
          ) : null}

          {access['treatment-plans'] ? (
            <TabPanel
              tab="treatment-plans"
              activeTab={activeTab}
              register={registerPanel}
              className="flex flex-col gap-4"
            >
              {/* Mismo puente en sentido contrario: el diente de `?tooth=` llega
                resaltado en la tabla de ítems y presembrado en «Agregar ítem»,
                y cada fila puede volver al odontograma con ese diente. */}
              <TreatmentPlansTab
                token={accessToken}
                patientId={patientId}
                focusedTooth={focusedTooth}
                odontogramHref={(tooth) => `${pathname}?tab=odontogram&tooth=${tooth}`}
              />
            </TabPanel>
          ) : null}

          {access['account-statement'] ? (
            <TabPanel tab="account-statement" activeTab={activeTab} register={registerPanel}>
              <AccountStatementView token={accessToken} patientId={patientId} />
            </TabPanel>
          ) : null}

          {access['data-consents'] ? (
            <TabPanel tab="data-consents" activeTab={activeTab} register={registerPanel}>
              <DataConsentsTab token={accessToken} patientId={patientId} />
            </TabPanel>
          ) : null}
          {access.consents ? (
            <TabPanel tab="consents" activeTab={activeTab} register={registerPanel}>
              <PatientConsentsTab token={accessToken} patientId={patientId} />
            </TabPanel>
          ) : null}
          {access.prescriptions ? (
            <TabPanel tab="prescriptions" activeTab={activeTab} register={registerPanel}>
              <PatientPrescriptionsTab token={accessToken} patientId={patientId} />
            </TabPanel>
          ) : null}
          {/* DX-191: implantes por diente y tarjeta imprimible. `registerTooth`
              (y `planItem`) llegan del acceso directo del odontograma o del
              plan y abren «Registrar implante» con el diente puesto; al cerrar
              el formulario se limpian de la URL. */}
          {access.implants ? (
            <TabPanel tab="implants" activeTab={activeTab} register={registerPanel}>
              <PatientImplantsTab
                token={accessToken}
                patientId={patientId}
                registerTooth={searchParams.get('registerTooth')}
                registerPlanItemId={searchParams.get('planItem')}
                onShortcutConsumed={() => setParams({ registerTooth: null, planItem: null })}
              />
            </TabPanel>
          ) : null}
          {/* Quién vio o cambió esta ficha (DX-009): solo ADMIN. */}
          {access['access-log'] ? (
            <TabPanel tab="access-log" activeTab={activeTab} register={registerPanel}>
              <AuditLogView token={accessToken} patientId={patientId} />
            </TabPanel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
