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
import { Button } from '@/components/ui/button';
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
  colActions: 'Acciones',
  on: 'Activos',
  off: 'Desactivados',
  configure: 'Configurar',
  configureFor: (name: string) => `Configurar los recordatorios de ${name}`,
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
    return <Badge variant={row.enabled ? 'success' : 'muted'}>{row.enabled ? copy.on : copy.off}</Badge>;
  }

  function leads(row: LocationReminderSettings) {
    return row.enabled ? leadListLabel(row.leadHours) : '—';
  }

  function action(row: LocationReminderSettings) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => openModal(row)}
        aria-label={copy.configureFor(row.locationName)}
        className="w-full sm:w-auto"
      >
        {copy.configure}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
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
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colLocation}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colStatus}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colLeads}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                <span className="sr-only">{copy.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.locationId} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 font-medium">{row.locationName}</td>
                <td className="px-4 py-3">{status(row)}</td>
                <td className="px-4 py-3 tabular-nums">{leads(row)}</td>
                <td className="px-4 py-3 text-right">{action(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {rows.map((row) => (
            <li
              key={row.locationId}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{row.locationName}</span>
                {status(row)}
              </div>
              <p className="text-xs tabular-nums text-muted">{leads(row)}</p>
              {action(row)}
            </li>
          ))}
        </ul>
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
