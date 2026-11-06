'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Ban, Lock, Pencil, Plus, ScanLine } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import {
  listRadiologyRecords,
  voidRadiologyRecord,
  type RadiologyRecord,
  type RadiologyStatusFilter,
} from '@/lib/radiology/radiology-api';
import { radiologyKindText, radiologyOfficer } from '@/lib/radiology/radiology-format';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { EquipmentReasonModal } from '@/components/equipment/equipment-reason-modal';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ResultCount } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { StatusBadge } from '@/components/ui/status-badge';
import { RadiologyFormModal } from './radiology-form-modal';

const PAGE_SIZE = 50;

export const radiologyManagerCopy = {
  status: 'Estado',
  statusLive: 'Vigentes y vencidos',
  statusVoided: 'Anulados',
  statusAll: 'Todos',
  newRecord: 'Nuevo documento',
  countNoun: 'documento',
  countNounPlural: 'documentos',
  empty: 'Todavía no hay licencias ni controles de calidad en esta sede',
  emptyClinic: 'Todavía no hay licencias ni controles de calidad en la clínica',
  emptyHint:
    'Registra la licencia de cada equipo de rayos X y su último control de calidad: Inicio avisará 90 días antes de que venzan.',
  emptyReadOnlyHint: 'Administración registra las licencias y los controles de calidad de rayos X.',
  emptyFiltered: 'No hay documentos con ese estado',
  emptyFilteredHint: 'Prueba con otro estado.',
  createRecord: 'Registrar documento',
  loadError: 'No pudimos cargar el expediente de rayos X.',
  forbiddenTitle: 'Solo odontología y administración ven el expediente de rayos X.',
  forbiddenHint: 'Pide a un administrador de la clínica la información de las licencias.',
  readOnly: 'Solo administración registra o cambia el expediente de rayos X.',
  noLocations: 'Todavía no hay sedes.',
  noLocationsHint: 'Crea una sede para llevar su expediente de rayos X.',
  tableLabel: 'Licencias y controles de calidad de rayos X',
  colDocument: 'Documento',
  colLocation: 'Sede',
  colEquipment: 'Equipo',
  colIssuer: 'Emitido por',
  colOfficer: 'Encargado',
  colExpires: 'Vence',
  colStatus: 'Estado',
  wholeSede: 'Toda la sede',
  edit: 'Editar',
  void: 'Anular',
  saved: 'Documento guardado.',
  voidedDone: 'Documento anulado.',
  voidTitle: (what: string) => `¿Anular «${what}»?`,
  voidDescription:
    'Queda en el expediente marcado como anulado y deja de avisar. Úsalo si se registró por error; si se renovó, registra el nuevo documento. No se puede deshacer.',
  voidSubmit: 'Anular documento',
  voidError: 'No pudimos anular el documento. Intenta de nuevo.',
};

const copy = radiologyManagerCopy;

interface RadiologyManagerProps {
  token: string;
  /** DENTIST y ADMIN leen (como la API). */
  canRead: boolean;
  /** Solo ADMIN registra, edita y anula. */
  canManage: boolean;
  /** Todas las sedes de la clínica (también las desactivadas: su «hoy» y su nombre). */
  locations: ClinicLocation[];
  /** La sede activa del selector del shell, si hay una. */
  initialLocationId: string | null;
}

type Modal =
  | { kind: 'form'; record: RadiologyRecord | null; key: number }
  | { kind: 'void'; record: RadiologyRecord; key: number }
  | null;

/** «Licencia · Cat. I LIC-0456»: con qué se reconoce el documento. */
function documentName(record: RadiologyRecord): string {
  return [radiologyKindText(record), record.reference].filter(Boolean).join(' ');
}

/**
 * Ajustes › Rayos X: licencias y control de calidad (DX-544). El expediente
 * de la sede del selector global (sin sede, toda la clínica), del vencimiento
 * más próximo al más lejano, con su estado en el día de cada sede.
 */
