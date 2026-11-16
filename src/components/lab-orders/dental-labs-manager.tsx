'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Factory, Pencil, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import {
  canManageDentalLabs,
  listDentalLabs,
  referencePriceAmount,
  updateDentalLab,
  updateDentalLabService,
  type DentalLab,
  type DentalLabService,
} from '@/lib/lab-orders/lab-orders-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DentalLabFormModal } from './dental-lab-form-modal';
import { DentalLabServiceFormModal } from './dental-lab-service-form-modal';

export const dentalLabsManagerCopy = {
  newLab: 'Nuevo laboratorio',
  newService: 'Añadir servicio',
  count: (n: number) => (n === 1 ? '1 laboratorio' : `${n} laboratorios`),
  empty: 'Aún no hay laboratorios dentales',
  emptyHint: 'Añade el laboratorio al que mandas coronas y prótesis, y sus servicios con el plazo en días hábiles.',
  emptyReadOnly: 'Los laboratorios los añade administración.',
  loadError: 'No pudimos cargar los laboratorios dentales.',
  labActions: (name: string) => `Acciones de ${name}`,
  contact: (parts: string[]) => parts.join(' · '),
  servicesLabel: (name: string) => `Servicios de ${name}`,
  noServices: 'Sin servicios. Con un servicio, la orden calcula sola la fecha prometida.',
  colService: 'Servicio',
  colLeadTime: 'Plazo',
  colPrice: 'Precio de referencia',
  colStatus: 'Estado',
  leadTime: (days: number) => (days === 1 ? '1 día hábil' : `${days} días hábiles`),
  noPrice: 'Sin precio',
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
};

const copy = dentalLabsManagerCopy;

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, 'es');
}

type Editing =
  | { kind: 'lab'; lab: DentalLab | null; key: number }
  | { kind: 'service'; lab: DentalLab; service: DentalLabService | null; key: number }
  | null;

/**
 * Ajustes › Laboratorios dentales (DX-017): cada laboratorio con sus servicios
 * (plazo en días hábiles y precio de referencia). ADMIN crea, edita, desactiva
 * y activa; nada se borra. El resto de roles lo ve sin botones (la API les
 * devuelve el precio vacío).
 */
