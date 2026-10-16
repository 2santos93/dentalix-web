'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { FileSignature, Plus, Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  SIGNER_TYPE_LABELS,
  consentPrintHref,
  listPatientConsents,
  type PatientConsent,
  type PatientConsentSummary,
} from '@/lib/consents/consents-api';
import { formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
};

interface PatientConsentsTabProps {
  token: string;
  patientId: string;
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
 */
export function PatientConsentsTab({ token, patientId }: PatientConsentsTabProps) {
  const [consents, setConsents] = useState<PatientConsentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  // Cada apertura monta un modal nuevo: nada (ni una firma) pasa de una a otra.
  const [modalKey, setModalKey] = useState(0);

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
                <td className="px-4 py-3 text-right">{printLink(consent)}</td>
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
              {printLink(consent)}
            </li>
          ))}
        </ul>
      </AsyncSection>

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
