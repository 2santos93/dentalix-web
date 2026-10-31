'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { FileSignature, PenLine, Plus, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  SIGNER_TYPE_LABELS,
  canUseConsents,
  consentPrintHref,
  listPatientConsents,
  type PatientConsent,
  type PatientConsentSummary,
} from '@/lib/consents/consents-api';
import { formatDateTime } from '@/lib/format/date';
import type { ClinicRole } from '@/lib/me/me-api';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientSignatureRequestsSection } from '@/components/signature-requests/patient-signature-requests-section';
import { CountersignConsentModal } from './countersign-consent-modal';
import { NewConsentModal } from './new-consent-modal';

const copy = {
  heading: 'Consentimientos',
  support: 'Documentos firmados por el paciente. Una vez firmados no se pueden editar ni borrar.',
  newConsent: 'Nuevo consentimiento',
  empty: 'Este paciente no tiene consentimientos firmados.',
  emptyHint: 'Elige una plantilla, revísala con el paciente y firmen los dos en la pantalla.',
  loadError: 'No pudimos cargar los consentimientos.',
  loading: 'Cargando consentimientos',
  tableLabel: 'Consentimientos firmados',
  colSignedAt: 'Firmado',
  colDocument: 'Documento',
  colSigner: 'Firmante',
  colProfessional: 'Profesional',
  rowLabel: (title: string, when: string) => `«${title}» del ${when}`,
  signer: (name: string, type: string) => `${name} (${type.toLowerCase()})`,
  version: (v: number) => `Versión ${v} de la plantilla`,
  print: 'Ver e imprimir',
  newTab: '(se abre en otra pestaña)',
  // DX-243: firma a distancia.
  receptionSupport:
    'Envía consentimientos a firmar a distancia y sigue su estado. El documento firmado lo ven los profesionales.',
  colStatus: 'Estado',
  complete: 'Completo',
  pendingProfessional: 'Falta firma del profesional',
  remote: 'A distancia',
  countersign: 'Firmar como profesional',
  countersignHint: (title: string) => ` · ${title}`,
  countersigned: 'Consentimiento completo: firmaste como profesional.',
  awaitingYouTitle: 'Falta tu firma como profesional',
  awaitingYou: (titles: string[]) =>
    titles.length === 1
      ? `El paciente ya firmó «${titles[0]}» a distancia; el consentimiento queda completo cuando firmes tú.`
      : `El paciente ya firmó ${titles.length} consentimientos a distancia; quedan completos cuando firmes tú.`,
};

interface PatientConsentsTabProps {
  token: string;
  patientId: string;
  /** Rol en esta clínica: recepción solo ve y usa la firma a distancia. */
  role: ClinicRole | null;
  /** Usuario de la sesión: firma como profesional lo que se le envió a él. */
  userId: string | null;
}

function TabSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/**
 * Pestaña «Consentimientos» de la ficha (DX-006): la lista de consentimientos
 * firmados del paciente (append-only: no hay acciones de editar ni borrar) y
 * el modal «Nuevo consentimiento». Cada fila abre la vista imprimible en otra
 * pestaña, como el estado de cuenta.
 *
 * DX-243: arriba, «Firma a distancia» (enviar a firmar por email y el estado
 * de cada envío; también para recepción, que no ve los documentos). Un
 * consentimiento firmado a distancia solo está «Completo» cuando firma el
 * profesional elegido al enviarlo: a él le sale «Firmar como profesional».
 */
export function PatientConsentsTab({ token, patientId, role, userId }: PatientConsentsTabProps) {
  const clinical = canUseConsents(role);
  const [signaturesKey, setSignaturesKey] = useState(0);

  if (!clinical) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader as="h2" title={copy.heading} description={copy.receptionSupport} />
        <PatientSignatureRequestsSection token={token} patientId={patientId} userId={userId} />
      </div>
    );
  }
  return (
    <ClinicalConsents
      token={token}
      patientId={patientId}
      userId={userId}
      signaturesKey={signaturesKey}
      onCountersigned={() => setSignaturesKey((k) => k + 1)}
    />
  );
}

