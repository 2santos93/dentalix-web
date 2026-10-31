'use client';
import { useEffect, useId, useState } from 'react';
import { FileDown } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  downloadContingencyAgenda,
  downloadContingencyNightly,
  getContingencyNightly,
  type ContingencyNightly,
  type ContingencyPdf,
} from '@/lib/appointments/contingency-agenda-api';
import { saveBlob } from '@/lib/files/save-blob';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { locationRegionalFormat, locationTimeZone } from '@/lib/locations/location-settings';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';

export const contingencyCopy = {
  button: 'Agenda de contingencia',
  title: 'Agenda de contingencia',
  description:
    'Las citas de hoy y mañana de la sede en PDF, para atender en papel si se cae el sistema o internet. Lleva nombres y teléfonos de pacientes: imprímela y guárdala en recepción.',
  location: 'Sede',
  loadingLocations: 'Cargando sedes…',
  locationsError: 'Sedes no disponibles',
  noLocations: 'No tienes ninguna sede activa.',
  downloadNow: 'Descargar PDF de hoy y mañana',
  downloading: 'Generando PDF…',
  downloaded: (fileName: string) => `Descargada: ${fileName}`,
  downloadError: 'No pudimos generar la agenda de contingencia. Intenta de nuevo.',
  nightlyTitle: 'Copia de anoche',
  nightlyLoading: 'Comprobando la copia nocturna…',
  nightlyError: 'Copia nocturna no disponible',
  nightlyNone: 'Aún no hay copia nocturna de esta sede: se genera cada noche desde las 02:00.',
  nightlyReady: (when: string, count: number) =>
    `Generada el ${when} · ${count === 1 ? '1 cita' : `${count} citas`}`,
  nightlyReadyNoFormat: (count: number) => (count === 1 ? '1 cita' : `${count} citas`),
  nightlyStale: 'Es de un día anterior: descarga la agenda de hoy y mañana.',
  nightlyDownload: 'Descargar copia de anoche',
  nightlyDownloadError: 'No pudimos descargar la copia de anoche. Intenta de nuevo.',
  close: 'Cerrar',
};

const copy = contingencyCopy;

interface LocationsResult {
  key: number;
  list: ClinicLocation[] | null;
}

interface NightlyResult {
  key: string;
  info: ContingencyNightly | null;
}

type Download = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; fileName: string } | { kind: 'error'; message: string };

interface ContingencyAgendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** La sede activa de la agenda (`null` = «Todas las sedes»). */
  defaultLocationId: string | null;
}

/**
 * DX-339: descargar la agenda de contingencia de una sede (PDF de hoy y
 * mañana generado al momento) o su copia nocturna. Solo las sedes activas que
 * la API da al usuario (DX-089); cada descarga queda auditada en la API.
 */
