'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import {
  createPlanTemplate,
  getPlanTemplate,
  PLAN_TEMPLATE_CATALOG_ITEM_NOT_FOUND,
  PLAN_TEMPLATE_DUPLICATE_NAME,
  PLAN_TEMPLATE_LIMITS,
  PLAN_TEMPLATE_NOT_A_PROCEDURE,
  PLAN_TEMPLATE_STALE,
  updatePlanTemplate,
  type PlanTemplate,
  type PlanTemplateLineInput,
} from '@/lib/treatment-plans/plan-templates-api';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';

const L = PLAN_TEMPLATE_LIMITS;

export const planTemplateFormCopy = {
  createTitle: 'Nueva plantilla de plan',
  editTitle: 'Editar plantilla de plan',
  description:
    'Sin precios: el precio sale de la lista vigente del paciente al aplicarla. Editarla no cambia los planes ya hechos.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Endodoncia + corona',
  lines: 'Procedimientos',
  line: (n: number) => `Procedimiento ${n}`,
  addLine: 'Añadir procedimiento',
  procedure: 'Procedimiento',
  chooseProcedure: 'Elige un procedimiento',
  inactiveOption: (label: string) => `${label} (desactivado en el catálogo)`,
  inactiveBadge: 'Desactivado en el catálogo',
  inactiveHint: 'Al aplicar la plantilla esta línea se omite mientras siga desactivado.',
  quantity: 'Cantidad',
  visit: 'Visita',
  asksSurfaces: 'Pide superficies',
  moveUp: (n: number) => `Subir el procedimiento ${n}`,
  moveDown: (n: number) => `Bajar el procedimiento ${n}`,
  remove: (n: number) => `Quitar el procedimiento ${n}`,
  visits: 'Visitas',
  visitsHint: 'La etiqueta y la espera mínima valen para todos los procedimientos de esa visita.',
  visitHeading: (n: number) => `Visita ${n}`,
  visitLabel: 'Etiqueta',
  visitLabelPlaceholder: 'Opcional. Por ejemplo, Conductometría',
  minDays: 'Días desde la visita anterior',
  catalogLoading: 'Cargando el catálogo…',
  catalogError: 'No pudimos cargar los procedimientos del catálogo.',
  emptyCatalog: 'El catálogo no tiene procedimientos activos. Añádelos en Catálogo para armar la plantilla.',
  create: 'Crear plantilla',
  save: 'Guardar cambios',
  invalidName: `Escribe un nombre (hasta ${L.nameMax} caracteres).`,
  noLines: 'Añade al menos un procedimiento.',
  tooManyLines: `Una plantilla admite hasta ${L.linesMax} procedimientos.`,
  invalidProcedure: (n: number) => `Elige el procedimiento de la línea ${n}.`,
  invalidQuantity: (n: number) => `La cantidad de la línea ${n} va de 1 a ${L.quantityMax}.`,
  invalidVisit: (n: number) => `La visita de la línea ${n} va de 1 a ${L.visitMax}.`,
  invalidDays: (n: number) => `Los días de la visita ${n} van de 0 a ${L.intervalDaysMax}.`,
  genericError: 'No pudimos guardar la plantilla. Intenta de nuevo.',
  stale:
    'La plantilla cambió mientras la editabas. Recárgala para ver la versión guardada; lo que cambiaste sin guardar se descarta.',
  reload: 'Recargar',
  reloadError: 'No pudimos recargar la plantilla. Intenta de nuevo.',
};

const copy = planTemplateFormCopy;

interface LineDraft {
  key: number;
  catalogItemId: string;
  /** Nombre que dio la API (para el procedimiento que ya no está activo). */
  savedLabel: string | null;
  savedActive: boolean;
  quantity: string;
  visit: string;
  asksSurfaces: boolean;
}

interface VisitDraft {
  label: string;
  minDays: string;
}

function linesOf(template: PlanTemplate | null): LineDraft[] {
  if (!template) return [{ key: 0, catalogItemId: '', savedLabel: null, savedActive: true, quantity: '1', visit: '1', asksSurfaces: false }];
  return [...template.lines]
    .sort((a, b) => a.position - b.position)
    .map((l, i) => ({
      key: i,
      catalogItemId: l.catalogItemId,
      savedLabel: l.catalogItemCode ? `${l.catalogItemCode} · ${l.catalogItemLabel}` : l.catalogItemLabel,
      savedActive: l.catalogItemActive,
      quantity: String(l.quantity),
      visit: String(l.visit),
      asksSurfaces: l.asksSurfaces,
    }));
}

