'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Lock, MailCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';
import { locationFormat } from '@/lib/locations/location-settings';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import {
  listQuoteFollowUpSettings,
  offsetsLabel,
  type LocationQuoteFollowUpSettings,
} from '@/lib/treatment-plans/quote-follow-up-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { followUpHourLabel, QuoteFollowUpSettingsModal } from './quote-follow-up-settings-modal';

export const quoteFollowUpManagerCopy = {
  count: (n: number) => (n === 1 ? '1 sede' : `${n} sedes`),
  active: (n: number) =>
    n === 0 ? 'ninguna con seguimiento' : n === 1 ? '1 con seguimiento' : `${n} con seguimiento`,
  empty: 'Todavía no hay sedes.',
  emptyHint: 'Crea una sede para configurar su seguimiento.',
  loadError: 'No pudimos cargar el seguimiento automático de las sedes.',
  forbiddenTitle: 'Solo administración configura el seguimiento automático.',
  forbiddenHint: 'En «Presupuestos por seguir» ves el último aviso de cada presupuesto y puedes pausarlo.',
  tableLabel: 'Seguimiento automático por sede',
  colLocation: 'Sede',
  colStatus: 'Estado',
  colWhen: 'Cuándo salen',
  on: 'Activo',
  off: 'Desactivado',
  configurePrefix: 'Configurar el seguimiento de ',
  when: (offsets: string, from: string, until: string) => `A los ${offsets} · de ${from} a ${until}`,
  saved: (name: string, enabled: boolean) =>
    enabled ? `Seguimiento automático activado en ${name}.` : `Seguimiento automático desactivado en ${name}.`,
  aboutTitle: 'Qué lleva el aviso',
  about: [
    'El nombre de la clínica, un saludo y un enlace para ver y aceptar el presupuesto (uno por opción si se presentaron varias). Sin importes ni tratamientos.',
    'El enlace caduca a las 72 horas; cada aviso trae uno nuevo y anula el anterior.',
    'Se detiene al aceptar, rechazar, agendar una cita, vencer el presupuesto o darse de baja el paciente. Recepción puede pausarlo en «Presupuestos por seguir».',
    'Solo sale por email, a pacientes con email y sin baja de los avisos (en un menor, a su responsable).',
    'Los avisos usan como mucho la mitad de los emails diarios de la clínica; el resto se envía en los días siguientes.',
  ],
};

const copy = quoteFollowUpManagerCopy;

/**
 * Ajustes › Presupuestos › Seguimiento automático (DX-561): una fila por sede
 * con su estado, los días y la franja; la fila abre el modal. Patrón de
 * Recordatorios (`ReminderSettingsManager`). Solo ADMIN.
 */
export function QuoteFollowUpSettingsManager({ token, allowed }: { token: string; allowed: boolean }) {
  const [rows, setRows] = useState<LocationQuoteFollowUpSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<LocationQuoteFollowUpSettings | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const locations = useLocationsState(token);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listQuoteFollowUpSettings(token);
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

  /** Las horas de una sede, con SU reloj (no el de la sede activa). */
  function fmtFor(locationId: string): RegionalFormat | null {
    if (locations.status !== 'ready') return null;
    const settings = locationFormat(locations.locations.find((l) => l.id === locationId));
    return settings ? regionalFormat(settings) : null;
  }

  function openModal(row: LocationQuoteFollowUpSettings) {
    setEditing(row);
    setModalKey((k) => k + 1);
  }

  function handleSaved(saved: LocationQuoteFollowUpSettings) {
    setRows((prev) => prev.map((r) => (r.locationId === saved.locationId ? saved : r)));
    setAnnouncement(copy.saved(saved.locationName, saved.enabled));
  }

  const activeCount = rows.filter((r) => r.enabled).length;

  const columns: DataListColumn<LocationQuoteFollowUpSettings>[] = [
    {
      id: 'location',
      header: copy.colLocation,
      mobile: 'primary',
      cell: (row) => (
        <>
          <span className="sr-only">{copy.configurePrefix}</span>
          <span className="break-words font-medium">{row.locationName}</span>
        </>
      ),
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (row) => <Badge variant={row.enabled ? 'success' : 'neutral'}>{row.enabled ? copy.on : copy.off}</Badge>,
    },
    {
      id: 'when',
      header: copy.colWhen,
      mobile: 'meta',
      cellClassName: 'tabular-nums',
      cell: (row) => {
        const fmt = fmtFor(row.locationId);
        return copy.when(
          offsetsLabel(row.offsetsDays),
          followUpHourLabel(row.sendFromHour, fmt),
          followUpHourLabel(row.sendUntilHour, fmt),
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
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
          emptyIcon={<MailCheck aria-hidden />}
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
      </div>

      <section aria-labelledby="quote-follow-up-about" className="flex max-w-[68ch] flex-col gap-2">
        <h2 id="quote-follow-up-about" className="t-label text-ink">
          {copy.aboutTitle}
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
          {copy.about.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {editing ? (
        <QuoteFollowUpSettingsModal
          key={modalKey}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          token={token}
          settings={editing}
          fmt={fmtFor(editing.locationId)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
