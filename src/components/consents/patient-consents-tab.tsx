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
  colActions: 'Acciones',
  signer: (name: string, type: string) => `${name} (${type.toLowerCase()})`,
  version: (v: number) => `Versión ${v} de la plantilla`,
  print: 'Ver e imprimir',
  printHint: (title: string) => `${title} (se abre en otra pestaña)`,
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
        <div>
          <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.receptionSupport}</p>
        </div>
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
        <Badge variant={consent.complete ? 'success' : 'warning'}>
          {consent.complete ? copy.complete : copy.pendingProfessional}
        </Badge>
        {consent.remote ? <Badge variant="muted">{copy.remote}</Badge> : null}
      </span>
    );
  }

  /** Solo el profesional elegido al enviarlo firma lo que falta (la API lo exige). */
  function countersignButton(consent: PatientConsentSummary) {
    if (consent.complete || !consent.remote || consent.remote.professionalUserId !== userId) {
      return null;
    }
    return (
      <Button
        type="button"
        size="sm"
        className="w-full sm:w-auto"
        onClick={() => {
          setCountersignKey((k) => k + 1);
          setCountersigning(consent);
        }}
      >
        <PenLine aria-hidden />
        {copy.countersign}
        <span className="sr-only">{copy.countersignHint(consent.title)}</span>
      </Button>
    );
  }

  function printLink(consent: PatientConsentSummary) {
    return (
      <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
        <a href={consentPrintHref(patientId, consent.id)} target="_blank" rel="noopener">
          <Printer aria-hidden />
          {copy.print}
          <span className="sr-only"> · {copy.printHint(consent.title)}</span>
        </a>
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PatientSignatureRequestsSection
        token={token}
        patientId={patientId}
        userId={userId}
        refreshKey={signaturesKey}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
        </div>
        <Button type="button" onClick={openModal} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {copy.newConsent}
        </Button>
      </div>

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
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colSignedAt}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colDocument}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colSigner}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colProfessional}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colStatus}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                <span className="sr-only">{copy.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {consents.map((consent) => (
              <tr key={consent.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 tabular-nums">{formatDateTime(consent.signedAt)}</td>
                <td className="px-4 py-3">
                  <span className="font-medium">{consent.title}</span>
                  <span className="block text-xs text-muted">
                    {copy.version(consent.templateVersion)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {copy.signer(consent.signerName, SIGNER_TYPE_LABELS[consent.signerType])}
                </td>
                <td className="px-4 py-3 text-muted">{consent.professionalName}</td>
                <td className="px-4 py-3">{status(consent)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-2">
                    {countersignButton(consent)}
                    {printLink(consent)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {consents.map((consent) => (
            <li
              key={consent.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <p className="font-medium">{consent.title}</p>
              <p className="text-muted tabular-nums">{formatDateTime(consent.signedAt)}</p>
              <p>
                {copy.signer(consent.signerName, SIGNER_TYPE_LABELS[consent.signerType])} ·{' '}
                <span className="text-muted">{consent.professionalName}</span>
              </p>
              {status(consent)}
              {countersignButton(consent)}
              {printLink(consent)}
            </li>
          ))}
        </ul>
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
