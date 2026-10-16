'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import { OdontogramChart } from '@/components/odontogram/odontogram-chart';
import { OdontogramLegend } from '@/components/odontogram/odontogram-legend';
import { ToothTimeline } from '@/components/odontogram/tooth-timeline';
import { ToothRecordPanel } from '@/components/odontogram/tooth-record-panel';
import { getOdontogram, type ToothGroup, type ToothSurface } from '@/lib/odontogram/odontogram-api';
import { projectOdontogram } from '@/lib/odontogram/projection';
import { isPermanentFdi } from '@/lib/odontogram/fdi';
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
  /**
   * Aviso de dentición temporal. Una cadena completa por rama (no concatenada)
   * para que al traducir se pueda reordenar; los dientes van con conjunción
   * española (`a, b y c`).
   */
  undrawnTeeth: (fdis: string[]) => {
    const list =
      fdis.length === 1
        ? `el diente ${fdis[0]}`
        : `los dientes ${fdis.slice(0, -1).join(', ')} y ${fdis[fdis.length - 1]}`;
    return `Este paciente tiene registros en ${list}, de dentición temporal. El odontograma solo dibuja la dentición permanente, así que no aparecen en el mapa: consúltalos en el historial del diente o en el plan de tratamiento.`;
  },
  viewInPlan: 'Ver en el plan',
  // El nombre accesible EMPIEZA por el texto visible (WCAG 2.5.3) y nombra el
  // diente, para que el enlace no sea un «Ver en el plan» sin destino cuando
  // se lee fuera de contexto.
  viewInPlanFor: (fdi: string) => `Ver en el plan los ítems del diente ${fdi}`,
};

interface OdontogramTabProps {
  token: string;
  patientId: string;
  /**
   * Diente con el que abrir, sembrado desde el `?tooth=` de la página — así
   * «Ver en el odontograma» desde una fila del plan llega al diente correcto
   * en vez de a la carta en blanco.
   */
  initialTooth?: string | null;
  /** Devuelve la selección a la URL, para que recargar o compartir el enlace vuelva al mismo diente. */
  onToothChange?: (toothNumber: string | null) => void;
  /** Construye el href del tab de plan enfocado en `toothNumber` (la otra mitad del puente). */
  planHref?: (toothNumber: string) => string;
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
export function OdontogramTab({
  token,
  patientId,
  initialTooth = null,
  onToothChange,
  planHref,
}: OdontogramTabProps) {
  const [toothGroups, setToothGroups] = useState<ToothGroup[]>([]);
  const [catalogItems, setCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Se siembra desde la URL para que el enlace del plan abra en su diente.
  // Sólo es el valor INICIAL: a partir de ahí manda la interacción, y cada
  // cambio se devuelve a la URL con `onToothChange`.
  const [selectedTooth, setSelectedTooth] = useState<string | null>(initialTooth);
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
          apiErrorMessage(err, `${copy.odontogramGenericError} ${copy.catalogGenericError}`);
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

  // Dientes CON registros que la carta no puede dibujar. `OdontogramChart`
  // sólo pinta la dentición permanente (32 piezas), pero el backend acepta
  // temporales (51-85) y el plan de tratamiento los factura — así que un
  // paciente pediátrico puede tener historia clínica invisible en su propio
  // odontograma. Callarlo es peor que no dibujarlos: el silencio se lee como
  // «este diente está sano».
  const undrawnTeeth = [...states.values()]
    .filter((state) => state.hasRecords && !isPermanentFdi(state.toothNumber))
    .map((state) => state.toothNumber)
    .sort();

  function handleSelectTooth(fdi: string) {
    setSelectedTooth(fdi);
    setInitialSurface(null);
    // La URL se actualiza desde el manejador y no desde un efecto sobre
    // `selectedTooth`: un efecto también dispararía al sembrar desde la propia
    // URL, reescribiéndola con lo que ya decía.
    onToothChange?.(fdi);
  }

  function handleSelectSurface(fdi: string, surface: ToothSurface) {
    setSelectedTooth(fdi);
    setInitialSurface(surface);
    onToothChange?.(fdi);
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

        {/* Se declara justo bajo la carta, no en un rincón: es una advertencia
            sobre lo que la carta NO está diciendo, y sólo aparece cuando este
            paciente concreto tiene registros invisibles. `role="status"`,
            porque es una limitación conocida del dibujo, no un fallo. */}
        {undrawnTeeth.length > 0 && (
          <p role="status" className="text-sm text-muted">
            {copy.undrawnTeeth(undrawnTeeth)}
          </p>
        )}
      </div>

      {selectedTooth ? (
        <section aria-labelledby="odontogram-tooth-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="odontogram-tooth-heading" className="t-title text-ink">
              {copy.toothHeading(selectedTooth)}
            </h2>
            {/* La otra mitad del puente. Un `<Link>` de verdad y no un botón:
                es una ubicación, así que tiene que poder abrirse en otra
                pestaña y copiarse como cualquier dirección. El nombre
                accesible empieza por el texto visible y nombra el diente
                (WCAG 2.5.3). */}
            {planHref ? (
              <Link
                href={planHref(selectedTooth)}
                aria-label={copy.viewInPlanFor(selectedTooth)}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {copy.viewInPlan}
              </Link>
            ) : null}
          </div>
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
