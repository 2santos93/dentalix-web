'use client';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  downloadClinicExport,
  fileSizeLabel,
  isExportInProgress,
  listClinicExports,
  requestClinicExport,
  type ClinicExport,
} from '@/lib/clinic-exports/clinic-exports-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { AsyncSection } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SettingsSection } from '@/components/settings/settings-page';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { StatusBadge } from '@/components/ui/status-badge';

/** Cada cuánto se vuelve a preguntar mientras una exportación está en curso. */
export const POLL_MS = 5000;

export const clinicExportsCopy = {
  exportTitle: 'Exportar todo',
  exportHint: 'Un ZIP con un CSV por tema que abre Excel o cualquier hoja de cálculo.',
  includes:
    'Pacientes, historia clínica, odontograma, periodontogramas, consentimientos, recetas, citas, planes y presupuestos, cobros, cuotas, gastos, honorarios e inventario. Los documentos y radiografías van como índice, sin los ficheros.',
  howItWorks: [
    'Se prepara en segundo plano: puedes seguir trabajando y avisamos por email a todos los administradores cuando esté lista.',
    'Cualquier administrador puede descargarla una sola vez durante 24 horas. Después hay que pedir otra.',
    'El fichero se borra de nuestros servidores a los 7 días.',
  ],
  sensitiveTitle: 'Contiene datos de salud de tus pacientes',
  sensitiveHint: 'Guárdalo en un lugar seguro y bórralo cuando ya no lo necesites.',
  exportAll: 'Exportar todo',
  inProgress: 'Exportación en curso…',
  confirmTitle: '¿Exportar todos los datos de la clínica?',
  confirmHint:
    'Se avisará por email a todos los administradores y quedará en la auditoría. La descarga será de un solo uso.',
  confirmLabel: 'Exportar todo',
  requested: 'Estamos preparando la exportación. Te avisaremos por email.',
  requestError: 'No pudimos pedir la exportación.',
  historyTitle: 'Historial',
  historyHint: 'Las 20 últimas exportaciones de la clínica.',
  tableLabel: 'Exportaciones de la clínica',
  colRequested: 'Pedida',
  colState: 'Estado',
  colSize: 'Tamaño',
  by: (name: string | null) => (name ? `por ${name}` : 'por un administrador que ya no está'),
  readyUntil: (date: string) => `Hasta el ${date}`,
  downloadedBy: (name: string | null, date: string) =>
    name ? `Por ${name} el ${date}` : `El ${date}`,
  rows: (n: number) => (n === 1 ? '1 fila' : `${n} filas`),
  failedHint: 'Pide otra; si vuelve a fallar, escribe a soporte.',
  download: 'Descargar',
  downloadAria: (date: string) => `Descargar la exportación pedida el ${date}`,
  downloading: 'Preparando la descarga…',
  downloadStarted: 'La descarga empezó. El enlace ya no se puede volver a usar.',
  downloadError: 'No pudimos descargar la exportación.',
  empty: 'Todavía no has exportado los datos',
  emptyHint: 'Pide una exportación con «Exportar todo». Aparecerá aquí mientras se prepara.',
  loadError: 'No pudimos cargar el historial de exportaciones.',
  forbiddenTitle: 'Solo administración puede exportar los datos de la clínica.',
  forbiddenHint: 'Pide a un administrador que haga la exportación.',
};
const copy = clinicExportsCopy;

interface ClinicExportsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol). */
  allowed: boolean;
  /** Para los tests: abrir la URL firmada (por defecto, navegar a ella). */
  openUrl?: (url: string) => void;
}

function defaultOpenUrl(url: string): void {
  // La URL firmada responde como adjunto: el navegador descarga y se queda aquí.
  window.location.assign(url);
}

/**
 * Ajustes › Exportar datos (DX-053): «Exportar todo» (con confirmación) y el
 * historial con su estado, tamaño, quién y cuándo, y «Descargar» (un solo uso)
 * en la lista. Mientras hay una en curso vuelve a preguntar cada 5 s.
 */