export function DentalLabsManager({ token }: { token: string }) {
  const canManage = canManageDentalLabs(getTokenRole(token));
  const stamp = useSedeStamp(token);
  const [labs, setLabs] = useState<DentalLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listDentalLabs(token, { includeInactive: true });
        if (cancelled) return;
        setLabs([...data].sort(byName));
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
  }, [token, reloadKey]);

  function nextKey(): number {
    return (editing?.key ?? 0) + 1;
  }

  function upsertLab(saved: DentalLab) {
    setLabs((prev) => [...prev.filter((l) => l.id !== saved.id), saved].sort(byName));
  }

  function upsertService(saved: DentalLabService) {
    setLabs((prev) =>
      prev.map((l) =>
        l.id === saved.labId
          ? { ...l, services: [...l.services.filter((s) => s.id !== saved.id), saved].sort(byName) }
          : l,
      ),
    );
  }

  async function toggleLab(lab: DentalLab) {
    try {
      upsertLab(await updateDentalLab(token, lab.id, { active: !lab.active }));
    } catch (err) {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(apiErrorMessage(err, copy.toggleError(lab.name)), { onRetry: () => void toggleLab(lab) });
    }
  }

  async function toggleService(lab: DentalLab, service: DentalLabService) {
    try {
      upsertService(await updateDentalLabService(token, lab.id, service.id, { active: !service.active }));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.toggleError(service.name)), {
        onRetry: () => void toggleService(lab, service),
      });
    }
  }

  function labActions(lab: DentalLab): RowAction[] {
    return [
      { label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => setEditing({ kind: 'lab', lab, key: nextKey() }) },
      {
        label: copy.newService,
        icon: <Plus aria-hidden />,
        onSelect: () => setEditing({ kind: 'service', lab, service: null, key: nextKey() }),
      },
      {
        label: lab.active ? copy.deactivate : copy.activate,
        icon: lab.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />,
        onSelect: () => void toggleLab(lab),
      },
    ];
  }

  function serviceColumns(): DataListColumn<DentalLabService>[] {
    const columns: DataListColumn<DentalLabService>[] = [
      {
        id: 'name',
        header: copy.colService,
        mobile: 'primary',
        cell: (s) => <span className="font-medium [overflow-wrap:anywhere]">{s.name}</span>,
      },
      {
        id: 'lead',
        header: copy.colLeadTime,
        cell: (s) => <span className="t-data">{copy.leadTime(s.leadTimeBusinessDays)}</span>,
      },
    ];
    if (canManage) {
      columns.push({
        id: 'price',
        header: copy.colPrice,
        numeric: true,
        cell: (s) => {
          const amount = referencePriceAmount(s);
          return amount !== null && s.referenceCurrency ? (
            stamp.money(amount, s.referenceCurrency)
          ) : (
            <span className="text-muted">{copy.noPrice}</span>
          );
        },
        mobileCell: (s) => {
          const amount = referencePriceAmount(s);
          return amount !== null && s.referenceCurrency ? stamp.money(amount, s.referenceCurrency) : null;
        },
      });
    }
    columns.push({
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (s) => <Badge variant={s.active ? 'success' : 'neutral'}>{s.active ? copy.active : copy.inactive}</Badge>,
    });
    return columns;
  }

  const showBar = canManage && !loading && !error && labs.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {showBar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted" aria-live="polite">
            {copy.count(labs.length)}
          </p>
          <Button type="button" onClick={() => setEditing({ kind: 'lab', lab: null, key: nextKey() })}>
            <Plus aria-hidden />
            {copy.newLab}
          </Button>
        </div>
      ) : null}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={3} />}
        isEmpty={labs.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={canManage ? copy.emptyHint : copy.emptyReadOnly}
        emptyIcon={<Factory aria-hidden />}
        emptyAction={
          canManage ? (
            <Button type="button" onClick={() => setEditing({ kind: 'lab', lab: null, key: nextKey() })}>
              <Plus aria-hidden />
              {copy.newLab}
            </Button>
          ) : null
        }
      >
        <ul className="flex flex-col gap-8">
          {labs.map((lab) => {
            const contact = [lab.contactName, lab.phone, lab.email].filter((v): v is string => Boolean(v));
            return (
              <li key={lab.id} className="flex min-w-0 flex-col gap-3" aria-labelledby={`lab-${lab.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id={`lab-${lab.id}`} className="t-title text-ink [overflow-wrap:anywhere]">
                        {lab.name}
                      </h3>
                      {!lab.active ? <Badge variant="neutral">{copy.inactive}</Badge> : null}
                    </div>
                    {contact.length > 0 ? (
                      <p className="text-sm text-muted [overflow-wrap:anywhere]">{copy.contact(contact)}</p>
                    ) : null}
                    {lab.notes ? <p className="text-sm text-muted [overflow-wrap:anywhere]">{lab.notes}</p> : null}
                  </div>
                  {canManage ? (
                    <RowActions label={copy.labActions(lab.name)} actions={labActions(lab)} className="shrink-0" />
                  ) : null}
                </div>
                {lab.services.length === 0 ? (
                  <p className="text-sm text-muted">{copy.noServices}</p>
                ) : (
                  <DataList
                    label={copy.servicesLabel(lab.name)}
                    rows={lab.services}
                    columns={serviceColumns()}
                    getRowKey={(s) => s.id}
                    getRowLabel={(s) => s.name}
                    onRowClick={canManage ? (s) => setEditing({ kind: 'service', lab, service: s, key: nextKey() }) : undefined}
                    rowActions={
                      canManage
                        ? (s) => [
                            {
                              label: copy.edit,
                              icon: <Pencil aria-hidden />,
                              onSelect: () => setEditing({ kind: 'service', lab, service: s, key: nextKey() }),
                            },
                            {
                              label: s.active ? copy.deactivate : copy.activate,
                              icon: s.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />,
                              onSelect: () => void toggleService(lab, s),
                            },
                          ]
                        : undefined
                    }
                  />
                )}
                {canManage ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start max-sm:min-h-11"
                    onClick={() => setEditing({ kind: 'service', lab, service: null, key: nextKey() })}
                  >
                    <Plus aria-hidden />
                    {copy.newService}
                    <span className="sr-only"> · {lab.name}</span>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </AsyncSection>

      {editing?.kind === 'lab' ? (
        <DentalLabFormModal
          key={editing.key}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          token={token}
          lab={editing.lab}
          onSaved={upsertLab}
        />
      ) : null}
      {editing?.kind === 'service' ? (
        <DentalLabServiceFormModal
          key={editing.key}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          token={token}
          lab={editing.lab}
          service={editing.service}
          onSaved={upsertService}
        />
      ) : null}
    </div>
  );
}