export function RadiologyManager({ token, canRead, canManage, locations, initialLocationId }: RadiologyManagerProps) {
  // La sede es la del selector global: `apiFetch` la manda en `X-Location-Id`
  // y cambiarla recarga la vista, así que basta con leerla al montar.
  const activeLocations = locations.filter((l) => l.isActive);
  const activeLocationId = activeLocations.some((l) => l.id === initialLocationId) ? initialLocationId : null;
  const [status, setStatus] = useState<RadiologyStatusFilter>('LIVE');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RadiologyRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [modalSeq, setModalSeq] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const stamp = useSedeStamp(token, rows.map((r) => r.locationId));

  useEffect(() => {
    if (!canRead || activeLocations.length === 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listRadiologyRecords(token, { status, page, pageSize: PAGE_SIZE });
        if (cancelled) return;
        setRows(res.items);
        setTotal(res.total);
        setPageSize(res.pageSize);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, canRead, activeLocations.length, status, page, reloadKey]);

  if (!canRead) {
    return (
      <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
    );
  }
  if (activeLocations.length === 0) {
    return <EmptyState title={copy.noLocations} description={copy.noLocationsHint} />;
  }

  function openForm(record: RadiologyRecord | null) {
    setModalSeq((k) => k + 1);
    setModal({ kind: 'form', record, key: modalSeq + 1 });
  }

  function openVoid(record: RadiologyRecord) {
    setModalSeq((k) => k + 1);
    setModal({ kind: 'void', record, key: modalSeq + 1 });
  }

  function close(isOpen: boolean) {
    if (!isOpen) setModal(null);
  }

  function reload(message: string) {
    setAnnouncement(message);
    setReloadKey((k) => k + 1);
  }

  const filtered = status !== 'LIVE';
  const defaultLocation = activeLocationId ?? activeLocations[0].id;

  const columns: DataListColumn<RadiologyRecord>[] = [
    {
      id: 'document',
      header: copy.colDocument,
      mobile: 'primary',
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{radiologyKindText(r)}</span>
          {r.reference ? <span className="break-words text-xs text-muted">{r.reference}</span> : null}
        </span>
      ),
      mobileCell: (r) => <span className="break-words font-medium">{documentName(r)}</span>,
    },
    ...(activeLocationId === null
      ? [
          {
            id: 'location',
            header: copy.colLocation,
            cell: (r: RadiologyRecord) => r.locationName,
            mobileCell: (r: RadiologyRecord) => r.locationName,
          },
        ]
      : []),
    {
      id: 'equipment',
      header: copy.colEquipment,
      cell: (r) => r.equipmentName ?? <span className="text-muted">{copy.wholeSede}</span>,
      mobileCell: (r) => r.equipmentName,
    },
    {
      id: 'issuer',
      header: copy.colIssuer,
      showFrom: 'xl',
      cell: (r) => <span className="break-words">{r.issuer}</span>,
      mobileCell: () => null,
    },
    {
      id: 'officer',
      header: copy.colOfficer,
      showFrom: 'lg',
      cell: (r) => radiologyOfficer(r) ?? <span className="text-muted">—</span>,
      mobileCell: () => null,
    },
    {
      id: 'expires',
      header: copy.colExpires,
      cellClassName: 'whitespace-nowrap',
      cell: (r) => (
        <time dateTime={r.expiresOn} className="tabular-nums">
          {stamp.civilDate(r.expiresOn, r.locationId)}
        </time>
      ),
      mobileCell: (r) => stamp.maybe.civilDate(r.expiresOn, r.locationId),
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (r) => <StatusBadge kind="radiologyRecord" status={r.status ?? 'VOIDED'} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <NativeSelect
          aria-label={copy.status}
          value={status}
          className="sm:w-52"
          onChange={(e) => {
            setStatus(e.target.value as RadiologyStatusFilter);
            setPage(1);
          }}
        >
          <option value="LIVE">{copy.statusLive}</option>
          <option value="VOIDED">{copy.statusVoided}</option>
          <option value="ALL">{copy.statusAll}</option>
        </NativeSelect>
        {canManage ? (
          <Button type="button" onClick={() => openForm(null)} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newRecord}
          </Button>
        ) : (
          <p className="text-sm text-muted">{copy.readOnly}</p>
        )}
      </div>

      {!loading && !error && rows.length > 0 ? (
        <ResultCount total={total} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <SedeStampNote stamp={stamp} />

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={rows.length === 0}
        emptyTitle={filtered ? copy.emptyFiltered : activeLocationId ? copy.empty : copy.emptyClinic}
        emptyDescription={filtered ? copy.emptyFilteredHint : canManage ? copy.emptyHint : copy.emptyReadOnlyHint}
        emptyIcon={<ScanLine aria-hidden />}
        emptyAction={
          filtered || !canManage ? undefined : (
            <Button type="button" onClick={() => openForm(null)}>
              <Plus aria-hidden /> {copy.createRecord}
            </Button>
          )
        }
        skeleton={<TableSkeleton rows={3} />}
      >
        <DataList
          label={copy.tableLabel}
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          getRowLabel={documentName}
          onRowClick={canManage ? (r) => (r.voidedAt === null ? openForm(r) : undefined) : undefined}
          rowActions={
            canManage
              ? (r) =>
                  r.voidedAt === null
                    ? [
                        { label: copy.edit, icon: <Pencil />, onSelect: () => openForm(r) },
                        {
                          label: copy.void,
                          icon: <Ban />,
                          onSelect: () => openVoid(r),
                          destructive: true,
                          separatorBefore: true,
                        },
                      ]
                    : []
              : undefined
          }
        />
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} disabled={loading} />
      </AsyncSection>

      {modal?.kind === 'form' ? (
        <RadiologyFormModal
          key={modal.key}
          open
          onOpenChange={close}
          token={token}
          locations={locations}
          defaultLocationId={defaultLocation}
          record={modal.record}
          onSaved={() => reload(copy.saved)}
        />
      ) : null}
      {modal?.kind === 'void' ? (
        <EquipmentReasonModal
          key={modal.key}
          open
          onOpenChange={close}
          title={copy.voidTitle(documentName(modal.record))}
          description={copy.voidDescription}
          submitLabel={copy.voidSubmit}
          fallbackError={copy.voidError}
          onConfirm={async ({ reason }) => {
            await voidRadiologyRecord(token, modal.record.id, reason);
            reload(copy.voidedDone);
          }}
        />
      ) : null}
    </div>
  );
}