export function ContingencyAgendaDialog({ open, onOpenChange, token, defaultLocationId }: ContingencyAgendaDialogProps) {
  const id = useId();
  const selectId = `${id}-location`;
  const loadLocations = useSessionLocations(token);
  const [locationsReload, setLocationsReload] = useState(0);
  const [locations, setLocations] = useState<LocationsResult | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [nightlyReload, setNightlyReload] = useState(0);
  const [nightly, setNightly] = useState<NightlyResult | null>(null);
  const [now, setNow] = useState<Download>({ kind: 'idle' });
  const [lastNight, setLastNight] = useState<Download>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadLocations()
      .then((all) => {
        if (!cancelled) setLocations({ key: locationsReload, list: all.filter((l) => l.isActive) });
      })
      .catch(() => {
        if (!cancelled) setLocations({ key: locationsReload, list: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadLocations, locationsReload]);

  const locationsLoading = locations === null || locations.key !== locationsReload;
  const list = locationsLoading ? [] : (locations.list ?? []);
  const locationsFailed = !locationsLoading && locations.list === null;
  const pickable = (candidate: string | null) => candidate !== null && list.some((l) => l.id === candidate);
  const locationId = pickable(picked) ? picked : pickable(defaultLocationId) ? defaultLocationId : (list[0]?.id ?? null);
  const location = list.find((l) => l.id === locationId) ?? null;
  const nightlyKey = `${locationId}:${nightlyReload}`;

  useEffect(() => {
    if (!open || !locationId) return;
    let cancelled = false;
    const key = `${locationId}:${nightlyReload}`;
    getContingencyNightly(token, locationId)
      .then((info) => {
        if (!cancelled) setNightly({ key, info });
      })
      .catch(() => {
        if (!cancelled) setNightly({ key, info: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, locationId, nightlyReload]);

  const nightlyLoading = locationId !== null && (nightly === null || nightly.key !== nightlyKey);
  const nightlyInfo = nightlyLoading ? null : (nightly?.info ?? null);

  async function download(
    fetchPdf: (token: string, locationId: string) => Promise<ContingencyPdf>,
    setState: (state: Download) => void,
    fallback: string,
  ) {
    if (!locationId) return;
    setState({ kind: 'busy' });
    try {
      const { blob, fileName } = await fetchPdf(token, locationId);
      saveBlob(blob, fileName);
      setState({ kind: 'done', fileName });
    } catch (err) {
      setState({ kind: 'error', message: apiErrorMessage(err, fallback) });
    }
  }

  function pickLocation(next: string) {
    setPicked(next);
    setNow({ kind: 'idle' });
    setLastNight({ kind: 'idle' });
  }

  const fmt = locationRegionalFormat(location);
  const timeZone = locationTimeZone(location);
  const busy = now.kind === 'busy' || lastNight.kind === 'busy';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:[&_button]:min-h-11 max-sm:[&_select]:h-11">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {locationsLoading ? (
              <p role="status" className="text-sm text-muted">
                {copy.loadingLocations}
              </p>
            ) : locationsFailed ? (
              <>
                <span className="text-sm font-medium text-ink">{copy.location}</span>
                <FieldError
                  label={copy.locationsError}
                  onRetry={() => setLocationsReload((k) => k + 1)}
                  focusRetry
                />
              </>
            ) : list.length === 0 ? (
              <p role="status" className="text-sm text-muted">
                {copy.noLocations}
              </p>
            ) : list.length === 1 ? (
              <p className="text-sm">
                <span className="font-medium text-ink">{copy.location}: </span>
                <span className="text-ink">{list[0].name}</span>
              </p>
            ) : (
              <>
                <label htmlFor={selectId} className="text-sm font-medium text-ink">
                  {copy.location}
                </label>
                <select
                  id={selectId}
                  value={locationId ?? ''}
                  disabled={busy}
                  onChange={(e) => pickLocation(e.target.value)}
                  className={cn(fieldClass, 'w-full')}
                >
                  {list.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full sm:w-auto sm:self-start"
              disabled={!locationId || lastNight.kind === 'busy'}
              loading={now.kind === 'busy'}
              onClick={() => void download(downloadContingencyAgenda, setNow, copy.downloadError)}
            >
              {now.kind === 'busy' ? null : <FileDown aria-hidden />}
              {now.kind === 'busy' ? copy.downloading : copy.downloadNow}
            </Button>
            {now.kind === 'error' ? <InlineError>{now.message}</InlineError> : null}
            {now.kind === 'done' ? (
              <p role="status" className="text-sm text-success">
                {copy.downloaded(now.fileName)}
              </p>
            ) : null}
          </div>

          {locationId ? (
            <section aria-labelledby={`${id}-nightly`} className="flex flex-col gap-2 border-t border-hairline pt-4">
              <h3 id={`${id}-nightly`} className="text-sm font-semibold text-ink">
                {copy.nightlyTitle}
              </h3>
              {nightlyLoading ? (
                <p role="status" className="text-sm text-muted">
                  {copy.nightlyLoading}
                </p>
              ) : nightlyInfo === null ? (
                <FieldError label={copy.nightlyError} onRetry={() => setNightlyReload((k) => k + 1)} />
              ) : !nightlyInfo.available ? (
                <p className="text-sm text-muted">{copy.nightlyNone}</p>
              ) : (
                <>
                  <p className="text-sm tabular-nums text-ink">
                    {fmt && timeZone && nightlyInfo.generatedAt
                      ? copy.nightlyReady(fmt.dateTime(new Date(nightlyInfo.generatedAt), timeZone), nightlyInfo.appointmentCount ?? 0)
                      : copy.nightlyReadyNoFormat(nightlyInfo.appointmentCount ?? 0)}
                  </p>
                  {!nightlyInfo.current ? <p className="text-sm text-warning">{copy.nightlyStale}</p> : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto sm:self-start"
                    disabled={now.kind === 'busy'}
                    loading={lastNight.kind === 'busy'}
                    onClick={() => void download(downloadContingencyNightly, setLastNight, copy.nightlyDownloadError)}
                  >
                    {lastNight.kind === 'busy' ? null : <FileDown aria-hidden />}
                    {copy.nightlyDownload}
                  </Button>
                  {lastNight.kind === 'error' ? <InlineError>{lastNight.message}</InlineError> : null}
                  {lastNight.kind === 'done' ? (
                    <p role="status" className="text-sm text-success">
                      {copy.downloaded(lastNight.fileName)}
                    </p>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {copy.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
