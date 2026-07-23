'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import {
  addToothRecord,
  type AddToothRecordInput,
  type ToothRecord,
  type ToothSurface,
} from '@/lib/odontogram/odontogram-api';

// Copy as constants (i18n-ready, es-first) — matches medical-history-panel.tsx convention.
const copy = {
  loadingCatalog: 'Cargando catálogo…',
  emptyCatalog: 'No hay procedimientos ni diagnósticos en el catálogo.',
  genericCatalogError: 'No pudimos cargar el catálogo. Intenta de nuevo.',
  retry: 'Reintentar',
  formTitle: (fdi: string) => `Registrar en el diente ${fdi}`,
  catalogItemLegend: 'Diagnóstico o procedimiento',
  surfacesLegend: 'Caras',
  wholeTooth: 'Diente completo',
  notesLabel: 'Notas',
  statusLabel: 'Estado',
  statusPlanned: 'Planificado',
  statusCompleted: 'Completado',
  submit: 'Guardar',
  submitting: 'Guardando…',
  validationNoCatalogItem: 'Selecciona un diagnóstico o procedimiento del catálogo.',
  validationNoSurfaces: 'Selecciona al menos una cara o marca "diente completo".',
  genericSaveError: 'No pudimos guardar el registro. Intenta de nuevo.',
};

const SURFACE_LABELS: Record<ToothSurface, string> = {
  VESTIBULAR: 'Vestibular',
  LINGUAL: 'Lingual',
  MESIAL: 'Mesial',
  DISTAL: 'Distal',
  OCCLUSAL: 'Oclusal',
};

const SURFACE_ORDER: ToothSurface[] = ['VESTIBULAR', 'MESIAL', 'OCCLUSAL', 'DISTAL', 'LINGUAL'];

interface ToothRecordPanelProps {
  token: string;
  patientId: string;
  toothNumber: string;
  /** Pre-checks this surface when the panel opens (e.g. the user clicked a surface, not the tooth number). */
  initialSurface?: ToothSurface;
  onRecordAdded: (record: ToothRecord) => void;
}

function initialSurfacesState(initialSurface?: ToothSurface): Record<ToothSurface, boolean> {
  return {
    VESTIBULAR: initialSurface === 'VESTIBULAR',
    LINGUAL: initialSurface === 'LINGUAL',
    MESIAL: initialSurface === 'MESIAL',
    DISTAL: initialSurface === 'DISTAL',
    OCCLUSAL: initialSurface === 'OCCLUSAL',
  };
}

