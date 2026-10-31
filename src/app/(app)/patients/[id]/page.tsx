'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getPatient, replacePatientKeepingDerived, type Patient } from '@/lib/patients/patients-api';
import { MedicalHistoryPanel } from '@/components/patients/medical-history-panel';
import { ClinicalEntriesList } from '@/components/patients/clinical-entries-list';
import { PatientPostOpDeliveries } from '@/components/postop/patient-postop-deliveries';
import { ClinicalAlertBanner } from '@/components/patients/clinical-alert-banner';
import { AnamnesisReviewLine } from '@/components/clinical/anamnesis-review-line';
import { usePatientMedicalAlerts } from '@/components/clinical/use-patient-medical-alerts';
import { usePatientAttendance } from '@/components/patients/use-patient-attendance';
import { canConfirmAnamnesis } from '@/lib/clinical/medical-alerts';
import {
  PatientDetailTabs,
  type PatientDetailTabKey,
} from '@/components/patients/patient-detail-tabs';
import { PatientDataPanel } from '@/components/patients/patient-data-panel';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';
import { PatientEditModal } from '@/components/patients/patient-edit-modal';
import { PatientRecordHeader } from '@/components/patients/patient-record-header';
import {
  PatientRetentionDialogs,
  PatientRetentionSection,
  retentionActionLabels,
  retentionChip,
  type RetentionDialog,
} from '@/components/patients/patient-retention-section';
import { AnamnesisSendDialog } from '@/components/anamnesis/anamnesis-send-dialog';
import type { RowAction } from '@/components/shared/row-actions';
import { Archive, ClipboardList, Eraser, ShieldCheck } from 'lucide-react';
import { PatientCommunicationSection } from '@/components/patients/patient-communication-section';
import { PatientResponsiblePartiesSection } from '@/components/patients/patient-responsible-parties-section';
import { PatientAgreementSection } from '@/components/patients/patient-agreement-section';
import { PatientCoverageSection } from '@/components/patients/patient-coverage-section';
import { canEditCommunication, withCommunication } from '@/lib/patients/communication-api';
import { OdontogramTab } from '@/components/odontogram/odontogram-tab';
import { TreatmentPlansTab } from '@/components/treatment-plans/treatment-plans-tab';
import { SectionError } from '@/components/errors/section-error';
import { AccountStatementView } from '@/components/account-statement/account-statement-view';
import { PatientCollectionsSection } from '@/components/collections/patient-collections-section';
import { FamilyAccountStatementSection } from '@/components/account-statement/family-account-statement-section';
import { canManageCollections } from '@/lib/collections/presentation';
import { getTokenRole } from '@/lib/auth/token-role';
import { patientTabAccess, resolvePatientTab } from '@/lib/patients/patient-tab-access';
import { DataConsentsTab } from '@/components/data-consents/data-consents-tab';
import { PatientConsentsTab } from '@/components/consents/patient-consents-tab';
import { PerioTab } from '@/components/perio/perio-tab';
import { PatientPrescriptionsTab } from '@/components/prescriptions/patient-prescriptions-tab';
import { PatientImplantsTab } from '@/components/implants/patient-implants-tab';
import { PatientDocumentsTab } from '@/components/patient-documents/patient-documents-tab';
import { PatientTabPanel as TabPanel } from '@/components/patients/patient-tab-panel';
import { canRegisterImplants } from '@/lib/implants/implants-api';
import { AuditLogView } from '@/components/audit/audit-log-view';
import { PatientAnamnesisSection } from '@/components/anamnesis/patient-anamnesis-section';
import { canSeeAnamnesisInbox } from '@/lib/anamnesis/anamnesis-api';

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
  tabDocuments: 'Documentos',
  tabAccessLog: 'Accesos',
  anamnesisHeading: 'Anamnesis',
  entriesHeading: 'Evoluciones',
  postOpHeading: 'Indicaciones entregadas',
  sendAnamnesis: 'Enviar anamnesis',
};

