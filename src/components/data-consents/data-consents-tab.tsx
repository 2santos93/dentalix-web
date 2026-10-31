'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EMPTY_SELECTION,
  SCOPE_LABELS,
  decisionsFromSelection,
  getPatientDataConsents,
  getPrivacyPolicies,
  recordDataConsents,
  type ConsentSelection,
  type DataConsentRecord,
  type PatientDataConsents,
  type PrivacyPolicyVersion,
  type ScopeConsentStatus,
} from '@/lib/data-consents/data-consents-api';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormModal } from '@/components/shared/form-modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { ConsentScopeFields } from './consent-scope-fields';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  title: 'Autorizaciones de datos',
  description:
    'Prueba de la autorización de tratamiento de datos: cada aceptación o revocación queda registrada con la versión de la política, quién la registró y cuándo. Nada se edita ni se borra.',
  record: 'Registrar autorización',
  recordTitle: 'Registrar autorización de datos',
  recordDescription:
    'Marca solo lo que el paciente autoriza ahora de forma expresa. Lo que ya tiene autorizado no aparece.',
  recordSubmit: 'Registrar',
  recordNothing: 'Marca al menos una autorización para registrarla.',
  currentHeading: 'Estado vigente',
  historyHeading: 'Historial',
  historyTable: 'Historial de autorizaciones',
  granted: 'Autorizado',
  denied: 'No autorizado',
  pending: 'Sin decisión',
  since: (date: string) => `desde el ${date}`,
  legacyNote: 'Registro heredado, sin texto versionado',
  revokeMarketing: 'Revocar',
  revokeTitle: 'Revocar comunicaciones comerciales',
  revokeDescription:
    'El paciente deja de recibir comunicaciones comerciales. Queda registrado como una revocación nueva; la autorización anterior se conserva en el historial.',
  revokeConfirm: 'Revocar',
  emptyTitle: 'Este paciente aún no tiene autorizaciones registradas.',
  emptyWithPolicy: 'Registra lo que el paciente autoriza con el texto vigente de la política.',
  emptyNoPolicy:
    'La clínica aún no ha publicado su política de tratamiento de datos: un administrador debe publicarla en Ajustes › Privacidad de datos.',
  loadError: 'No pudimos cargar las autorizaciones del paciente.',
  saveError: 'No pudimos registrar la decisión. Intenta de nuevo.',
  colDate: 'Fecha',
  colScope: 'Autorización',
  colDecision: 'Decisión',
  colVersion: 'Versión',
  colBy: 'Registró',
  colChannel: 'Canal',
  decisionGranted: 'Aceptó',
  decisionDenied: 'Revocó / no autorizó',
  channelInPerson: 'En la clínica',
  channelLegacy: 'Heredado',
  // DX-099: la dio el propio paciente en el enlace de anamnesis.
  channelPatientLink: 'El paciente, por enlace',
  unknownUser: '—',
};

interface DataConsentsTabProps {
  token: string;
  patientId: string;
}

interface LoadedState {
  consents: PatientDataConsents;
  policy: PrivacyPolicyVersion | null;
}

function errorMessage(err: unknown, fallback: string): string {
  // 409 (política cambiada / sin publicar) y 400 traen un mensaje para la persona
  // en español: `apiErrorMessage` lo conserva y sustituye el resto.
  return apiErrorMessage(err, fallback);
}

/**
 * Pestaña «Autorizaciones» de la ficha (DX-037). Patrón de carga de la app
 * (estado local + `useEffect` + `AsyncSection`). Escribir es siempre AÑADIR
 * una fila (registrar o revocar): la UI no ofrece editar ni borrar porque el
 * modelo no lo permite.
 */
