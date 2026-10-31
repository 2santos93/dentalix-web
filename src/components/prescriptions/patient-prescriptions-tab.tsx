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
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
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
  colDocument: 'Documento',
  issued: 'Emitida',
  voided: 'Anulada',
  allergyConfirmed: 'Alergia confirmada',
  voidedDetail: (when: string, who: string, reason: string) =>
    `Anulada el ${when} por ${who}. Motivo: ${reason}`,
  unknownUser: 'un usuario',
  print: 'Ver e imprimir',
  printHint: (when: string) => `receta del ${when} (se abre en otra pestaña)`,
  void: 'Anular',
  rowLabel: (when: string) => `receta del ${when}`,
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
        <StatusBadge kind="prescription" status={rx.status} />
        {rx.allergyOverride ? <Badge variant="warning">{copy.allergyConfirmed}</Badge> : null}
      </div>
    );
  }

  function medications(rx: Prescription) {
    const voided = rx.status === 'VOIDED';
    // `data-status`: la fila de la tabla no admite atributos propios; el e2e
    // localiza la receta anulada por aquí.
    return (
      <div data-status={rx.status} className="min-w-0">
        <ul className={cn('flex flex-col gap-0.5', voided && 'text-muted line-through')}>
          {rx.items.map((item) => (
            <li key={item.id}>{copy.medication(item)}</li>
          ))}
        </ul>
        {(rx.safetyAlerts?.length || rx.allergyMatches.length || rx.safetyOverrideReason || rx.patientWeightKg !== null) ? (
          <details className="t-caption mt-2 min-w-0 text-ink [overflow-wrap:anywhere]">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium sm:min-h-0">Detalles de seguridad</summary>
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
          <p className="t-caption mt-1 text-ink">
            {copy.voidedDetail(
              formatDateTime(rx.voidedAt),
              rx.voidedByName ?? copy.unknownUser,
              rx.voidReason ?? '',
            )}
          </p>
        ) : null}
      </div>
    );
  }

  function printLink(rx: Prescription) {
    return (
      <Button asChild variant="secondary" size="sm">
        <a href={prescriptionPrintHref(patientId, rx.id)} target="_blank" rel="noopener">
          <Printer aria-hidden />
          {copy.print}
          <span className="sr-only"> · {copy.printHint(formatDateTime(rx.issuedAt))}</span>
        </a>
      </Button>
    );
  }

  const columns: DataListColumn<Prescription>[] = [
    {
      id: 'issued',
      header: copy.colIssued,
      mobile: 'primary',
      cell: (rx) => <span className="t-data">{formatDateTime(rx.issuedAt)}</span>,
      cellClassName: 'align-top whitespace-nowrap',
    },
    {
      id: 'medications',
      header: copy.colMedications,
      // En la tarjeta del teléfono, en su propia línea: es lo que se viene a leer.
      mobileCell: (rx) => <span className="block text-ink">{medications(rx)}</span>,
      cell: medications,
      cellClassName: 'align-top',
    },
    {
      id: 'professional',
      header: copy.colProfessional,
      cell: (rx) => <span className="text-muted">{rx.professionalName}</span>,
      mobileCell: (rx) => rx.professionalName,
      cellClassName: 'align-top',
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: status,
      cellClassName: 'align-top',
    },
    {
      id: 'document',
      header: <span className="sr-only">{copy.colDocument}</span>,
      mobileCell: (rx) => <span className="mt-2 block">{printLink(rx)}</span>,
      cell: printLink,
      align: 'end',
      cellClassName: 'align-top',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={copy.heading}
        description={<span className="block max-w-[68ch]">{copy.support}</span>}
        actions={
          canIssue ? (
            <Button type="button" onClick={openNew} className="w-full sm:w-auto">
              <Plus aria-hidden />
              {copy.newPrescription}
            </Button>
          ) : null
        }
      />

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
        {/* Sin «Editar» ni «Borrar»: la receta emitida es inmutable; solo se anula. */}
        <DataList
          label={copy.tableLabel}
          rows={prescriptions}
          columns={columns}
          getRowKey={(rx) => rx.id}
          getRowLabel={(rx) => copy.rowLabel(formatDateTime(rx.issuedAt))}
          rowActions={(rx) =>
            canVoidPrescription(rx, { role, userId })
              ? [{ label: copy.void, onSelect: () => setVoiding(rx), destructive: true }]
              : []
          }
        />
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