function visitsOf(template: PlanTemplate | null): Record<number, VisitDraft> {
  const out: Record<number, VisitDraft> = {};
  if (!template) return out;
  for (const l of template.lines) {
    out[l.visit] ??= { label: l.visitLabel ?? '', minDays: '' };
    if (!out[l.visit].label && l.visitLabel) out[l.visit].label = l.visitLabel;
  }
  for (const [k, days] of Object.entries(template.visitIntervals ?? {})) {
    const n = Number(k);
    out[n] = { label: out[n]?.label ?? '', minDays: String(days) };
  }
  return out;
}

/** Entero dentro de [min, max], o null. */
function intIn(text: string, min: number, max: number): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

function itemLabel(item: DentalCatalogItem): string {
  return item.code ? `${item.code} · ${item.labelEs}` : item.labelEs;
}

interface PlanTemplateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin plantilla: alta. Con plantilla: edición. */
  template?: PlanTemplate | null;
  onSaved: (template: PlanTemplate) => void;
  /** «Recargar» trajo la versión guardada: el padre actualiza su lista. */
  onReloaded?: (template: PlanTemplate) => void;
}

/**
 * Alta y edición de una plantilla de plan (DX-559, solo ADMIN): nombre,
 * procedimientos del catálogo (cantidad, visita y si pide superficies) y, por
 * visita, su etiqueta y los días mínimos desde la anterior. No guarda precios:
 * al aplicarla, cada línea toma el precio vigente del paciente. El padre lo
 * monta con una `key` por apertura.
 */