export function ToothRecordPanel({
  token,
  patientId,
  toothNumber,
  initialSurface,
  onRecordAdded,
}: ToothRecordPanelProps) {
  const [catalog, setCatalog] = useState<DentalCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);

  const [catalogItemId, setCatalogItemId] = useState<string | null>(null);
  const [wholeTooth, setWholeTooth] = useState(false);
  const [surfaces, setSurfaces] = useState<Record<ToothSurface, boolean>>(() =>
    initialSurfacesState(initialSurface),
  );
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'PLANNED' | 'COMPLETED'>('COMPLETED');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Tracks the props this component was last rendered with, so a change can
  // be detected and reacted to DURING render (the React-recommended
  // "adjusting state when a prop changes" pattern) instead of in a
  // `useEffect` — `setState` synchronously inside an effect body causes a
  // second, avoidable render pass (flagged by `react-hooks/set-state-in-effect`).
  const [prevToothNumber, setPrevToothNumber] = useState(toothNumber);
  const [prevInitialSurface, setPrevInitialSurface] = useState(initialSurface);

  if (toothNumber !== prevToothNumber) {
    // A different tooth was selected: full reset (including the catalog
    // choice, notes and status — carrying them over to a different tooth
    // would silently record the wrong thing) — then seed the pre-checked
    // surface if the caller passed one.
    setPrevToothNumber(toothNumber);
    setPrevInitialSurface(initialSurface);
    setCatalogItemId(null);
    setNotes('');
    setStatus('COMPLETED');
    setValidationError(null);
    setSaveError(null);
    setWholeTooth(false);
    setSurfaces(initialSurfacesState(initialSurface));
  } else if (initialSurface !== prevInitialSurface) {
    // Same tooth, but the caller passed a different pre-selected surface
    // (the user clicked another surface on the chart while the panel is
    // already open) — only re-seed the surface checkboxes, keep the rest of
    // the in-progress form (catalog choice, notes) untouched.
    setPrevInitialSurface(initialSurface);
    setSurfaces(initialSurfacesState(initialSurface));
    setWholeTooth(false);
  }

  // Catalog is tenant-wide, not per-tooth — fetched once (and on explicit
  // retry), not re-fetched every time the selected tooth changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCatalogLoading(true);
      try {
        const data = await listCatalogItems(token, { activeOnly: true });
        if (cancelled) return;
        setCatalog(data);
        setCatalogError(null);
      } catch (err) {
        if (cancelled) return;
        setCatalogError(err instanceof ApiError ? err.message : copy.genericCatalogError);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, catalogReloadKey]);

  function resetForm() {
    setCatalogItemId(null);
    setWholeTooth(false);
    setSurfaces(initialSurfacesState(undefined));
    setNotes('');
    setStatus('COMPLETED');
  }

  function handleWholeToothChange(checked: boolean) {
    setWholeTooth(checked);
    if (checked) {
      setSurfaces({ VESTIBULAR: false, LINGUAL: false, MESIAL: false, DISTAL: false, OCCLUSAL: false });
    }
  }

  function handleSurfaceChange(surface: ToothSurface, checked: boolean) {
    setSurfaces((prev) => ({ ...prev, [surface]: checked }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError(null);
    setSaveError(null);

    const item = catalog.find((c) => c.id === catalogItemId);
    if (!item) {
      setValidationError(copy.validationNoCatalogItem);
      return;
    }

    const selectedSurfaces = SURFACE_ORDER.filter((s) => surfaces[s]);
    if (!wholeTooth && selectedSurfaces.length === 0) {
      setValidationError(copy.validationNoSurfaces);
      return;
    }

    setSubmitting(true);
    try {
      const input: AddToothRecordInput = {
        toothNumber,
        catalogItemId: item.id,
        kind: item.kind,
        surfaces: wholeTooth ? [] : selectedSurfaces,
        status,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const created = await addToothRecord(token, patientId, input);
      resetForm();
      onRecordAdded(created);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : copy.genericSaveError);
    } finally {
      setSubmitting(false);
    }
  }

  if (catalogLoading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loadingCatalog}
      </p>
    );
  }

  if (catalogError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm text-danger">
          {catalogError}
        </p>
        <button
          type="button"
          onClick={() => setCatalogReloadKey((k) => k + 1)}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink"
        >
          {copy.retry}
        </button>
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.emptyCatalog}
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={copy.formTitle(toothNumber)}
      className="flex flex-col gap-4"
    >
      <h3 className="text-base font-semibold text-ink">{copy.formTitle(toothNumber)}</h3>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{copy.catalogItemLegend}</legend>
        <div className="flex flex-col gap-1">
          {catalog.map((item) => (
            <label
              key={item.id}
              htmlFor={`trp-catalog-${item.id}`}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <input
                id={`trp-catalog-${item.id}`}
                type="radio"
                name="catalogItem"
                value={item.id}
                checked={catalogItemId === item.id}
                onChange={() => setCatalogItemId(item.id)}
              />
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: item.color }}
              />
              {item.labelEs}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{copy.surfacesLegend}</legend>
        <div className="flex flex-wrap gap-3">
          {SURFACE_ORDER.map((surface) => (
            <label
              key={surface}
              htmlFor={`trp-surface-${surface}`}
              className="flex items-center gap-1.5 text-sm text-ink"
            >
              <input
                id={`trp-surface-${surface}`}
                type="checkbox"
                checked={surfaces[surface]}
                disabled={wholeTooth}
                onChange={(e) => handleSurfaceChange(surface, e.target.checked)}
              />
              {SURFACE_LABELS[surface]}
            </label>
          ))}
          <label htmlFor="trp-whole-tooth" className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <input
              id="trp-whole-tooth"
              type="checkbox"
              checked={wholeTooth}
              onChange={(e) => handleWholeToothChange(e.target.checked)}
            />
            {copy.wholeTooth}
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="trp-status" className="text-sm font-medium text-ink">
          {copy.statusLabel}
        </label>
        <select
          id="trp-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'PLANNED' | 'COMPLETED')}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        >
          <option value="COMPLETED">{copy.statusCompleted}</option>
          <option value="PLANNED">{copy.statusPlanned}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="trp-notes" className="text-sm font-medium text-ink">
          {copy.notesLabel}
        </label>
        <textarea
          id="trp-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-danger">
          {validationError}
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-danger">
          {saveError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {submitting ? copy.submitting : copy.submit}
      </button>
    </form>
  );
}
