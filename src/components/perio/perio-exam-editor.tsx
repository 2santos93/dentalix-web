'use client';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Save } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  PERIO_STATUS_LABELS,
  finalizePerioExam,
  getPerioExam,
  savePerioMeasures,
  type PerioExamDetail,
  type PerioSite,
} from '@/lib/perio/perio-api';
import {
  EMPTY_SITE,
  EMPTY_TOOTH,
  computeDraftIndices,
  draftFromExam,
  emptyDraft,
  siteKey,
  toSavePayload,
  type DraftIndices,
  type PerioDraft,
  type SiteValues,
  type ToothValues,
} from '@/lib/perio/perio-grid';
import { formatCivilDate } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InlineError } from '@/components/errors/inline-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PerioChart } from './perio-chart';

const copy = {
  back: 'Volver al histórico',
  loading: 'Cargando examen periodontal',
  loadError: 'No pudimos cargar el examen.',
  saveError: 'No pudimos guardar los cambios.',
  finalizeError: 'No pudimos finalizar el examen.',
  heading: (date: string) => `Examen del ${date}`,
  by: (name: string) => `Realizado por ${name}`,
  save: 'Guardar',
  saved: 'Cambios guardados',
  unsaved: 'Tienes cambios sin guardar.',
  finalize: 'Finalizar examen',
  finalizeTitle: '¿Finalizar el examen?',
  finalizeDescription:
    'Un examen finalizado no se puede modificar. Si luego hay que corregir algo, se registra un examen nuevo.',
  finalizeConfirm: 'Finalizar',
  readOnly:
    'Examen finalizado: solo lectura. Para corregirlo, crea un examen nuevo desde el histórico.',
  leaveTitle: '¿Salir sin guardar?',
  leaveDescription: 'Los cambios que no guardaste se perderán.',
  leaveConfirm: 'Salir sin guardar',
  compare: (date: string) => `Comparar con el examen anterior (${date})`,
  noPrevious: 'No hay un examen anterior para comparar.',
  help: 'Escribe un dígito y el cursor salta al sitio siguiente. Flechas para moverte. «+» y un dígito para 10–19 mm; «-» y un dígito para recesión negativa. En una celda de sondaje, B marca sangrado, S supuración y P placa. Haz clic en el número de un diente para omitirlo.',
  indicesHeading: 'Índices',
  indicesPrevious: 'Anterior',
  bop: 'Sangrado (BOP)',
  plaque: 'Placa',
  deep4: 'Sitios ≥ 4 mm',
  deep6: 'Sitios ≥ 6 mm',
  examined: 'Sitios examinados',
  convention:
    'NIC = sondaje + recesión. Recesión positiva: margen gingival por debajo de la unión amelocementaria; negativa: por encima.',
};

interface PerioExamEditorProps {
  token: string;
  patientId: string;
  examId: string;
  /** El examen inmediatamente anterior (para comparar), si existe. */
  previous: { id: string; examDate: string } | null;
  onBack: () => void;
  /** El examen cambió (guardado o finalizado): el histórico se refresca. */
  onChanged: () => void;
}

function EditorSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function cloneDraft(draft: PerioDraft): PerioDraft {
  return { sites: new Map(draft.sites), teeth: new Map(draft.teeth) };
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Editor de un examen periodontal (DX-007): las dos arcadas en rejilla con
 * captura rápida por teclado, NIC calculado, índices en vivo, comparación con
 * el examen anterior y «Guardar» / «Finalizar». Un examen FINAL se muestra en
 * solo lectura.
 */
export function PerioExamEditor({
  token,
  patientId,
  examId,
  previous,
  onBack,
  onChanged,
}: PerioExamEditorProps) {
  const [exam, setExam] = useState<PerioExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<PerioDraft>(emptyDraft);
  const [dirtySites, setDirtySites] = useState<Set<string>>(new Set());
  const [dirtyTeeth, setDirtyTeeth] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [previousExam, setPreviousExam] = useState<PerioExamDetail | null>(null);
  const [previousError, setPreviousError] = useState<string | null>(null);

  const dirty = dirtySites.size > 0 || dirtyTeeth.size > 0;
  const readOnly = exam?.status === 'FINAL';

  const adopt = useCallback((detail: PerioExamDetail) => {
    setExam(detail);
    setDraft(draftFromExam(detail));
    setDirtySites(new Set());
    setDirtyTeeth(new Set());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const detail = await getPerioExam(token, patientId, examId);
        if (cancelled) return;
        adopt(detail);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(errorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, examId, reloadKey, adopt]);

  // El examen anterior solo se pide al activar la comparación.
  useEffect(() => {
    if (!comparing || !previous || previousExam?.id === previous.id) return;
    let cancelled = false;
    getPerioExam(token, patientId, previous.id)
      .then((detail) => {
        if (!cancelled) {
          setPreviousExam(detail);
          setPreviousError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setPreviousError(errorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [comparing, previous, previousExam, token, patientId]);

  // Aviso del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function changeSite(toothFdi: number, site: PerioSite, patch: Partial<SiteValues>) {
    const key = siteKey(toothFdi, site);
    setDraft((prev) => {
      const next = cloneDraft(prev);
      next.sites.set(key, { ...(prev.sites.get(key) ?? EMPTY_SITE), ...patch });
      return next;
    });
    setDirtySites((prev) => new Set(prev).add(key));
    setSavedNotice(false);
  }

  function changeTooth(toothFdi: number, patch: Partial<ToothValues>) {
    setDraft((prev) => {
      const next = cloneDraft(prev);
      next.teeth.set(toothFdi, {
        ...(prev.teeth.get(toothFdi) ?? EMPTY_TOOTH),
        ...patch,
      });
      return next;
    });
    setDirtyTeeth((prev) => new Set(prev).add(toothFdi));
    setSavedNotice(false);
  }

  /** Guarda lo pendiente; `false` si falló (el error queda a la vista). */
  async function save(): Promise<boolean> {
    if (!dirty) return true;
    setSaving(true);
    setActionError(null);
    try {
      const detail = await savePerioMeasures(
        token,
        patientId,
        examId,
        toSavePayload(draft, dirtySites, dirtyTeeth),
      );
      adopt(detail);
      setSavedNotice(true);
      onChanged();
      return true;
    } catch (err) {
      setActionError(errorMessage(err, copy.saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    setFinalizing(true);
    setActionError(null);
    try {
      // Lo pendiente se guarda antes: lo que se finaliza es lo que se ve.
      if (!(await save())) {
        setConfirmFinalize(false);
        return;
      }
      const detail = await finalizePerioExam(token, patientId, examId);
      adopt(detail);
      setConfirmFinalize(false);
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err, copy.finalizeError));
      setConfirmFinalize(false);
    } finally {
      setFinalizing(false);
    }
  }

  function requestBack() {
    if (dirty) setConfirmLeave(true);
    else onBack();
  }

  const indices = useMemo(() => computeDraftIndices(draft), [draft]);

  const previousProbing = useMemo(() => {
    if (!comparing || !previousExam) return null;
    return new Map(
      previousExam.sites.map((s) => [siteKey(s.toothFdi, s.site), s.probingMm] as const),
    );
  }, [comparing, previousExam]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={requestBack}>
          <ArrowLeft aria-hidden />
          {copy.back}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<EditorSkeleton />}
      >
        {exam ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-ink">
                    {copy.heading(formatCivilDate(exam.examDate))}
                  </h2>
                  <Badge variant={exam.status === 'FINAL' ? 'success' : 'warning'}>
                    {PERIO_STATUS_LABELS[exam.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted">{copy.by(exam.providerName)}</p>
                {exam.notes ? <p className="max-w-[68ch] text-sm text-ink">{exam.notes}</p> : null}
              </div>
              {!readOnly ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void save()}
                    loading={saving}
                    disabled={!dirty || finalizing}
                    className="w-full sm:w-auto"
                  >
                    <Save aria-hidden />
                    {copy.save}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setConfirmFinalize(true)}
                    disabled={saving || finalizing}
                    className="w-full sm:w-auto"
                  >
                    <CheckCircle2 aria-hidden />
                    {copy.finalize}
                  </Button>
                </div>
              ) : null}
            </div>

            {readOnly ? (
              <p
                role="status"
                className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-ink"
              >
                {copy.readOnly}
              </p>
            ) : (
              <p className="max-w-[90ch] text-xs text-muted">{copy.help}</p>
            )}

            <div aria-live="polite" className="text-sm">
              {dirty ? (
                <p className="font-medium text-warning">{copy.unsaved}</p>
              ) : savedNotice ? (
                <p className="text-success">{copy.saved}</p>
              ) : null}
            </div>
            {actionError ? <InlineError variant="summary">{actionError}</InlineError> : null}

            {previous ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={comparing}
                  onChange={(e) => setComparing(e.target.checked)}
                  className="size-4 accent-[var(--color-primary)]"
                />
                {copy.compare(formatCivilDate(previous.examDate))}
              </label>
            ) : (
              <p className="text-sm text-muted">{copy.noPrevious}</p>
            )}
            {comparing && previousError ? (
              <InlineError variant="summary">{previousError}</InlineError>
            ) : null}

            <IndicesPanel
              current={indices}
              previous={comparing && previousExam ? previousExam.indices : null}
            />

            <PerioChart
              arch="upper"
              draft={draft}
              readOnly={readOnly}
              onSiteChange={changeSite}
              onToothChange={changeTooth}
              previousProbing={previousProbing}
            />
            <PerioChart
              arch="lower"
              draft={draft}
              readOnly={readOnly}
              onSiteChange={changeSite}
              onToothChange={changeTooth}
              previousProbing={previousProbing}
            />
            <p className="text-xs text-muted">{copy.convention}</p>
          </div>
        ) : null}
      </AsyncSection>

      <ConfirmDialog
        open={confirmFinalize}
        onOpenChange={setConfirmFinalize}
        title={copy.finalizeTitle}
        description={copy.finalizeDescription}
        confirmLabel={copy.finalizeConfirm}
        onConfirm={() => void finalize()}
        confirming={finalizing}
        destructive={false}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={copy.leaveTitle}
        description={copy.leaveDescription}
        confirmLabel={copy.leaveConfirm}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />
    </div>
  );
}

const INDEX_ROWS: {
  key: keyof DraftIndices;
  label: string;
  percent?: boolean;
  lowerIsBetter: boolean;
}[] = [
  { key: 'bopPercent', label: copy.bop, percent: true, lowerIsBetter: true },
  {
    key: 'plaquePercent',
    label: copy.plaque,
    percent: true,
    lowerIsBetter: true,
  },
  { key: 'sites4mmOrMore', label: copy.deep4, lowerIsBetter: true },
  { key: 'sites6mmOrMore', label: copy.deep6, lowerIsBetter: true },
  { key: 'sitesExamined', label: copy.examined, lowerIsBetter: false },
];

function formatIndex(value: number, percent?: boolean): string {
  return percent ? `${value.toLocaleString('es-CO')} %` : String(value);
}

/** Índices del examen en vivo; con comparación, también los del anterior. */
function IndicesPanel({
  current,
  previous,
}: {
  current: DraftIndices;
  previous: DraftIndices | null;
}) {
  return (
    <section
      aria-label={copy.indicesHeading}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-ink">{copy.indicesHeading}</h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {INDEX_ROWS.map((row) => {
          const now = current[row.key];
          const before = previous ? previous[row.key] : null;
          const better =
            before !== null && row.lowerIsBetter && now !== before ? now < before : null;
          return (
            <div key={row.key} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink">
                {formatIndex(now, row.percent)}
              </dd>
              {before !== null ? (
                <dd
                  className={
                    better === null
                      ? 'text-xs text-muted'
                      : better
                        ? 'text-xs text-success'
                        : 'text-xs text-danger'
                  }
                >
                  {copy.indicesPrevious}: {formatIndex(before, row.percent)}
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