function ClinicalConsents({
  token,
  patientId,
  userId,
  signaturesKey,
  onCountersigned,
}: {
  token: string;
  patientId: string;
  userId: string | null;
  signaturesKey: number;
  onCountersigned: () => void;
}) {
  const [consents, setConsents] = useState<PatientConsentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  // Cada apertura monta un modal nuevo: nada (ni una firma) pasa de una a otra.
  const [modalKey, setModalKey] = useState(0);
  const [countersigning, setCountersigning] = useState<PatientConsentSummary | null>(null);
  const [countersignKey, setCountersignKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientConsents(token, patientId);
        if (cancelled) return;
        setConsents(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  function handleSigned(consent: PatientConsent) {
    // La API devuelve el recién firmado; va arriba (orden: más reciente primero).
    setConsents((prev) => [consent, ...prev]);
  }

  function openModal() {
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function handleCountersigned(updated: PatientConsentSummary) {
    setConsents((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    toast.success(copy.countersigned);
    onCountersigned();
  }

  function status(consent: PatientConsentSummary) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge variant={consent.complete ? 'success' : 'warning'} dot>
          {consent.complete ? copy.complete : copy.pendingProfessional}
        </Badge>
        {consent.remote ? <Badge variant="neutral">{copy.remote}</Badge> : null}
      </span>
    );
  }

  /** Solo el profesional elegido al enviarlo firma lo que falta (la API lo exige). */
  function awaitsMe(consent: PatientConsentSummary): boolean {
    return !consent.complete && Boolean(consent.remote) && consent.remote?.professionalUserId === userId;
  }

  function countersign(consent: PatientConsentSummary) {
    setCountersignKey((k) => k + 1);
    setCountersigning(consent);
  }

  const awaitingMe = consents.filter(awaitsMe);

  const columns: DataListColumn<PatientConsentSummary>[] = [
    {
      id: 'document',
      header: copy.colDocument,
      mobile: 'primary',
      // El documento es el enlace a su vista imprimible (otra pestaña).
      cell: (consent) => (
        <span className="flex flex-col">
          <a
            href={consentPrintHref(patientId, consent.id)}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
          >
            {consent.title}
            <Printer aria-hidden className="size-3.5 text-muted" />
            <span className="sr-only"> · {copy.print} {copy.newTab}</span>
          </a>
          <span className="t-caption">{copy.version(consent.templateVersion)}</span>
        </span>
      ),
    },
    {
      id: 'signedAt',
      header: copy.colSignedAt,
      cell: (consent) => <span className="tnum">{formatDateTime(consent.signedAt)}</span>,
      mobileCell: (consent) => formatDateTime(consent.signedAt),
    },
    {
      id: 'signer',
      header: copy.colSigner,
      cell: (consent) => copy.signer(consent.signerName, SIGNER_TYPE_LABELS[consent.signerType]),
    },
    {
      id: 'professional',
      header: copy.colProfessional,
      cell: (consent) => <span className="text-muted">{consent.professionalName}</span>,
      mobileCell: (consent) => consent.professionalName,
      showFrom: 'lg',
    },
    { id: 'status', header: copy.colStatus, cell: status, mobile: 'trailing' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PatientSignatureRequestsSection
        token={token}
        patientId={patientId}
        userId={userId}
        refreshKey={signaturesKey}
      />
      <SectionHeader
        as="h2"
        title={copy.heading}
        description={copy.support}
        actions={
          <Button type="button" onClick={openModal} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newConsent}
          </Button>
        }
      />

      {awaitingMe.length > 0 ? (
        <Callout
          tone="warning"
          title={copy.awaitingYouTitle}
          action={
            <Button type="button" variant="secondary" onClick={() => countersign(awaitingMe[0])}>
              <PenLine aria-hidden />
              {copy.countersign}
              <span className="sr-only">{copy.countersignHint(awaitingMe[0].title)}</span>
            </Button>
          }
        >
          {copy.awaitingYou(awaitingMe.map((c) => c.title))}
        </Callout>
      ) : null}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={consents.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<FileSignature aria-hidden />}
        skeleton={<TabSkeleton />}
      >
        <DataList
          label={copy.tableLabel}
          rows={consents}
          columns={columns}
          getRowKey={(consent) => consent.id}
          getRowLabel={(consent) => copy.rowLabel(consent.title, formatDateTime(consent.signedAt))}
          rowActions={(consent) => [
            ...(awaitsMe(consent)
              ? [{ label: copy.countersign, icon: <PenLine aria-hidden />, onSelect: () => countersign(consent) }]
              : []),
            {
              label: copy.print,
              icon: <Printer aria-hidden />,
              onSelect: () => {
                window.open(consentPrintHref(patientId, consent.id), '_blank', 'noopener');
              },
            },
          ]}
        />
      </AsyncSection>

      {countersigning ? (
        <CountersignConsentModal
          key={countersignKey}
          open
          onOpenChange={(open) => {
            if (!open) setCountersigning(null);
          }}
          token={token}
          patientId={patientId}
          consent={countersigning}
          onSigned={handleCountersigned}
        />
      ) : null}

      <NewConsentModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        patientId={patientId}
        onSigned={handleSigned}
      />
    </div>
  );
}
