'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listRecallSettings, type LocationRecallSettings } from '@/lib/recall/recall-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { SettingsSection } from '@/components/settings/settings-page';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { RecallSettingsModal } from './recall-settings-modal';

export const recallSettingsManagerCopy = {
  title: 'Intentos de llamada',
  description:
    'Por sede: cuántos días sale de la lista un paciente tras un intento y con cuántos intentos sin agendar pasa a «Intentos agotados».',
  tableLabel: 'Intentos de llamada por sede',
  colLocation: 'Sede',
  colHide: 'Ocultar tras un intento',
  colMax: 'Tope de intentos',
  days: (n: number) => (n === 1 ? '1 día' : `${n} días`),
  attempts: (n: number) => (n === 1 ? '1 intento' : `${n} intentos`),
  isDefault: 'Por defecto',
  configurePrefix: 'Configurar los intentos de ',
  empty: 'Todavía no hay sedes.',
  emptyHint: 'Crea una sede para configurar sus intentos de llamada.',
  loadError: 'No pudimos cargar los intentos de llamada de las sedes.',
  saved: (name: string) => `Intentos de llamada guardados en ${name}.`,
};
const copy = recallSettingsManagerCopy;

/**
 * Ajustes › Recall › Intentos de llamada (DX-465): una fila por sede con sus
 * días de ocultación y su tope; la fila abre el modal. Patrón del seguimiento
 * de presupuestos (DX-561). Solo ADMIN: la página ya lo comprueba.
 */
export function RecallSettingsManager({ token }: { token: string }) {
  const [rows, setRows] = useState<LocationRecallSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<LocationRecallSettings | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listRecallSettings(token);
        if (cancelled) return;
        setRows(data);
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
  }, [token, reloadKey]);

  const columns: DataListColumn<LocationRecallSettings>[] = [
    {
      id: 'location',
      header: copy.colLocation,
      mobile: 'primary',
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="sr-only">{copy.configurePrefix}</span>
          <span className="break-words font-medium">{row.locationName}</span>
          {row.updatedAt === null ? <Badge variant="neutral">{copy.isDefault}</Badge> : null}
        </span>
      ),
    },
    {
      id: 'hide',
      header: copy.colHide,
      numeric: true,
      cell: (row) => copy.days(row.hideDays),
      mobileCell: (row) => `${copy.colHide}: ${copy.days(row.hideDays)}`,
    },
    {
      id: 'max',
      header: copy.colMax,
      numeric: true,
      cell: (row) => copy.attempts(row.maxAttempts),
      mobileCell: (row) => `${copy.colMax}: ${row.maxAttempts}`,
    },
  ];

  return (
    <SettingsSection title={copy.title} description={copy.description}>
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
        emptyIcon={<Repeat aria-hidden />}
        skeleton={<TableSkeleton rows={2} />}
      >
        <DataList
          label={copy.tableLabel}
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.locationId}
          onRowClick={(row) => {
            setEditing(row);
            setModalKey((k) => k + 1);
          }}
        />
      </AsyncSection>
      {editing ? (
        <RecallSettingsModal
          key={modalKey}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          token={token}
          settings={editing}
          onSaved={(saved) => {
            setRows((prev) => prev.map((r) => (r.locationId === saved.locationId ? saved : r)));
            setAnnouncement(copy.saved(saved.locationName));
          }}
        />
      ) : null}
    </SettingsSection>
  );
}
