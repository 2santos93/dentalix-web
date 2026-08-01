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
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready, es-first) — matches medical-history-panel.tsx convention.
const copy = {
  loadingCatalog: 'Cargando catálogo…',
  emptyCatalog: 'No hay procedimientos ni diagnósticos en el catálogo.',
  genericCatalogError: 'No pudimos cargar el catálogo.',
  formTitle: (fdi: string) => `Registrar en el diente ${fdi}`,
  catalogItemLegend: 'Diagnóstico o procedimiento',
  catalogFilterLabel: 'Buscar en el catálogo',
  catalogFilterPlaceholder: 'Caries, resina, corona…',
  catalogNoMatches: (query: string) => `Ningún ítem del catálogo coincide con "${query}".`,
  kindLabels: { DIAGNOSIS: 'Diagnóstico', PROCEDURE: 'Procedimiento' } as const,
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
  // El catálogo sembrado trae ~100 ítems: sin filtro, elegir uno es recorrer
  // una lista de radios más alta que la pantalla.
  const [catalogQuery, setCatalogQuery] = useState('');

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
    return <SectionError description={catalogError} onRetry={() => setCatalogReloadKey((k) => k + 1)} />;
  }

  if (catalog.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.emptyCatalog}
      </p>
    );
  }

  const query = catalogQuery.trim().toLowerCase();
  const visibleCatalog = query
    ? catalog.filter(
        (item) =>
          item.labelEs.toLowerCase().includes(query) || item.code.toLowerCase().includes(query),
      )
    : catalog;

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={copy.formTitle(toothNumber)}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
    >
      <h3 className="t-title text-ink">{copy.formTitle(toothNumber)}</h3>

      <fieldset className="flex min-w-0 flex-col gap-2.5">
        <legend className="t-label mb-0.5 text-muted">{copy.catalogItemLegend}</legend>
        <Label htmlFor="trp-catalog-filter" className="sr-only">
          {copy.catalogFilterLabel}
        </Label>
        <Input
          id="trp-catalog-filter"
          type="search"
          value={catalogQuery}
          onChange={(e) => setCatalogQuery(e.target.value)}
          placeholder={copy.catalogFilterPlaceholder}
        />
        {visibleCatalog.length === 0 ? (
          <p role="status" className="py-2 text-sm text-muted">
            {copy.catalogNoMatches(catalogQuery.trim())}
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {visibleCatalog.map((item) => (
              <label
                key={item.id}
                htmlFor={`trp-catalog-${item.id}`}
                className={cn(
                  'flex cursor-pointer items-center gap-2 border-b border-hairline px-3 py-2 text-sm text-ink last:border-0 transition-colors hover:bg-surface-2',
                  catalogItemId === item.id && 'bg-surface-2',
                )}
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
                  className="size-2.5 shrink-0 rounded-[3px] border border-border"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1 truncate">{item.labelEs}</span>
                <span className="t-label shrink-0 text-muted">{copy.kindLabels[item.kind]}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="t-label text-muted">{copy.surfacesLegend}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trp-status">{copy.statusLabel}</Label>
        <select
          id="trp-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'PLANNED' | 'COMPLETED')}
          className={cn(fieldClass, 'h-10')}
        >
          <option value="COMPLETED">{copy.statusCompleted}</option>
          <option value="PLANNED">{copy.statusPlanned}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trp-notes">{copy.notesLabel}</Label>
        <textarea
          id="trp-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={fieldClass}
        />
      </div>

      {validationError && <InlineError>{validationError}</InlineError>}
      {saveError && <InlineError>{saveError}</InlineError>}

      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
