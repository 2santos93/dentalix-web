'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { BellRing, Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  leadListLabel,
  listReminderSettings,
  type LocationReminderSettings,
} from '@/lib/reminders/reminders-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { ReminderSettingsModal } from './reminder-settings-modal';

const copy = {
  count: (n: number) => (n === 1 ? '1 sede' : `${n} sedes`),
  active: (n: number) =>
    n === 0 ? 'ninguna con recordatorios' : n === 1 ? '1 con recordatorios' : `${n} con recordatorios`,
  empty: 'Todavía no hay sedes.',
  emptyHint: 'Crea una sede para configurar sus recordatorios.',
  loadError: 'No pudimos cargar los recordatorios de las sedes.',
  forbiddenTitle: 'Solo administración configura los recordatorios.',
  forbiddenHint: 'En el detalle de cada cita puedes ver si al paciente le llegó el suyo.',
  tableLabel: 'Recordatorios por sede',
  colLocation: 'Sede',
  colStatus: 'Estado',
  colLeads: 'Cuándo se envían',
  none: 'Sin recordatorios',
  on: 'Activos',
  off: 'Desactivados',
  /** Delante del nombre de la sede, solo para lectores: «Configurar los recordatorios de Sede Norte». */
  configurePrefix: 'Configurar los recordatorios de ',
  saved: (name: string, enabled: boolean) =>
    enabled ? `Recordatorios activados en ${name}.` : `Recordatorios desactivados en ${name}.`,
};

interface ReminderSettingsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol también para leer). */
  allowed: boolean;
}

/**
 * Ajustes → Recordatorios (DX-026): una fila por sede con su estado y sus
 * antelaciones; «Configurar» abre el formulario en un modal. Lo que se cambia
 * aplica a los recordatorios que aún no han salido.
 */
export function ReminderSettingsManager({ token, allowed }: ReminderSettingsManagerProps) {
  const [rows, setRows] = useState<LocationReminderSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<LocationReminderSettings | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listReminderSettings(token);
        if (cancelled) return;
        setRows(data);
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
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  function openModal(row: LocationReminderSettings) {
    setEditing(row);
    setModalKey((k) => k + 1);
  }

  function handleSaved(saved: LocationReminderSettings) {
    setRows((prev) => prev.map((r) => (r.locationId === saved.locationId ? saved : r)));
    setAnnouncement(copy.saved(saved.locationName, saved.enabled));
  }

  const activeCount = rows.filter((r) => r.enabled).length;

  function status(row: LocationReminderSettings) {
    return <Badge variant={row.enabled ? 'success' : 'neutral'}>{row.enabled ? copy.on : copy.off}</Badge>;
  }

  const columns: DataListColumn<LocationReminderSettings>[] = [
    {
      id: 'location',
      header: copy.colLocation,
      mobile: 'primary',
      // La fila entera abre el modal; el nombre del botón dice qué hace.
      cell: (row) => (
        <>
          <span className="sr-only">{copy.configurePrefix}</span>
          <span className="break-words font-medium">{row.locationName}</span>
        </>
      ),
    },
    { id: 'status', header: copy.colStatus, mobile: 'trailing', cell: status },
    {
      id: 'leads',
      header: copy.colLeads,
      mobile: 'meta',
      cellClassName: 'tabular-nums',
      cell: (row) => (row.enabled ? leadListLabel(row.leadHours) : copy.none),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="min-h-5 text-sm text-muted tabular-nums">
        {loading || error ? '' : `${copy.count(rows.length)} · ${copy.active(activeCount)}`}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={rows.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<BellRing aria-hidden />}
        skeleton={<TableSkeleton rows={2} />}
      >
        <DataList
          label={copy.tableLabel}
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.locationId}
          onRowClick={openModal}
        />
      </AsyncSection>

      {editing && (
        <ReminderSettingsModal
          key={modalKey}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          token={token}
          settings={editing}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
