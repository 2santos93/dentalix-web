'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import { OdontogramChart } from '@/components/odontogram/odontogram-chart';
import { OdontogramLegend } from '@/components/odontogram/odontogram-legend';
import { ToothTimeline } from '@/components/odontogram/tooth-timeline';
import { ToothRecordPanel } from '@/components/odontogram/tooth-record-panel';
import { DentitionDialog } from '@/components/odontogram/dentition-dialog';
import {
  getDentition,
  getOdontogram,
  recordDentitionEvents,
  type DentitionView,
  type ToothGroup,
  type ToothSurface,
  type ToothTimelineEntry,
} from '@/lib/odontogram/odontogram-api';
import { projectOdontogram } from '@/lib/odontogram/projection';
import {
  DENTITION_LABELS,
  DENTITION_ORDER,
  chartLayoutForArch,
  isPrimaryFdi,
  positionOfTooth,
  presetChanges,
  toothFitsDentition,
  type DentitionReason,
  type DentitionType,
} from '@/lib/odontogram/dentition';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import { formatCivilDate } from '@/lib/format/date';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout } from '@/components/ui/callout';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormModal } from '@/components/shared/form-modal';
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
  emptyChartPrompt:
    'Aún no hay registros: la carta está sana. Selecciona un diente para registrar el primer hallazgo o procedimiento.',
  toothHeading: (fdi: string) => `Diente ${fdi}`,
  historyHeading: 'Historial',
  viewInPlan: 'Ver en el plan',
  // El nombre accesible EMPIEZA por el texto visible (WCAG 2.5.3) y nombra el
  // diente, para que el enlace no sea un «Ver en el plan» sin destino cuando
  // se lee fuera de contexto.
  viewInPlanFor: (fdi: string) => `Ver en el plan los ítems del diente ${fdi}`,
  registerImplant: 'Registrar implante',
  registerImplantFor: (fdi: string) => `Registrar implante en el diente ${fdi}`,
  // DX-151
  toothDocuments: 'Documentos del diente',
  toothDocumentsFor: (fdi: string) => `Documentos del diente ${fdi}`,
  // DX-120
  dentitionSwitch: 'Dentición de la carta',
  dentitionByAge: (age: number) => `Según la edad (${age} años)`,
  changeDentition: 'Cambiar dentición',
  asOfLabel: 'Ver la carta al',
  backToToday: 'Volver a hoy',
  asOfNotice: (date: string) =>
    `Carta al ${date} · solo lectura. Muestra los registros y la dentición de ese día; para registrar, anular o cambiar la dentición, vuelve a hoy.`,
  presetTitle: (label: string) => `Pasar la carta a dentición ${label.toLowerCase()}`,
  presetDescription: (label: string, count: number) =>
    count === 0
      ? `La carta ya está en dentición ${label.toLowerCase()}.`
      : `Se marcarán ${count} posiciones en dentición ${label.toLowerCase()} (cambio manual). Queda en el historial y se puede volver a cambiar.`,
  presetMixedNote: 'Los molares no cambian: márcalos con «Cambiar dentición» al erupcionar.',
  presetSubmit: 'Cambiar la carta',
  presetError: 'No pudimos cambiar la dentición. Intenta de nuevo.',
  notDrawn: (fdis: string[]) =>
    `Con la dentición actual no se dibuja${fdis.length === 1 ? ' el diente' : 'n los dientes'} ${fdis.join(', ')}, que tiene${fdis.length === 1 ? '' : 'n'} registros. Consulta su historial:`,
  notDrawnTooth: (fdi: string) => `Ver el historial del diente ${fdi}`,
  doesNotFit: (fdi: string, position: string, dentition: DentitionType) =>
    isPrimaryFdi(fdi)
      ? `El diente ${fdi} no está en la boca según la dentición actual (posición ${position}: ${DENTITION_LABELS[dentition].toLowerCase()}). Para registrar en él, cambia la dentición de esa posición.`
      : dentition === 'PRIMARY'
        ? `El diente ${fdi} aún no ha erupcionado según la dentición actual. Para registrar en él, márcalo como erupcionado.`
        : `El diente ${fdi} no está en la boca según la dentición actual.`,
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
  /**
   * DX-191: href de «Registrar implante» con el diente puesto (abre la sección
   * «Implantes» con el formulario). Sin él (rol que no registra) no se pinta.
   */
  implantHref?: (toothNumber: string) => string;
  /**
   * DX-151: href de «Documentos del diente» (la pestaña «Documentos» filtrada
   * por ese diente). Es lectura, así que se pinta también en la carta pasada.
   */
  documentsHref?: (toothNumber: string) => string;
}