export function DataConsentsTab({ token, patientId }: DataConsentsTabProps) {
  const [data, setData] = useState<LoadedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [recordOpen, setRecordOpen] = useState(false);
  const [selection, setSelection] = useState<ConsentSelection>(EMPTY_SELECTION);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const headingId = React.useId();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [consents, policies] = await Promise.all([
          getPatientDataConsents(token, patientId),
          getPrivacyPolicies(token),
        ]);
        if (cancelled) return;
        setData({ consents, policy: policies.current });
        setError(null);
      } catch {
        if (cancelled) return;
        setError(copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  const policy = data?.policy ?? null;
  const current = data?.consents.current ?? [];
  const grantedScopes = current.filter((c) => c.granted === true).map((c) => c.scope);
  const canRecord = policy !== null && grantedScopes.length < current.length;
  const marketingGranted = grantedScopes.includes('MARKETING');

  async function save(decisions: ReturnType<typeof decisionsFromSelection>, close: () => void) {
    if (!policy) return;
    setSaving(true);
    setSaveError(null);
    try {
      const consents = await recordDataConsents(token, patientId, {
        policyVersionId: policy.id,
        decisions,
      });
      setData({ consents, policy });
      close();
    } catch (err) {
      setSaveError(errorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  function openRecord() {
    setSelection(EMPTY_SELECTION);
    setSaveError(null);
    setRecordOpen(true);
  }

  function handleRecordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const decisions = decisionsFromSelection(selection);
    if (decisions.length === 0) {
      setSaveError(copy.recordNothing);
      return;
    }
    void save(decisions, () => setRecordOpen(false));
  }

  const empty = data !== null && data.consents.history.length === 0;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHeader
        as="h2"
        titleId={headingId}
        title={copy.title}
        description={<span className="block max-w-[68ch]">{copy.description}</span>}
        actions={
          !loading && !error && canRecord ? (
            <Button variant="secondary" className="w-full sm:w-auto" onClick={openRecord}>
              <ShieldCheck aria-hidden />
              {copy.record}
            </Button>
          ) : undefined
        }
      />

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={empty}
        emptyTitle={copy.emptyTitle}
        emptyDescription={policy ? copy.emptyWithPolicy : copy.emptyNoPolicy}
        emptyIcon={<ShieldCheck aria-hidden />}
        skeleton={<TableSkeleton rows={3} />}
      >
        {data ? (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <SectionHeader as="h3" title={copy.currentHeading} />
              <ul className="divide-y divide-border-subtle rounded-lg border border-border bg-surface">
                {current.map((status) => (
                  <CurrentRow
                    key={status.scope}
                    status={status}
                    onRevoke={
                      status.scope === 'MARKETING' && marketingGranted && policy
                        ? () => {
                            setSaveError(null);
                            setRevokeOpen(true);
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <SectionHeader as="h3" title={copy.historyHeading} />
              <HistoryTable rows={data.consents.history} />
            </div>
          </div>
        ) : null}
      </AsyncSection>

      {policy ? (
        <FormModal
          open={recordOpen}
          onOpenChange={setRecordOpen}
          title={copy.recordTitle}
          description={copy.recordDescription}
          onSubmit={handleRecordSubmit}
          submitLabel={copy.recordSubmit}
          submitting={saving}
          error={saveError}
          size="lg"
        >
          <ConsentScopeFields
            idPrefix="dct-consent"
            policy={policy}
            value={selection}
            onChange={setSelection}
            hiddenScopes={grantedScopes}
          />
        </FormModal>
      ) : null}

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={copy.revokeTitle}
        description={copy.revokeDescription}
        confirmLabel={copy.revokeConfirm}
        confirming={saving}
        error={saveError}
        onConfirm={() =>
          void save([{ scope: 'MARKETING', granted: false }], () => setRevokeOpen(false))
        }
      />
    </section>
  );
}

function DecisionBadge({ granted }: { granted: boolean | null }) {
  const status = granted === true ? 'GRANTED' : granted === false ? 'DENIED' : 'UNDECIDED';
  return <StatusBadge kind="dataConsent" status={status} />;
}

function versionLabel(row: DataConsentRecord): string {
  if (row.policyVersion) return `v${row.policyVersion.version}`;
  return row.legacyPolicyVersion ?? '—';
}

function CurrentRow({
  status,
  onRevoke,
}: {
  status: ScopeConsentStatus;
  onRevoke?: () => void;
}) {
  const latest = status.latest;
  return (
    <li
      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`consent-status-${status.scope}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-ink">{SCOPE_LABELS[status.scope]}</span>
        {latest ? (
          <span className="text-xs text-muted tabular-nums">
            {copy.since(formatDate(latest.recordedAt))} · {versionLabel(latest)}
            {latest.channel === 'LEGACY' ? ` · ${copy.legacyNote}` : ''}
          </span>
        ) : null}
      </div>
      {/* La columna de la acción se reserva en todas las filas: los chips
          quedan alineados aunque solo una fila pueda revocarse. */}
      <div className="flex items-center gap-3 sm:justify-end">
        <DecisionBadge granted={status.granted} />
        <span className="flex sm:w-24 sm:justify-end">
          {onRevoke ? (
            <Button variant="secondary" size="sm" onClick={onRevoke}>
              {copy.revokeMarketing}
              <span className="sr-only"> {SCOPE_LABELS.MARKETING.toLowerCase()}</span>
            </Button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

function channelLabel(row: DataConsentRecord): string {
  return row.channel === 'LEGACY'
    ? copy.channelLegacy
    : row.channel === 'PATIENT_LINK'
      ? copy.channelPatientLink
      : copy.channelInPerson;
}

const historyColumns: DataListColumn<DataConsentRecord>[] = [
  {
    id: 'date',
    header: copy.colDate,
    cell: (row) => <span className="tnum">{formatDateTime(row.recordedAt)}</span>,
    mobileCell: (row) => formatDateTime(row.recordedAt),
  },
  { id: 'scope', header: copy.colScope, cell: (row) => SCOPE_LABELS[row.scope], mobile: 'primary' },
  {
    id: 'decision',
    header: copy.colDecision,
    mobile: 'trailing',
    cell: (row) => (
      <StatusBadge kind="dataConsent" status={row.granted ? 'GRANTED' : 'DENIED'}>
        {row.granted ? copy.decisionGranted : copy.decisionDenied}
      </StatusBadge>
    ),
  },
  { id: 'version', header: copy.colVersion, cell: (row) => <span className="tnum">{versionLabel(row)}</span>, mobileCell: versionLabel },
  { id: 'by', header: copy.colBy, cell: (row) => row.recordedBy?.fullName ?? copy.unknownUser },
  {
    id: 'channel',
    header: copy.colChannel,
    cell: (row) => <span className="text-muted">{channelLabel(row)}</span>,
    mobileCell: channelLabel,
  },
];

function HistoryTable({ rows }: { rows: DataConsentRecord[] }) {
  return (
    <DataList label={copy.historyTable} rows={rows} columns={historyColumns} getRowKey={(row) => row.id} />
  );
}
