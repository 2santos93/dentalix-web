'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { OdontogramChart } from '@/components/odontogram/odontogram-chart';
import { OdontogramLegend } from '@/components/odontogram/odontogram-legend';
import { ToothTimeline } from '@/components/odontogram/tooth-timeline';
import { ToothRecordPanel } from '@/components/odontogram/tooth-record-panel';
import { getOdontogram, type ToothGroup, type ToothSurface } from '@/lib/odontogram/odontogram-api';
import { projectOdontogram } from '@/lib/odontogram/projection';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';

// Copy as constants (i18n-ready) — matches page.tsx's convention until
// next-intl wiring lands.
const copy = {
  odontogramLoading: 'Cargando odontograma…',
  odontogramRefreshing: 'Actualizando…',
  odontogramGenericError: 'No pudimos cargar el odontograma.',
  odontogramRefreshError: 'No pudimos actualizar el odontograma.',
  catalogGenericError: 'No pudimos cargar el catálogo.',
  selectToothPrompt: 'Selecciona un diente para ver su historial y registrar un hallazgo o procedimiento.',
  toothHeading: (fdi: string) => `Diente ${fdi}`,
  historyHeading: 'Historial',
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
 * chart/panel — it surfaces a `notifyError` toast (with its own retry
 * action) instead of the full-page `SectionError`, which is still reserved
 * for a failed FIRST load (nothing to show yet in that case).
 */
export function OdontogramTab({ token, patientId }: OdontogramTabProps) {
  const [toothGroups, setToothGroups] = useState<ToothGroup[]>([]);
  const [catalogItems, setCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
        setHasLoadedOnce(true);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : `${copy.odontogramGenericError} ${copy.catalogGenericError}`;
        if (isInitialLoad) {
          setLoadError(message);
        } else {
          notifyError(copy.odontogramRefreshError, { onRetry: () => setReloadKey((k) => k + 1) });
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

  // The distinct catalog items actually painted on the chart (from the
  // patient's records), for the color legend — so it explains what's on
  // screen, not the whole catalog.
  const usedCatalogIds = new Set<string>();
  for (const state of states.values()) {
    for (const record of state.records) {
      if (record.catalogItemId) usedCatalogIds.add(record.catalogItemId);
    }
  }
  const legendItems = catalogItems.filter((item) => usedCatalogIds.has(item.id));

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
      <div className="flex flex-col gap-4" role="status">
        <span className="sr-only">{copy.odontogramLoading}</span>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The chart and its color key read as one object: the field, then its
          caption. The refresh notice rides on that same line so nothing shifts
          vertically while a save settles. */}
      <div className="flex flex-col gap-2">
        <OdontogramChart
          states={states}
          catalogById={catalogById}
          selectedTooth={selectedTooth ?? undefined}
          onSelectTooth={handleSelectTooth}
          onSelectSurface={handleSelectSurface}
        />
        <div className="flex items-start justify-between gap-4">
          <OdontogramLegend items={legendItems} />
          {refreshing && (
            <p role="status" aria-live="polite" className="t-label shrink-0 text-muted">
              {copy.odontogramRefreshing}
            </p>
          )}
        </div>
      </div>

      {selectedTooth ? (
        <section aria-labelledby="odontogram-tooth-heading" className="flex flex-col gap-4">
          <h2 id="odontogram-tooth-heading" className="t-title text-ink">
            {copy.toothHeading(selectedTooth)}
          </h2>
          <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className="t-label text-muted">{copy.historyHeading}</h3>
              <ToothTimeline
                token={token}
                patientId={patientId}
                toothNumber={selectedTooth}
                catalogById={catalogById}
                refreshKey={timelineRefreshKey}
              />
            </div>
            {/* `min-w-0` para que el formulario pueda encogerse por debajo de su
                max-content en móvil (si no, el catálogo lo estira a ~435px). */}
            <div className="min-w-0">
              <ToothRecordPanel
                token={token}
                patientId={patientId}
                toothNumber={selectedTooth}
                initialSurface={initialSurface ?? undefined}
                onRecordAdded={handleRecordAdded}
              />
            </div>
          </div>
        </section>
      ) : (
        <p
          role="status"
          className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted"
        >
          {copy.selectToothPrompt}
        </p>
      )}
    </div>
  );
}