export function PlanTemplateFormModal({
  open,
  onOpenChange,
  token,
  template,
  onSaved,
  onReloaded,
}: PlanTemplateFormModalProps) {
  const ids = useId();
  const [current, setCurrent] = useState<PlanTemplate | null>(template ?? null);
  const editing = !!current;
  const [name, setName] = useState(template?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineDraft[]>(() => linesOf(template ?? null));
  const [nextKey, setNextKey] = useState(() => Math.max(1, template?.lines.length ?? 1));
  const [visits, setVisits] = useState<Record<number, VisitDraft>>(() => visitsOf(template ?? null));
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [catalog, setCatalog] = useState<DentalCatalogItem[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogReload, setCatalogReload] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listCatalogItems(token, { kind: 'PROCEDURE' })
      .then((items) => {
        if (cancelled) return;
        setCatalog(items);
        setCatalogError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setCatalogError(apiErrorMessage(err, copy.catalogError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, catalogReload]);

  const activeItems = (catalog ?? []).filter((i) => i.active).sort((a, b) => a.labelEs.localeCompare(b.labelEs, 'es'));
  const catalogById = new Map((catalog ?? []).map((i) => [i.id, i]));

  // Las visitas que usan las líneas, de 1 a la mayor (las intermedias también:
  // la API admite intervalos de 2 a la última visita).
  const visitNumbers = lines.map((l) => intIn(l.visit, 1, L.visitMax)).filter((v): v is number => v !== null);
  const lastVisit = visitNumbers.length ? Math.max(...visitNumbers) : 1;
  const usedVisits = new Set(visitNumbers);
  const visitRows = Array.from({ length: lastVisit }, (_, i) => i + 1);

  function applyTemplate(t: PlanTemplate) {
    setCurrent(t);
    setName(t.name);
    setLines(linesOf(t));
    setNextKey(Math.max(1, t.lines.length));
    setVisits(visitsOf(t));
    setLineErrors({});
    setNameError(null);
  }

  async function handleReload() {
    if (!current) return;
    setReloading(true);
    try {
      const fresh = await getPlanTemplate(token, current.id);
      applyTemplate(fresh);
      onReloaded?.(fresh);
      setStale(false);
      setError(null);
    } catch {
      setError(copy.reloadError);
    } finally {
      setReloading(false);
    }
  }

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setLineErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function move(index: number, delta: -1 | 1) {
    setLines((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }

  function addLine() {
    const last = lines[lines.length - 1];
    setLines((prev) => [
      ...prev,
      {
        key: nextKey,
        catalogItemId: '',
        savedLabel: null,
        savedActive: true,
        quantity: '1',
        visit: last?.visit ?? '1',
        asksSurfaces: false,
      },
    ]);
    setNextKey((k) => k + 1);
  }

  function updateVisit(n: number, patch: Partial<VisitDraft>) {
    setVisits((prev) => ({ ...prev, [n]: { label: prev[n]?.label ?? '', minDays: prev[n]?.minDays ?? '', ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStale(false);
    setNameError(null);
    setLineErrors({});
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > L.nameMax) return setNameError(copy.invalidName);
    if (lines.length === 0) return setError(copy.noLines);
    if (lines.length > L.linesMax) return setError(copy.tooManyLines);

    const payload: PlanTemplateLineInput[] = [];
    for (const [i, l] of lines.entries()) {
      const n = i + 1;
      if (!l.catalogItemId) return setLineErrors({ [l.key]: copy.invalidProcedure(n) });
      const quantity = intIn(l.quantity, 1, L.quantityMax);
      if (quantity === null) return setLineErrors({ [l.key]: copy.invalidQuantity(n) });
      const visit = intIn(l.visit, 1, L.visitMax);
      if (visit === null) return setLineErrors({ [l.key]: copy.invalidVisit(n) });
      const label = (visits[visit]?.label ?? '').trim();
      payload.push({
        catalogItemId: l.catalogItemId,
        quantity,
        visit,
        visitLabel: label === '' ? null : label,
        asksSurfaces: l.asksSurfaces,
      });
    }
    const visitIntervals: Record<string, number> = {};
    for (let v = 2; v <= lastVisit; v += 1) {
      const raw = (visits[v]?.minDays ?? '').trim();
      if (raw === '') continue;
      const days = intIn(raw, 0, L.intervalDaysMax);
      if (days === null) return setError(copy.invalidDays(v));
      visitIntervals[String(v)] = days;
    }

    setSubmitting(true);
    try {
      const input = { name: trimmed, lines: payload, visitIntervals };
      const saved = current
        ? await updatePlanTemplate(token, current.id, { ...input, version: current.version })
        : await createPlanTemplate(token, input);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericError);
      if (err instanceof ApiError && err.status === 409 && err.code === PLAN_TEMPLATE_STALE) {
        setStale(true);
        setError(copy.stale);
      } else if (err instanceof ApiError && err.status === 409 && err.code === PLAN_TEMPLATE_DUPLICATE_NAME) {
        setNameError(message);
      } else if (
        err instanceof ApiError &&
        (err.code === PLAN_TEMPLATE_CATALOG_ITEM_NOT_FOUND || err.code === PLAN_TEMPLATE_NOT_A_PROCEDURE) &&
        err.position !== null &&
        lines[err.position]
      ) {
        setLineErrors({ [lines[err.position].key]: message });
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const catalogReady = catalog !== null;
  const noProcedures = catalogReady && activeItems.length === 0 && !editing;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting || reloading}
      submitBusy={!catalogReady && !catalogError}
      hideSubmit={Boolean(catalogError) || noProcedures}
      error={error}
      errorRetry={stale ? { label: copy.reload, onRetry: () => void handleReload() } : null}
      size="lg"
    >
      <FormField htmlFor={`${ids}-name`} label={copy.name} error={nameError}>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={L.nameMax}
          placeholder={copy.namePlaceholder}
          aria-invalid={nameError ? true : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          required
        />
      </FormField>

      {catalogError ? (
        <SectionError
          description={catalogError}
          onRetry={() => {
            setCatalogError(null);
            setCatalogReload((k) => k + 1);
          }}
        />
      ) : !catalogReady ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label={copy.catalogLoading}>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : noProcedures ? (
        <p role="status" className="text-sm text-muted">
          {copy.emptyCatalog}
        </p>
      ) : (
        <>
          <section aria-labelledby={`${ids}-lines`} className="flex flex-col gap-3">
            <h3 id={`${ids}-lines`} className="text-sm font-semibold text-ink">
              {copy.lines}
            </h3>
            <ol className="flex flex-col gap-3">
              {lines.map((l, index) => {
                const n = index + 1;
                const base = `${ids}-l${l.key}`;
                const known = l.catalogItemId ? catalogById.get(l.catalogItemId) : undefined;
                const inactive = Boolean(l.catalogItemId) && (known ? !known.active : !l.savedActive);
                const lineError = lineErrors[l.key] ?? null;
                return (
                  <li
                    key={l.key}
                    aria-label={copy.line(n)}
                    className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-medium text-muted tabular-nums">
                        {copy.line(n)}
                        {inactive ? <Badge variant="warning">{copy.inactiveBadge}</Badge> : null}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={copy.moveUp(n)}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={copy.moveDown(n)}
                          disabled={index === lines.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={copy.remove(n)}
                          disabled={lines.length === 1}
                          onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <FormField
                      htmlFor={`${base}-procedure`}
                      label={copy.procedure}
                      hint={inactive ? copy.inactiveHint : undefined}
                    >
                      <NativeSelect
                        id={`${base}-procedure`}
                        value={l.catalogItemId}
                        aria-invalid={lineError ? true : undefined}
                        onChange={(e) => updateLine(l.key, { catalogItemId: e.target.value })}
                      >
                        <option value="">{copy.chooseProcedure}</option>
                        {inactive ? (
                          <option value={l.catalogItemId}>
                            {copy.inactiveOption(known ? itemLabel(known) : (l.savedLabel ?? ''))}
                          </option>
                        ) : null}
                        {activeItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {itemLabel(item)}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_8rem_1fr] sm:items-end">
                      <FormField htmlFor={`${base}-qty`} label={copy.quantity}>
                        <Input
                          id={`${base}-qty`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={L.quantityMax}
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                          className="tabular-nums"
                        />
                      </FormField>
                      <FormField htmlFor={`${base}-visit`} label={copy.visit}>
                        <Input
                          id={`${base}-visit`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={L.visitMax}
                          value={l.visit}
                          onChange={(e) => updateLine(l.key, { visit: e.target.value })}
                          className="tabular-nums"
                        />
                      </FormField>
                      <Checkbox
                        id={`${base}-surfaces`}
                        className="col-span-2 sm:col-span-1 sm:pb-2"
                        label={copy.asksSurfaces}
                        checked={l.asksSurfaces}
                        onChange={(e) => updateLine(l.key, { asksSurfaces: e.target.checked })}
                      />
                    </div>
                    {lineError ? <InlineError className="text-xs">{lineError}</InlineError> : null}
                  </li>
                );
              })}
            </ol>
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              disabled={lines.length >= L.linesMax}
              onClick={addLine}
            >
              <Plus aria-hidden />
              {copy.addLine}
            </Button>
          </section>

          <section aria-labelledby={`${ids}-visits`} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 id={`${ids}-visits`} className="text-sm font-semibold text-ink">
                {copy.visits}
              </h3>
              <p className="text-xs text-muted">{copy.visitsHint}</p>
            </div>
            <ol className="flex flex-col gap-3">
              {visitRows.map((v) => (
                <li
                  key={v}
                  aria-label={copy.visitHeading(v)}
                  className="grid gap-3 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[6rem_1fr_14rem] sm:items-end"
                >
                  <span className="text-sm font-medium text-ink tabular-nums sm:pb-2">{copy.visitHeading(v)}</span>
                  <FormField htmlFor={`${ids}-v${v}-label`} label={copy.visitLabel}>
                    <Input
                      id={`${ids}-v${v}-label`}
                      value={visits[v]?.label ?? ''}
                      maxLength={L.visitLabelMax}
                      placeholder={copy.visitLabelPlaceholder}
                      disabled={!usedVisits.has(v)}
                      onChange={(e) => updateVisit(v, { label: e.target.value })}
                    />
                  </FormField>
                  {v >= 2 ? (
                    <FormField htmlFor={`${ids}-v${v}-days`} label={copy.minDays}>
                      <Input
                        id={`${ids}-v${v}-days`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={L.intervalDaysMax}
                        value={visits[v]?.minDays ?? ''}
                        onChange={(e) => updateVisit(v, { minDays: e.target.value })}
                        className="tabular-nums"
                      />
                    </FormField>
                  ) : (
                    <span aria-hidden className="hidden sm:block" />
                  )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </FormModal>
  );
}