interface DentitionDialogState {
  positions: string[];
  dentition: DentitionType;
  reason: DentitionReason;
}

/** Hoy (YYYY-MM-DD) en la zona del navegador, tope del selector de fecha. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Composes `OdontogramChart` with `ToothTimeline` + `ToothRecordPanel`. Loads
 * the odontogram, the patient's dentition and the dental catalog, then:
 * - clicking a tooth (or a surface) selects it, showing that tooth's
 *   timeline + record form below the chart;
 * - a successful add or void bumps `reloadKey` (re-fetches → the chart
 *   recolors) and `timelineRefreshKey` (re-fetches that tooth's timeline).
 *
 * DX-120: the chart draws each position in its dentition (permanent, primary
 * or both when mixed); «Permanente · Mixta · Temporal» switches the whole
 * chart and «Cambiar dentición» a selection of positions. «Ver la carta al»
 * reloads the chart AS OF that day, read-only: no form, no void, no
 * dentition change, and a visible notice says so.
 *
 * Initial load vs. background refresh: the FIRST load blocks with a loading
 * status (nothing to preserve yet); a REFRESH keeps the chart/timeline/panel
 * MOUNTED with a small non-blocking "Actualizando…" status, and a failed
 * refresh surfaces a `notifyError` toast instead of blanking what's on
 * screen. `SectionError` is reserved for a failed first load.
 */
