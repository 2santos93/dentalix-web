'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import {
  addToothRecord,
  type AddToothRecordInput,
  type ToothRecord,
  type ToothSurface,
} from '@/lib/odontogram/odontogram-api';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { CatalogPicker } from '@/components/odontogram/catalog-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { SURFACE_LABELS, SURFACE_ORDER } from '@/lib/odontogram/surface-labels';

// Copy as constants (i18n-ready, es-first) — matches medical-history-panel.tsx convention.
const copy = {
  loadingCatalog: 'Cargando catálogo…',
  emptyCatalog: 'No hay procedimientos ni diagnósticos en el catálogo.',
  genericCatalogError: 'No pudimos cargar el catálogo.',
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
  // Nombra lo que quedó registrado en vez de un «Guardado» genérico: el
  // formulario se vacía al guardar, y un formulario vacío es indistinguible
  // de uno que nunca se envió para quien apartó la vista hacia el paciente.
  saved: (fdi: string, item: string, detail: string) =>
    `Registrado en el diente ${fdi} · ${item} · ${detail}`,
  validationNoCatalogItem: 'Selecciona un diagnóstico o procedimiento del catálogo.',
  validationNoSurfaces: 'Selecciona al menos una cara o marca "diente completo".',
  genericSaveError: 'No pudimos guardar el registro. Intenta de nuevo.',
};


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
  // Confirmación del último guardado, construida con los valores realmente
  // enviados. Se limpia en cuanto el usuario empieza otra entrada: dejarla
  // colgada la convertiría en la confirmación del registro equivocado.
  const [savedSummary, setSavedSummary] = useState<string | null>(null);

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
    setSavedSummary(null);
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
    setSavedSummary(null);
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
        setCatalogError(apiErrorMessage(err, copy.genericCatalogError));
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

  // Tocar cualquier campo es empezar otra entrada: la confirmación anterior
  // deja de describir lo que hay en pantalla, así que se retira.
  function startNewEntry() {
    setSavedSummary(null);
  }

  function handleWholeToothChange(checked: boolean) {
    startNewEntry();
    setWholeTooth(checked);
    if (checked) {
      setSurfaces({ VESTIBULAR: false, LINGUAL: false, MESIAL: false, DISTAL: false, OCCLUSAL: false });
    }
  }

  function handleSurfaceChange(surface: ToothSurface, checked: boolean) {
    startNewEntry();
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
      // Se construye con lo enviado (diente, ítem del catálogo, caras), no con
      // la respuesta ni con el estado del formulario, que `resetForm` vacía
      // acto seguido.
      const detail = wholeTooth
        ? copy.wholeTooth.toLowerCase()
        : selectedSurfaces.map((s) => SURFACE_LABELS[s].toLowerCase()).join(', ');
      resetForm();
      setSavedSummary(copy.saved(toothNumber, item.labelEs, detail));
      onRecordAdded(created);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.genericSaveError));
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

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={copy.formTitle(toothNumber)}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
    >
      <h3 className="t-title text-ink">{copy.formTitle(toothNumber)}</h3>

      {/* Extraído a `CatalogPicker` (compartido con «Agregar ítem» del plan de
          tratamiento): mismos ids `trp-catalog-*` que antes, así que los
          `getByLabelText` existentes siguen apuntando a los mismos radios. */}
      <CatalogPicker
        items={catalog}
        value={catalogItemId}
        onChange={(id) => {
          startNewEntry();
          setCatalogItemId(id);
        }}
        idPrefix="trp-catalog"
        legend={copy.catalogItemLegend}
      />

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
          onChange={(e) => {
            startNewEntry();
            setStatus(e.target.value as 'PLANNED' | 'COMPLETED');
          }}
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
          onChange={(e) => {
            startNewEntry();
            setNotes(e.target.value);
          }}
          className={fieldClass}
        />
      </div>

      {validationError && <InlineError>{validationError}</InlineError>}
      {saveError && <InlineError>{saveError}</InlineError>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
        {/* La región viva se monta siempre y se vacía, en vez de montarse solo
            cuando hay confirmación: un `aria-live` que aparece con su
            contenido puede no llegar a anunciarse (misma estrategia que
            documenta `odontogram-tab.tsx` para sus avisos). Sin contenido, un
            `<p>` vacío no genera línea, así que tampoco mueve el layout. */}
        <p role="status" aria-live="polite" className="text-sm font-medium text-primary">
          {savedSummary}
        </p>
      </div>
    </form>
  );
}
