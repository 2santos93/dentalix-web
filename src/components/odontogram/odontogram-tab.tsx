'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { OdontogramChart } from '@/components/odontogram/odontogram-chart';
import { ToothTimeline } from '@/components/odontogram/tooth-timeline';
import { ToothRecordPanel } from '@/components/odontogram/tooth-record-panel';
import { getOdontogram, type ToothGroup, type ToothSurface } from '@/lib/odontogram/odontogram-api';
import { projectOdontogram } from '@/lib/odontogram/projection';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';

// Copy as constants (i18n-ready) — matches page.tsx's convention until
// next-intl wiring lands.
const copy = {
  odontogramLoading: 'Cargando odontograma…',
  odontogramRefreshing: 'Actualizando…',
  odontogramGenericError: 'No pudimos cargar el odontograma. Intenta de nuevo.',
  odontogramRefreshError: 'No pudimos actualizar el odontograma. Intenta de nuevo.',
  catalogGenericError: 'No pudimos cargar el catálogo. Intenta de nuevo.',
  selectToothPrompt: 'Selecciona un diente para ver su historial y registrar un hallazgo o procedimiento.',
  toothHeading: (fdi: string) => `Diente ${fdi}`,
  retry: 'Reintentar',
};

interface OdontogramTabProps {
  token: string;
  patientId: string;
}

/**
 * Composes Task 5's `OdontogramChart` with Task 6's `ToothTimeline` +
 * `ToothRecordPanel`. Loads the odontogram + the dental catalog once, then:
 * - clicking a tooth (or a surface) selects it, showing that tooth's
 *   timeline + record form below the chart;
 * - clicking a surface additionally pre-checks that surface in the form;
 * - a successful `addToothRecord` (inside `ToothRecordPanel`) bumps
 *   `reloadKey` (re-fetches the odontogram -> the chart recolors) and
 *   `timelineRefreshKey` (re-fetches that tooth's timeline).
 *
 * Initial load vs. background refresh (review fix): the fetch effect below
 * distinguishes the very FIRST load (`!hasLoadedOnce`, full-page blocking
 * `<p role="status">`, replacing the subtree — there's nothing to preserve
 * yet) from a REFRESH triggered by `reloadKey` bumping after a save
 * (`hasLoadedOnce` already true). A refresh keeps `OdontogramChart` /
 * `ToothTimeline` / `ToothRecordPanel` MOUNTED — only a small non-blocking
 * "Actualizando…" `role="status"` shows — so the chart recolors and the
 * timeline updates in place instead of unmounting+remounting the whole
 * subtree (which used to steal focus off the just-clicked "Guardar" button
 * and defeated `timelineRefreshKey`'s refresh-without-unmount contract).
 * Likewise, a failed background refresh does NOT blank the already-loaded
 * chart/panel — it surfaces a small inline retry instead of the full-page
 * error, which is still reserved for a failed FIRST load (nothing to show
 * yet in that case).
 */
export function OdontogramTab({ token, patientId }: OdontogramTabProps) {
  const [toothGroups, setToothGroups] = useState<ToothGroup[]>([]);
  const [catalogItems, setCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [initialSurface, setInitialSurface] = useState<ToothSurface | null>(null);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const isInitialLoad = !hasLoadedOnce;

    async function load() {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const [groups, catalog] = await Promise.all([
          getOdontogram(token, patientId),
          listCatalogItems(token, { activeOnly: true }),
        ]);
        if (cancelled) return;
        setToothGroups(groups);
        setCatalogItems(catalog);
        setLoadError(null);
        setRefreshError(null);
        setHasLoadedOnce(true);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : `${copy.odontogramGenericError} ${copy.catalogGenericError}`;
        if (isInitialLoad) {
          setLoadError(message);
        } else {
          setRefreshError(copy.odontogramRefreshError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // `hasLoadedOnce` is intentionally excluded: it's read once per run (via
    // `isInitialLoad`) to tell an initial load from a background refresh,
    // and is itself flipped true by this same effect on success — including
    // it here would re-trigger the effect the moment it flips, refetching
    // right after the first successful load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, patientId, reloadKey]);

  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const states = projectOdontogram(toothGroups, catalogById);

  function handleSelectTooth(fdi: string) {
    setSelectedTooth(fdi);
    setInitialSurface(null);
  }

  function handleSelectSurface(fdi: string, surface: ToothSurface) {
    setSelectedTooth(fdi);
    setInitialSurface(surface);
  }

  function handleRecordAdded() {
    // Refetches the odontogram (so the chart recolors with the new record)
    // and bumps the timeline's refresh key (so it re-fetches that tooth's
    // history) — the record itself was already POSTed by ToothRecordPanel.
    // Both refetches happen in place — see the effect above for why the
    // chart/timeline/panel stay mounted instead of flashing a full-page
    // loading state.
    setReloadKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.odontogramLoading}
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink"
        >
          {copy.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {refreshing && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
          {copy.odontogramRefreshing}
        </p>
      )}

      {refreshError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-xs text-danger">
            {refreshError}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-ink"
          >
            {copy.retry}
          </button>
        </div>
      )}

      <OdontogramChart
        states={states}
        catalogById={catalogById}
        selectedTooth={selectedTooth ?? undefined}
        onSelectTooth={handleSelectTooth}
        onSelectSurface={handleSelectSurface}
      />

      {selectedTooth ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-ink">{copy.toothHeading(selectedTooth)}</h2>
            <ToothTimeline
              token={token}
              patientId={patientId}
              toothNumber={selectedTooth}
              catalogById={catalogById}
              refreshKey={timelineRefreshKey}
            />
          </section>
          <section className="flex flex-col gap-3">
            <ToothRecordPanel
              token={token}
              patientId={patientId}
              toothNumber={selectedTooth}
              initialSurface={initialSurface ?? undefined}
              onRecordAdded={handleRecordAdded}
            />
          </section>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted">
          {copy.selectToothPrompt}
        </p>
      )}
    </div>
  );
}