export function OdontogramTab({
  token,
  patientId,
  initialTooth = null,
  onToothChange,
  planHref,
  implantHref,
  documentsHref,
}: OdontogramTabProps) {
  const [toothGroups, setToothGroups] = useState<ToothGroup[]>([]);
  const [dentition, setDentition] = useState<DentitionView | null>(null);
  const [catalogItems, setCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // `asOf` es la fecha PEDIDA (el selector); `shownAsOf`, la de la carta que
  // hay en pantalla. Solo difieren mientras carga o si la carga falla: el
  // aviso «Carta al…» y el historial siguen a lo que se ve, nunca a lo pedido.
  const [asOf, setAsOf] = useState<string | null>(null);
  const [shownAsOf, setShownAsOf] = useState<string | null>(null);
  // Al fallar un cambio de fecha el selector vuelve a la que se ve, sin
  // recargarla (ya está en pantalla).
  const skipNextLoad = useRef(false);

  // Se siembra desde la URL para que el enlace del plan abra en su diente.
  // Sólo es el valor INICIAL: a partir de ahí manda la interacción, y cada
  // cambio se devuelve a la URL con `onToothChange`.
  const [selectedTooth, setSelectedTooth] = useState<string | null>(initialTooth);
  const [initialSurface, setInitialSurface] = useState<ToothSurface | null>(null);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const [dentitionDialog, setDentitionDialog] = useState<DentitionDialogState | null>(null);
  const [preset, setPreset] = useState<DentitionType | null>(null);
  const [presetSubmitting, setPresetSubmitting] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);

  // Solo lectura en cuanto se pide una fecha y hasta que vuelve la carta de hoy.
  const readOnly = asOf !== null || shownAsOf !== null;
  const role = getTokenRole(token);
  const userId = getTokenUserId(token);

  useEffect(() => {
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
      return;
    }
    let cancelled = false;
    const isInitialLoad = !hasLoadedOnce;

    async function load() {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const [groups, dentitionView, catalog] = await Promise.all([
          getOdontogram(token, patientId, asOf ?? undefined),
          getDentition(token, patientId, asOf ?? undefined),
          listCatalogItems(token, { activeOnly: true }),
        ]);
        if (cancelled) return;
        setToothGroups(groups);
        setDentition(dentitionView);
        setCatalogItems(catalog);
        setShownAsOf(asOf);
        setLoadError(null);
        setHasLoadedOnce(true);
      } catch (err) {
        if (cancelled) return;
        const message = apiErrorMessage(err, `${copy.odontogramGenericError} ${copy.catalogGenericError}`);
        if (isInitialLoad) {
          setLoadError(message);
        } else {
          notifyError(copy.odontogramRefreshError, { onRetry: () => setReloadKey((k) => k + 1) });
          if (asOf !== shownAsOf) {
            skipNextLoad.current = true;
            setAsOf(shownAsOf);
          }
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
    // it here would re-trigger the effect the moment it flips. Same for
    // `shownAsOf`: it is set by this effect and only read on a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, patientId, reloadKey, asOf]);

  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const states = projectOdontogram(toothGroups, catalogById);
  const dentitionByPosition = new Map(dentition?.positions.map((p) => [p.position, p.dentition]) ?? []);
  const dentitionOf = (position: string): DentitionType => dentitionByPosition.get(position) ?? 'PERMANENT';

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

  // Dientes con registros vigentes que la dentición actual no dibuja (p. ej.
  // el 55 ya exfoliado). Callarlo se leería como «sano»: se dice bajo la
  // carta, con un acceso a su historial.
  const drawnTeeth = new Set(
    (['upper', 'lower'] as const).flatMap((arch) =>
      chartLayoutForArch(arch, dentitionOf).columns.flatMap((c) =>
        [c.permanent, c.primary].filter((fdi): fdi is string => fdi !== null),
      ),
    ),
  );
  const notDrawn = [...states.values()]
    .filter((state) => state.hasRecords && !drawnTeeth.has(state.toothNumber))
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

  function handleChartChanged() {
    // Refetches the odontogram + dentition (so the chart redraws) and bumps
    // the timeline's refresh key — both in place, see the effect above.
    setReloadKey((k) => k + 1);
    setTimelineRefreshKey((k) => k + 1);
  }

  function canVoid(record: ToothTimelineEntry): boolean {
    return role === 'ADMIN' || (userId !== null && record.performedById === userId);
  }

  function openDentitionDialog(fdi: string | null) {
    const position = fdi ? positionOfTooth(fdi) : null;
    setDentitionDialog({
      positions: position ? [position] : [],
      dentition: position ? dentitionOf(position) : 'PERMANENT',
      reason: 'MANUAL',
    });
  }

  async function applyPreset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preset) return;
    const positions = presetChanges(preset, dentitionOf);
    if (positions.length === 0) {
      setPreset(null);
      return;
    }
    setPresetSubmitting(true);
    setPresetError(null);
    try {
      await recordDentitionEvents(token, patientId, { positions, dentition: preset, reason: 'MANUAL' });
      setPreset(null);
      handleChartChanged();
    } catch (err) {
      setPresetError(apiErrorMessage(err, copy.presetError));
    } finally {
      setPresetSubmitting(false);
    }
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

  const overall = dentition?.overall ?? 'PERMANENT';
  const selectedPosition = selectedTooth ? positionOfTooth(selectedTooth) : null;
  const selectedFits =
    selectedTooth !== null && selectedPosition !== null
      ? toothFitsDentition(selectedTooth, dentitionOf(selectedPosition)) && drawnTeeth.has(selectedTooth)
      : false;
  const isEmpty = toothGroups.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {/* Barra de la carta: dentición (conmutador + cambio por posiciones)
            a la izquierda y la fecha de la carta a la derecha. */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span id="odo-dentition-switch" className="t-label text-muted">
                {copy.dentitionSwitch}
              </span>
              <SegmentedControl
                // Elegir abre la confirmación: las flechas solo mueven el foco.
                activation="manual"
                aria-labelledby="odo-dentition-switch"
                value={overall}
                disabled={readOnly}
                onValueChange={(option) => {
                  setPresetError(null);
                  setPreset(option);
                }}
                options={DENTITION_ORDER.map((option) => ({ value: option, label: DENTITION_LABELS[option] }))}
              />
            </div>
            {!readOnly ? (
              <Button type="button" variant="outline" onClick={() => openDentitionDialog(selectedTooth)}>
                {copy.changeDentition}
              </Button>
            ) : null}
            {dentition?.basis === 'AGE' && dentition.ageYears !== null ? (
              <p className="t-label pb-2.5 text-muted">{copy.dentitionByAge(dentition.ageYears)}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="odo-as-of">{copy.asOfLabel}</Label>
              <Input
                id="odo-as-of"
                type="date"
                max={todayLocal()}
                value={asOf ?? ''}
                onChange={(e) => setAsOf(e.target.value === '' ? null : e.target.value)}
                className="w-44"
              />
            </div>
            {readOnly ? (
              <Button type="button" variant="ghost" onClick={() => setAsOf(null)}>
                {copy.backToToday}
              </Button>
            ) : null}
          </div>
        </div>

        {shownAsOf ? (
          <Callout tone="warning" role="status">
            {copy.asOfNotice(formatCivilDate(`${shownAsOf}T00:00:00.000Z`))}
          </Callout>
        ) : null}

        {/* The chart and its key read as one object: the field, then its
            caption. The refresh notice rides on that same line so nothing
            shifts vertically while a save settles. */}
        <OdontogramChart
          states={states}
          catalogById={catalogById}
          selectedTooth={selectedTooth ?? undefined}
          onSelectTooth={handleSelectTooth}
          onSelectSurface={handleSelectSurface}
          dentitionOf={dentitionOf}
        />
        <div className="flex items-start justify-between gap-4">
          <OdontogramLegend items={legendItems} />
          {refreshing && (
            <p role="status" aria-live="polite" className="t-label shrink-0 text-muted">
              {copy.odontogramRefreshing}
            </p>
          )}
        </div>

        {notDrawn.length > 0 && (
          <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>{copy.notDrawn(notDrawn)}</span>
            {notDrawn.map((fdi) => (
              <button
                key={fdi}
                type="button"
                aria-label={copy.notDrawnTooth(fdi)}
                onClick={() => handleSelectTooth(fdi)}
                className="rounded px-1 font-medium tabular-nums text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {fdi}
              </button>
            ))}
          </div>
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
                pestaña y copiarse como cualquier dirección. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {planHref ? (
                <Link
                  href={planHref(selectedTooth)}
                  aria-label={copy.viewInPlanFor(selectedTooth)}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {copy.viewInPlan}
                </Link>
              ) : null}
              {implantHref && !readOnly ? (
                <Link
                  href={implantHref(selectedTooth)}
                  aria-label={copy.registerImplantFor(selectedTooth)}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {copy.registerImplant}
                </Link>
              ) : null}
              {documentsHref ? (
                <Link
                  href={documentsHref(selectedTooth)}
                  aria-label={copy.toothDocumentsFor(selectedTooth)}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {copy.toothDocuments}
                </Link>
              ) : null}
            </div>
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
                canVoid={canVoid}
                readOnly={readOnly}
                asOf={shownAsOf}
                onVoided={handleChartChanged}
              />
            </div>
            {/* `min-w-0` para que el formulario pueda encogerse por debajo de su
                max-content en móvil (si no, el catálogo lo estira a ~435px). */}
            {!readOnly ? (
              <div className="min-w-0">
                {selectedFits ? (
                  <ToothRecordPanel
                    token={token}
                    patientId={patientId}
                    toothNumber={selectedTooth}
                    initialSurface={initialSurface ?? undefined}
                    onRecordAdded={handleChartChanged}
                  />
                ) : (
                  <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                    <p role="status">
                      {copy.doesNotFit(selectedTooth, selectedPosition ?? '', dentitionOf(selectedPosition ?? ''))}
                    </p>
                    <Button type="button" variant="outline" onClick={() => openDentitionDialog(selectedTooth)}>
                      {copy.changeDentition}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <p
          role="status"
          className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted"
        >
          {isEmpty && !readOnly ? copy.emptyChartPrompt : copy.selectToothPrompt}
        </p>
      )}

      {dentitionDialog ? (
        <DentitionDialog
          open
          onOpenChange={(open) => {
            if (!open) setDentitionDialog(null);
          }}
          token={token}
          patientId={patientId}
          dentitionOf={dentitionOf}
          initialPositions={dentitionDialog.positions}
          initialDentition={dentitionDialog.dentition}
          initialReason={dentitionDialog.reason}
          onChanged={handleChartChanged}
        />
      ) : null}

      {preset ? (
        <FormModal
          open
          onOpenChange={(open) => {
            if (!open) setPreset(null);
          }}
          title={copy.presetTitle(DENTITION_LABELS[preset])}
          description={copy.presetDescription(DENTITION_LABELS[preset], presetChanges(preset, dentitionOf).length)}
          onSubmit={applyPreset}
          submitLabel={copy.presetSubmit}
          submitting={presetSubmitting}
          error={presetError}
        >
          {preset === 'MIXED' ? <p className="text-sm text-muted">{copy.presetMixedNote}</p> : null}
        </FormModal>
      ) : null}
    </div>
  );
}
