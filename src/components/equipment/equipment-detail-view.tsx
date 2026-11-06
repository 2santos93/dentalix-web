'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Archive, Ban, Pencil, Printer, Wrench } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  equipmentPrintHref,
  getEquipment,
  retireEquipment,
  voidMaintenance,
  type EquipmentDetail,
  type EquipmentMaintenance,
} from '@/lib/equipment/equipment-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EquipmentFormModal } from './equipment-form-modal';
import { EquipmentLifeSheet } from './equipment-life-sheet';
import { EquipmentReasonModal } from './equipment-reason-modal';
import { MaintenanceFormModal } from './maintenance-form-modal';
import { equipmentManagerCopy } from './equipment-manager';

export const equipmentDetailCopy = {
  toolbar: 'Acciones del equipo',
  record: 'Registrar mantenimiento',
  edit: 'Editar',
  retire: 'Dar de baja',
  print: 'Imprimir hoja de vida',
  voidMaintenance: 'Anular',
  voidLabel: (date: string) => `Anular el mantenimiento del ${date}`,
  voidTitle: '¿Anular este mantenimiento?',
  voidDescription:
    'Sigue en la hoja de vida, tachado y con el motivo. Si estaba mal cargado, registra después el correcto.',
  voidSubmit: 'Anular mantenimiento',
  voidError: 'No pudimos anular el mantenimiento. Intenta de nuevo.',
  voided: 'Mantenimiento anulado.',
  loading: 'Cargando la hoja de vida…',
  loadError: 'No pudimos cargar la hoja de vida del equipo.',
  notFoundTitle: 'Este equipo no existe en la clínica.',
  notFoundHint: 'Vuelve a la lista de equipos y ábrelo desde ahí.',
};

const copy = equipmentDetailCopy;

type Modal =
  | { kind: 'edit' | 'maintenance' | 'retire'; key: number }
  | { kind: 'void'; maintenance: EquipmentMaintenance; key: number }
  | null;

interface EquipmentDetailViewProps {
  token: string;
  equipmentId: string;
  /**
   * Todas las sedes, también las desactivadas (DX-546 · FE-112): la del equipo
   * da su «hoy» y su moneda aunque esté cerrada.
   */
  locations: ClinicLocation[];
}

/**
 * La hoja de vida de un equipo en Ajustes (DX-542): sus datos, su programa y
 * su historial, con las acciones del ADMIN (registrar un mantenimiento,
 * editar, dar de baja, anular un mantenimiento) y el enlace a la vista
 * imprimible. Tras cada acción se vuelve a leer: el próximo lo decide la API.
 */
export function EquipmentDetailView({ token, equipmentId, locations }: EquipmentDetailViewProps) {
  const [detail, setDetail] = useState<EquipmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [seq, setSeq] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const stamp = useSedeStamp(token, [detail?.locationId]);

  useEffect(() => {
    let cancelled = false;
    getEquipment(token, equipmentId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, equipmentId, reloadKey]);

  if (notFound) {
    return <EmptyState role="status" title={copy.notFoundTitle} description={copy.notFoundHint} />;
  }
  // Escalón 1 también tras una acción: si la recarga falla, la hoja que quedó
  // en pantalla ya no es la de la API (el mantenimiento o la baja sí se
  // guardaron), así que no se deja a la vista como si estuviera al día.
  if (error) {
    return (
      <SectionError
        description={error}
        onRetry={() => {
          setError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!detail) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="h-10 w-full sm:w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const location = locations.find((l) => l.id === detail.locationId);
  const today = location?.timeZone ? sedeToday(location.timeZone) : null;
  const activeEquipment = detail.status === 'ACTIVE';

  function openModal(kind: 'edit' | 'maintenance' | 'retire') {
    setSeq((k) => k + 1);
    setModal({ kind, key: seq + 1 });
  }

  function done(message: string) {
    setAnnouncement(message);
    setReloadKey((k) => k + 1);
  }

  const close = (isOpen: boolean) => {
    if (!isOpen) setModal(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="toolbar" aria-label={copy.toolbar} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {activeEquipment ? (
          <>
            <Button type="button" onClick={() => openModal('maintenance')}>
              <Wrench aria-hidden />
              {copy.record}
            </Button>
            <Button type="button" variant="secondary" onClick={() => openModal('edit')}>
              <Pencil aria-hidden />
              {copy.edit}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => window.open(equipmentPrintHref(detail.id), '_blank', 'noopener')}
        >
          <Printer aria-hidden />
          {copy.print}
        </Button>
        {activeEquipment ? (
          <Button type="button" variant="destructive-ghost" onClick={() => openModal('retire')}>
            <Archive aria-hidden />
            {copy.retire}
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <SedeStampNote stamp={stamp} />

      <div className="rounded-lg border border-border">
        <EquipmentLifeSheet
          equipment={detail}
          stamp={stamp}
          maintenanceActions={(m) =>
            m.voidedAt === null ? (
              <Button
                type="button"
                size="sm"
                variant="destructive-ghost"
                aria-label={copy.voidLabel(stamp.civilDate(m.performedOn, detail.locationId))}
                onClick={() => {
                  setSeq((k) => k + 1);
                  setModal({ kind: 'void', maintenance: m, key: seq + 1 });
                }}
              >
                <Ban aria-hidden />
                {copy.voidMaintenance}
              </Button>
            ) : null
          }
        />
      </div>

      {modal?.kind === 'edit' ? (
        <EquipmentFormModal
          key={modal.key}
          open
          onOpenChange={close}
          token={token}
          locations={locations}
          defaultLocationId={detail.locationId}
          equipment={detail}
          onSaved={(saved) => done(equipmentManagerCopy.saved(saved.name))}
        />
      ) : null}
      {modal?.kind === 'maintenance' ? (
        <MaintenanceFormModal
          key={modal.key}
          open
          onOpenChange={close}
          token={token}
          equipment={detail}
          location={location}
          onSaved={() => done(equipmentManagerCopy.recorded(detail.name))}
        />
      ) : null}
      {modal?.kind === 'retire' ? (
        <EquipmentReasonModal
          key={modal.key}
          open
          onOpenChange={close}
          title={equipmentManagerCopy.retireTitle(detail.name)}
          description={equipmentManagerCopy.retireDescription}
          submitLabel={equipmentManagerCopy.retireSubmit}
          fallbackError={equipmentManagerCopy.retireError}
          withDate={today ? { today, min: detail.acquiredOn } : undefined}
          onConfirm={async ({ reason, date }) => {
            await retireEquipment(token, detail.id, { reason, ...(date ? { retiredOn: date } : {}) });
            done(equipmentManagerCopy.retiredDone(detail.name));
          }}
        />
      ) : null}
      {modal?.kind === 'void' ? (
        <EquipmentReasonModal
          key={modal.key}
          open
          onOpenChange={close}
          title={copy.voidTitle}
          description={copy.voidDescription}
          submitLabel={copy.voidSubmit}
          fallbackError={copy.voidError}
          onConfirm={async ({ reason }) => {
            await voidMaintenance(token, detail.id, modal.maintenance.id, reason);
            done(copy.voided);
          }}
        />
      ) : null}
    </div>
  );
}
