'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Pill, Plus, Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import {
  canIssuePrescriptions,
  canVoidPrescription,
  listPatientPrescriptions,
  prescriptionPrintHref,
  type Prescription,
} from '@/lib/prescriptions/prescriptions-api';
import { formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { NewPrescriptionModal } from './new-prescription-modal';
import { VoidPrescriptionModal } from './void-prescription-modal';

const copy = {
  heading: 'Recetas',
  support:
    'Recetas emitidas con los datos legales del país de la sede. Una receta emitida no se edita: solo se anula con motivo.',
  newPrescription: 'Nueva receta',
  empty: 'Este paciente no tiene recetas.',
  emptyHint: 'Emite la primera desde una plantilla o en blanco; se imprime en A4.',
  emptyHintReadOnly: 'Las recetas las emiten odontología y administración.',
  loadError: 'No pudimos cargar las recetas.',
  loading: 'Cargando recetas',
  tableLabel: 'Recetas del paciente',
  colIssued: 'Emitida',
  colMedications: 'Medicamentos',
  colProfessional: 'Profesional',
  colStatus: 'Estado',
  colActions: 'Acciones',
  issued: 'Emitida',
  voided: 'Anulada',
  allergyConfirmed: 'Alergia confirmada',
  voidedDetail: (when: string, who: string, reason: string) =>
    `Anulada el ${when} por ${who}. Motivo: ${reason}`,
  unknownUser: 'un usuario',
  print: 'Ver e imprimir',
  printHint: (when: string) => `receta del ${when} (se abre en otra pestaña)`,
  void: 'Anular',
  voidHint: (when: string) => `receta del ${when}`,
  medication: (rx: Prescription['items'][number]) =>
    `${rx.activeIngredient} ${rx.concentration} · ${rx.totalQuantity} ${rx.quantityUnit}`,
};

interface PatientPrescriptionsTabProps {
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
 * Pestaña «Recetas» de la ficha (DX-013), solo para roles clínicos. Lista las
 * recetas (las anuladas, tachadas con quién, cuándo y por qué), abre la vista
 * imprimible A4 en otra pestaña y, para quien prescribe, «Nueva receta» y
 * «Anular». No hay editar ni borrar: la receta emitida es inmutable.
 */
export function PatientPrescriptionsTab({ token, patientId }: PatientPrescriptionsTabProps) {
  const role = getTokenRole(token);
  const userId = getTokenUserId(token);
  const canIssue = canIssuePrescriptions(role);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [voiding, setVoiding] = useState<Prescription | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientPrescriptions(token, patientId);
        if (cancelled) return;
        setPrescriptions(data);
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

  function openNew() {
    setModalKey((k) => k + 1);
    setNewOpen(true);
  }

  function replace(updated: Prescription) {
    setPrescriptions((prev) => prev.map((rx) => (rx.id === updated.id ? updated : rx)));
  }

  function status(rx: Prescription) {
    return (
      <div className="flex flex-wrap gap-1">
        <Badge variant={rx.status === 'VOIDED' ? 'danger' : 'success'}>
          {rx.status === 'VOIDED' ? copy.voided : copy.issued}
        </Badge>
        {rx.allergyOverride ? <Badge variant="warning">{copy.allergyConfirmed}</Badge> : null}
      </div>
    );
  }

  function medications(rx: Prescription) {
    const voided = rx.status === 'VOIDED';
    return (
      <>
        <ul className={cn('flex flex-col gap-0.5', voided && 'text-muted line-through')}>
          {rx.items.map((item) => (
            <li key={item.id}>{copy.medication(item)}</li>
          ))}
        </ul>
        {(rx.safetyAlerts?.length || rx.allergyMatches.length || rx.safetyOverrideReason || rx.patientWeightKg !== null) ? (
          <details className="mt-2 min-w-0 text-xs text-ink [overflow-wrap:anywhere]">
            <summary className="cursor-pointer font-medium">Detalles de seguridad</summary>
            {rx.patientWeightKg !== null ? <p>Peso: {rx.patientWeightKg} kg</p> : null}
            {rx.safetyRulesVersion ? <p>Reglas: {rx.safetyRulesVersion}</p> : null}
            {rx.safetyAlerts?.map((alert, i) => (
              <p key={`${alert.code}-${i}`}>{alert.message} · {alert.source}</p>
            ))}
            {rx.allergyMatches.map((match, i) => (
              <p key={i}>Alergia: {match.allergen} ({match.activeIngredient})</p>
            ))}
            {rx.safetyOverrideReason ? <p>Motivo: {rx.safetyOverrideReason}</p> : null}
          </details>
        ) : null}
        {voided ? (
          <p className="mt-1 text-xs text-ink">
            {copy.voidedDetail(
              formatDateTime(rx.voidedAt),
              rx.voidedByName ?? copy.unknownUser,
              rx.voidReason ?? '',
            )}
          </p>
        ) : null}
      </>
    );
  }

  function actions(rx: Prescription) {
    const when = formatDateTime(rx.issuedAt);
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
          <a href={prescriptionPrintHref(patientId, rx.id)} target="_blank" rel="noopener">
            <Printer aria-hidden />
            {copy.print}
            <span className="sr-only"> · {copy.printHint(when)}</span>
          </a>
        </Button>
        {canVoidPrescription(rx, { role, userId }) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setVoiding(rx)}
          >
            {copy.void}
            <span className="sr-only"> · {copy.voidHint(when)}</span>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
        </div>
        {canIssue ? (
          <Button type="button" onClick={openNew} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newPrescription}
          </Button>
        ) : null}
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={prescriptions.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={canIssue ? copy.emptyHint : copy.emptyHintReadOnly}
        emptyIcon={<Pill aria-hidden />}
        skeleton={<TabSkeleton />}
      >
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colIssued}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colMedications}
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
            {prescriptions.map((rx) => (
              <tr
                key={rx.id}
                data-status={rx.status}
                className="border-b border-hairline align-top last:border-0"
              >
                <td className="px-4 py-3 tabular-nums">{formatDateTime(rx.issuedAt)}</td>
                <td className="px-4 py-3">{medications(rx)}</td>
                <td className="px-4 py-3 text-muted">{rx.professionalName}</td>
                <td className="px-4 py-3">{status(rx)}</td>
                <td className="px-4 py-3">{actions(rx)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {prescriptions.map((rx) => (
            <li
              key={rx.id}
              data-status={rx.status}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="tabular-nums text-muted">{formatDateTime(rx.issuedAt)}</p>
                {status(rx)}
              </div>
              {medications(rx)}
              <p className="text-muted">{rx.professionalName}</p>
              {actions(rx)}
            </li>
          ))}
        </ul>
      </AsyncSection>

      {canIssue ? (
        <NewPrescriptionModal
          key={modalKey}
          open={newOpen}
          onOpenChange={setNewOpen}
          token={token}
          patientId={patientId}
          onIssued={(rx) => setPrescriptions((prev) => [rx, ...prev])}
        />
      ) : null}
      {voiding ? (
        <VoidPrescriptionModal
          key={voiding.id}
          open
          onOpenChange={(open) => {
            if (!open) setVoiding(null);
          }}
          token={token}
          prescriptionId={voiding.id}
          onVoided={replace}
        />
      ) : null}
    </div>
  );
}