export function ClinicExportsManager({ token, allowed, openUrl = defaultOpenUrl }: ClinicExportsManagerProps) {
  const [exports, setExports] = useState<ClinicExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const stamp = useSedeStamp(token);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await listClinicExports(token);
        if (cancelled) return;
        setExports(data);
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
  }, [token, allowed, reloadKey]);

  const inProgress = exports.some(isExportInProgress);

  // Mientras se prepara, el estado cambia sin que nadie toque nada.
  useEffect(() => {
    if (!inProgress) return;
    const timer = window.setTimeout(reload, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [inProgress, exports, reload]);

  if (!allowed) {
    return (
      <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
    );
  }

  async function confirmRequest() {
    setRequesting(true);
    setRequestError(null);
    try {
      const created = await requestClinicExport(token);
      setExports((prev) => [created, ...prev.filter((e) => e.id !== created.id)]);
      setConfirming(false);
      setAnnouncement(copy.requested);
    } catch (err) {
      setRequestError(apiErrorMessage(err, copy.requestError));
      // 409: ya había una en curso (otro administrador): la lista la mostrará.
      if (err instanceof ApiError && err.status === 409) reload();
    } finally {
      setRequesting(false);
    }
  }

  async function download(item: ClinicExport) {
    setDownloadingId(item.id);
    try {
      const { url } = await downloadClinicExport(token, item.id);
      openUrl(url);
      setAnnouncement(copy.downloadStarted);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.downloadError));
    } finally {
      setDownloadingId(null);
      // Descargada, caducada o ya usada por otro: el estado lo dice la API.
      reload();
    }
  }

  function stateDetail(e: ClinicExport): React.ReactNode {
    switch (e.state) {
      case 'READY':
        return e.downloadExpiresAt ? copy.readyUntil(stamp.dateTime(e.downloadExpiresAt)) : null;
      case 'DOWNLOADED':
        return e.downloadedAt ? copy.downloadedBy(e.downloadedByName, stamp.dateTime(e.downloadedAt)) : null;
      case 'FAILED':
        return copy.failedHint;
      default:
        return null;
    }
  }

  const columns: DataListColumn<ClinicExport>[] = [
    {
      id: 'requested',
      header: copy.colRequested,
      mobile: 'primary',
      cell: (e) => (
        <span className="flex flex-col">
          <span className="font-medium tabular-nums">{stamp.dateTime(e.requestedAt)}</span>
          <span className="text-sm text-muted">{copy.by(e.requestedByName)}</span>
        </span>
      ),
    },
    {
      id: 'state',
      header: copy.colState,
      cell: (e) => {
        const detail = stateDetail(e);
        return (
          <span className="flex flex-col items-start gap-1">
            <StatusBadge kind="clinicExport" status={e.state} />
            {detail ? <span className="text-sm text-muted tabular-nums">{detail}</span> : null}
          </span>
        );
      },
    },
    {
      id: 'size',
      header: copy.colSize,
      numeric: true,
      cell: (e) =>
        e.sizeBytes === null ? (
          '—'
        ) : (
          <span className="flex flex-col items-end">
            <span>{fileSizeLabel(e.sizeBytes)}</span>
            {e.totalRows !== null ? <span className="text-sm text-muted">{copy.rows(e.totalRows)}</span> : null}
          </span>
        ),
      mobileCell: (e) => (e.sizeBytes === null ? null : fileSizeLabel(e.sizeBytes)),
    },
    {
      id: 'action',
      header: <span className="sr-only">{copy.download}</span>,
      align: 'end',
      mobile: 'trailing',
      cell: (e) =>
        e.canDownload ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void download(e)}
            disabled={downloadingId !== null}
            aria-label={copy.downloadAria(stamp.dateTime(e.requestedAt))}
          >
            <Download aria-hidden />
            {downloadingId === e.id ? copy.downloading : copy.download}
          </Button>
        ) : null,
      mobileCell: (e) =>
        e.canDownload ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void download(e)}
            disabled={downloadingId !== null}
          >
            <Download aria-hidden />
            {copy.download}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection title={copy.exportTitle} description={copy.exportHint}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink">{copy.includes}</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink marker:text-muted">
            {copy.howItWorks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Callout tone="warning" title={copy.sensitiveTitle}>
            {copy.sensitiveHint}
          </Callout>
          <div>
            <Button
              type="button"
              onClick={() => {
                setRequestError(null);
                setConfirming(true);
              }}
              disabled={loading || inProgress || requesting}
              className="w-full sm:w-auto"
            >
              <Archive aria-hidden />
              {inProgress ? copy.inProgress : copy.exportAll}
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={copy.historyTitle} description={copy.historyHint}>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <SedeStampNote stamp={stamp} />
        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => {
            setLoading(true);
            reload();
          }}
          isEmpty={exports.length === 0}
          emptyTitle={copy.empty}
          emptyDescription={copy.emptyHint}
          emptyIcon={<Archive aria-hidden />}
        >
          <DataList
            label={copy.tableLabel}
            rows={exports}
            columns={columns}
            getRowKey={(e) => e.id}
            getRowLabel={(e) => stamp.dateTime(e.requestedAt)}
          />
        </AsyncSection>
      </SettingsSection>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
        title={copy.confirmTitle}
        description={copy.confirmHint}
        confirmLabel={copy.confirmLabel}
        onConfirm={() => void confirmRequest()}
        confirming={requesting}
        error={requestError}
        destructive={false}
      />
    </div>
  );
}