const ANAMNESIS_HEADING_ID = 'patient-anamnesis-form-heading';

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
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
  // Menú «⋯» de la cabecera: modales de retención (ADMIN) y «Enviar anamnesis».
  const [retentionDialog, setRetentionDialog] = useState<RetentionDialog | null>(null);
  const [sendingAnamnesis, setSendingAnamnesis] = useState(false);
  // Sube al generar un enlace: el bloque de anamnesis de la pestaña se relee.
  const [anamnesisVersion, setAnamnesisVersion] = useState(0);
  // «Registrar en Historia clínica» desde «Datos»: al abrir la pestaña, el foco
  // va a la anamnesis y no al principio del panel.
  const focusAnamnesisForm = useRef(false);
  // DX-327 (pre-flight M15): nombres locales de la clínica para «Tipo de
  // documento»; si fallan, el panel pinta los genéricos.
  const docTypeNames = useDocumentTypeNames(accessToken);
  // DX-150: un abono (o su anulación) cambia el saldo vencido de la cabecera y
  // puede cumplir el compromiso del bloque «Cobranza»: los dos se releen.
  const [moneyVersion, setMoneyVersion] = useState(0);
  // DX-151: la cola de «Documentos» tiene archivos sin subir (o subiendo): su
  // panel sigue montado (oculto) al cambiar de pestaña para no perderlos.
  const [documentsPending, setDocumentsPending] = useState(false);
  const onMoneyChanged = useCallback(() => {
    setMoneyVersion((v) => v + 1);
    if (!accessToken) return;
    getPatient(accessToken, patientId)
      .then((fresh) => setPatient((prev) => (prev ? { ...prev, balance: fresh.balance } : prev)))
      .catch(() => {
        /* la cabecera conserva la marca leída; se corrige al recargar */
      });
  }, [accessToken, patientId]);
  // DX-153: guardar o quitar una cobertura cambia el resumen de la cabecera
  // («Cobertura vencida»): se relee y se copia solo `coverage`, como el saldo.
  const onCoverageChanged = useCallback(() => {
    if (!accessToken) return;
    getPatient(accessToken, patientId)
      .then((fresh) => setPatient((prev) => (prev ? { ...prev, coverage: fresh.coverage } : prev)))
      .catch(() => {
        /* la cabecera conserva el resumen leído; se corrige al recargar */
      });
  }, [accessToken, patientId]);
  // DX-105: asignar, cambiar o quitar el convenio cambia el chip «Convenio: X»:
  // se relee y se copia solo `agreement`.
  const onAgreementChanged = useCallback(() => {
    if (!accessToken) return;
    getPatient(accessToken, patientId)
      .then((fresh) => setPatient((prev) => (prev ? { ...prev, agreement: fresh.agreement } : prev)))
      .catch(() => {
        /* la cabecera conserva el resumen leído; se corrige al recargar */
      });
  }, [accessToken, patientId]);
  // DX-247: banderas médicas de la cabecera (también la del plan y del
  // odontograma) y de la línea de revisión de la anamnesis.
  const medicalAlerts = usePatientMedicalAlerts(accessToken, patientId);
  // DX-279: insignia de inasistencias y cancelaciones tardías (12 meses).
  const attendance = usePatientAttendance(accessToken, patientId);
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

  /** La sección «Anamnesis» de «Historia clínica»: destino de «Registrar en Historia clínica». */
  function focusAnamnesisHeading() {
    document.getElementById(ANAMNESIS_HEADING_ID)?.focus();
  }

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
    if (activeTab === 'clinical-history' && focusAnamnesisForm.current) {
      focusAnamnesisForm.current = false;
      focusAnamnesisHeading();
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

  const role = getTokenRole(accessToken);
  const isAdmin = role === 'ADMIN';

  function registerAnamnesis() {
    if (activeTab === 'clinical-history') {
      focusAnamnesisHeading();
      return;
    }
    focusAnamnesisForm.current = true;
    setParams({ tab: 'clinical-history' });
  }

  // Lo que antes eran botones sueltos encima de las pestañas: el menú «⋯» de
  // la cabecera, con los mismos permisos (enviar: los cuatro roles; retención,
  // supresión y archivo: solo ADMIN, y la API lo vuelve a exigir).
  const menuActions: RowAction[] = [
    {
      label: copy.sendAnamnesis,
      icon: <ClipboardList aria-hidden />,
      onSelect: () => setSendingAnamnesis(true),
    },
  ];
  if (isAdmin && patient) {
    menuActions.push({
      label: retentionActionLabels.retention,
      icon: <ShieldCheck aria-hidden />,
      separatorBefore: true,
      onSelect: () => setRetentionDialog('retention'),
    });
    if (patient.underRetention) {
      menuActions.push({
        label: retentionActionLabels.suppress,
        icon: <Eraser aria-hidden />,
        destructive: true,
        onSelect: () => setRetentionDialog('suppress'),
      });
    }
    menuActions.push({
      label: retentionActionLabels.archive,
      icon: <Archive aria-hidden />,
      destructive: true,
      onSelect: () => setRetentionDialog('archive'),
    });
  }

  const anamnesisStatus = medicalAlerts.data?.anamnesisStatus ?? null;
  function anamnesisBlock(context: 'data' | 'clinical-history') {
    if (!accessToken) return null;
    // La línea de revisión (al día / caducada, «Sin cambios hoy»): en
    // «Historia clínica» siempre; en «Datos», solo si caducó (es un aviso).
    const showReview =
      !!medicalAlerts.data &&
      anamnesisStatus !== 'MISSING' &&
      (context === 'clinical-history' || anamnesisStatus === 'EXPIRED');
    return (
      <PatientAnamnesisSection
        token={accessToken}
        patientId={patientId}
        canReview={canSeeAnamnesisInbox(role)}
        status={anamnesisStatus}
        onSend={() => setSendingAnamnesis(true)}
        onRegister={access['clinical-history'] ? registerAnamnesis : undefined}
        refreshKey={anamnesisVersion}
        reviewLine={
          showReview ? (
            <AnamnesisReviewLine
              token={accessToken}
              patientId={patientId}
              alerts={medicalAlerts.data}
              failed={false}
              onReload={medicalAlerts.reload}
              canConfirm={canConfirmAnamnesis(role)}
            />
          ) : null
        }
      />
    );
  }

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
    <div className="flex flex-1 flex-col">
      <PatientRecordHeader
        patient={loading ? null : patient}
        loading={loading}
        onEdit={() => setEditing(true)}
        menuActions={menuActions}
        retention={patient && !loading ? retentionChip(patient) : null}
        medicalAlerts={medicalAlerts.data}
        medicalAlertsFailed={medicalAlerts.failed}
        onRetryMedicalAlerts={medicalAlerts.reload}
        attendance={attendance.data}
        attendanceFailed={attendance.failed}
        onRetryAttendance={attendance.reload}
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
        <div className="flex flex-col gap-6">
          {/* Las pestañas van justo después de la cabecera, en el primer
              viewport también en el móvil, y se quedan pegadas arriba al
              desplazarse (el `main` del shell es el contenedor de scroll). El
              fondo y el margen negativo tapan lo que pasa por debajo. `top`
              negativo = el padding superior del `main`: `sticky` cuenta desde
              su caja de contenido y, con `top-0`, dejaba una franja de 24/32px
              por la que asomaba el contenido. */}
          <div className="sticky -top-6 z-20 -mx-4 bg-canvas px-4 md:-top-8 md:-mx-8 md:px-8">
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
              documentsLabel={access.documents ? copy.tabDocuments : undefined}
              accessLogLabel={access['access-log'] ? copy.tabAccessLog : undefined}
            />
          </div>

          {/* DX-099/DX-039: los diálogos del menú «⋯» viven fuera de las
              pestañas: se abren igual desde cualquiera. */}
          <AnamnesisSendDialog
            open={sendingAnamnesis}
            onOpenChange={setSendingAnamnesis}
            token={accessToken}
            patientId={patientId}
            onCreated={() => setAnamnesisVersion((v) => v + 1)}
          />
          {isAdmin ? (
            <PatientRetentionDialogs
              patient={patient}
              token={accessToken}
              dialog={retentionDialog}
              onDialogChange={setRetentionDialog}
              onUpdated={(next) => setPatient((prev) => replacePatientKeepingDerived(prev, next))}
              onArchived={() => router.push('/patients')}
            />
          ) : null}

          <TabPanel
            tab="data"
            activeTab={activeTab}
            register={registerPanel}
            className="flex flex-col gap-6"
          >
            {/* DX-099/DX-247: «Sin anamnesis» como UN aviso con sus dos
                salidas, y el estado de los enlaces enviados. */}
            {anamnesisBlock('data')}
            <PatientDataPanel patient={patient} docTypeNames={docTypeNames} />
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
            {/* DX-203: quién paga y quién recibe los avisos, y de quién es
                responsable. Lo gestionan los 4 roles. */}
            <PatientResponsiblePartiesSection
              key={`responsibles-${patientId}`}
              token={accessToken}
              patientId={patientId}
            />
            {/* DX-153: pagador, plan y n.º de afiliado. Lo gestionan los 4
                roles; la cabecera se refresca vía `onChanged`. */}
            <PatientCoverageSection
              key={`coverage-${patientId}`}
              token={accessToken}
              patientId={patientId}
              onChanged={onCoverageChanged}
            />
            {/* DX-105: convenio con el que se presupuesta; chip en la cabecera
                vía `onChanged`. */}
            <PatientAgreementSection
              key={`agreement-${patientId}`}
              token={accessToken}
              patientId={patientId}
              onChanged={onAgreementChanged}
              role={getTokenRole(accessToken)}
            />
            {/* DX-039: retención legal (lo ven todos); los controles de ADMIN
                están en el menú «⋯» de la cabecera. */}
            <PatientRetentionSection patient={patient} />
          </TabPanel>

          <PatientEditModal
            open={editing}
            patient={patient}
            token={accessToken}
            docTypeNames={docTypeNames}
            onOpenChange={setEditing}
            // PATCH no trae la marca de saldo (DX-150) ni los resúmenes de cobertura
            // (DX-153) y convenio (DX-105): se conservan los leídos.
            onSaved={(updated) => setPatient((prev) => replacePatientKeepingDerived(prev, updated))}
          />

          {access['clinical-history'] ? (
            <TabPanel
              tab="clinical-history"
              activeTab={activeTab}
              register={registerPanel}
              className="flex flex-col gap-8"
            >
              <div className="flex flex-col gap-3">
                {anamnesisBlock('clinical-history')}
                {/* Las alertas con su detalle (alérgeno, semanas de embarazo):
                    la cabecera ya las lleva como chips en todas las pestañas.
                    «Sin anamnesis» ya lo dice el aviso de arriba. */}
                <ClinicalAlertBanner
                  key={medicalAlerts.version}
                  token={accessToken}
                  patientId={patientId}
                  hideNoHistory
                />
              </div>
              <section className="flex flex-col gap-3">
                <h2
                  id={ANAMNESIS_HEADING_ID}
                  tabIndex={-1}
                  className="t-title scroll-mt-16 text-ink focus-visible:outline-none"
                >
                  {copy.anamnesisHeading}
                </h2>
                <MedicalHistoryPanel
                  token={accessToken}
                  patientId={patientId}
                  onSaved={medicalAlerts.reload}
                />
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="t-title text-ink">{copy.entriesHeading}</h2>
                <ClinicalEntriesList token={accessToken} patientId={patientId} />
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="t-title text-ink">{copy.postOpHeading}</h2>
                <PatientPostOpDeliveries token={accessToken} patientId={patientId} />
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
                // DX-151: los documentos (radiografías, fotos) de ese diente.
                documentsHref={
                  access.documents
                    ? (tooth) => `${pathname}?tab=documents&tooth=${tooth}&from=tooth`
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
                // DX-191: desde el ítem que se ejecuta, «Registrar implante»
                // con el diente y el ítem del plan puestos.
                implantHref={
                  access.implants && canRegisterImplants(getTokenRole(accessToken))
                    ? (item) =>
                        `${pathname}?tab=implants&registerTooth=${item.toothNumber}&planItem=${item.id}`
                    : undefined
                }
              />
            </TabPanel>
          ) : null}

          {access['account-statement'] ? (
            <TabPanel tab="account-statement" activeTab={activeTab} register={registerPanel}>
              <div className="flex flex-col gap-8">
                <AccountStatementView token={accessToken} patientId={patientId} onChanged={onMoneyChanged} />
                {/* DX-203: si es pagador principal de otros pacientes. */}
                <FamilyAccountStatementSection
                  token={accessToken}
                  patientId={patientId}
                  refreshKey={moneyVersion}
                />
                {/* DX-150: bloque «Cobranza» (ADMIN y RECEPTION). */}
                {canManageCollections(getTokenRole(accessToken)) && patient ? (
                  <PatientCollectionsSection
                    token={accessToken}
                    patient={{ id: patient.id, fullName: fullName(patient) }}
                    debtCurrencies={(patient.balance?.amounts ?? []).map((a) => a.currency)}
                    refreshKey={moneyVersion}
                  />
                ) : null}
              </div>
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
          {/* DX-151: documentos del paciente. `?tooth=` llega como filtro
              inicial por diente; solo si se llegó con «Documentos del diente»
              (`from=tooth`) los archivos nuevos traen ese diente puesto. */}
          {access.documents ? (
            <TabPanel
              tab="documents"
              activeTab={activeTab}
              register={registerPanel}
              keepMounted={documentsPending}
            >
              <PatientDocumentsTab
                token={accessToken}
                patientId={patientId}
                initialTooth={focusedTooth}
                tagUploadsWithTooth={searchParams.get('from') === 'tooth'}
                onPendingChange={setDocumentsPending}
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
