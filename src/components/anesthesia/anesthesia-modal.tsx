'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Info, ShieldAlert } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/client';
import {
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
  TECHNIQUE_LABELS,
  checkAnesthesiaDose,
  formatDecimal,
  getEntryAnesthesia,
  listAnesthetics,
  loadSampleAnesthetics,
  parseCarpules,
  parseWeightKg,
  recordAnesthesia,
  type AnesthesiaCheck,
  type AnesthesiaTechnique,
  type AnestheticProduct,
  type DoseAlert,
  type EntryAnesthesia,
  type RecordedAnesthesia,
} from '@/lib/anesthesia/anesthesia-api';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { wallDay, wallInstant, wallMinuteOfDay } from '@/lib/time/wall-clock';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { AnesthesiaDoseBar } from './anesthesia-dose-bar';

export const anesthesiaCopy = {
  title: 'Anestesia local',
  description: (entryDate: string) =>
    `Evolución del ${entryDate}. Lo registrado no se edita: una corrección va en una adenda de la evolución.`,
  disclaimer:
    'Los valores del catálogo son una ayuda y no sustituyen la ficha técnica del fabricante ni tu juicio clínico.',
  loading: 'Cargando la anestesia de la evolución',
  loadError: 'No pudimos cargar la anestesia de la evolución.',
  recordedHeading: 'Registrada en esta evolución',
  noneRecorded: 'Aún no hay anestesia registrada en esta evolución.',
  emptyCatalog: 'La clínica aún no tiene anestésicos en su catálogo.',
  emptyCatalogAdmin: 'Carga los sugeridos (con dosis máximas de referencia editables) para empezar.',
  emptyCatalogOther: 'Pide al administrador que cargue el catálogo de anestésicos.',
  loadSamples: 'Cargar anestésicos sugeridos',
  newHeading: 'Añadir anestesia',
  anesthetic: 'Anestésico',
  chooseAnesthetic: 'Elige un anestésico',
  carpules: 'Carpules',
  carpulesHint: 'Admite medios y cuartos: 0,5 · 1,25 · 2.',
  carpulesInvalid: 'Escribe los carpules de 0,25 en 0,25, entre 0,25 y 20.',
  technique: 'Técnica',
  site: 'Zona o dientes (FDI)',
  lot: 'Lote (opcional)',
  time: 'Hora',
  weight: 'Peso del paciente (kg)',
  weightHintMissing: 'Sin peso no se puede calcular la dosis máxima.',
  weightHintRequired: 'Menor de 12 años: anota el peso antes de guardar.',
  weightInvalid: 'Escribe el peso en kg (por ejemplo 18,5).',
  weightRequired: 'Anota el peso: en menores de 12 años la dosis máxima se calcula por peso.',
  anestheticRequired: 'Elige el anestésico.',
  checking: 'Calculando la dosis…',
  checkError: 'No se pudo calcular la dosis. Revisa la conexión e inténtalo de nuevo.',
  blockingTitle: 'Requiere confirmación',
  confirm: 'Confirmo que conozco el aviso y aplico la anestesia bajo mi responsabilidad.',
  confirmRequired: 'Marca la confirmación para guardar pese al aviso.',
  reasonLabel: 'Motivo',
  reasonHint: `Queda sellado en el registro y en la auditoría. Mínimo ${OVERRIDE_REASON_MIN} caracteres.`,
  reasonTooShort: `El motivo debe tener al menos ${OVERRIDE_REASON_MIN} caracteres.`,
  submit: 'Registrar anestesia',
  close: 'Cerrar',
  genericError: 'No pudimos registrar la anestesia. Intenta de nuevo.',
  conflict: 'La dosis supera el máximo o hay un aviso de alergia: confirma con un motivo.',
  line: (r: { carpules: number; doseMg: number }) =>
    `${formatDecimal(r.carpules)} carp. · ${formatDecimal(r.doseMg)} mg`,
  override: 'Confirmado con motivo:',
};

const TECHNIQUES = Object.keys(TECHNIQUE_LABELS) as AnesthesiaTechnique[];
const CHECK_DEBOUNCE_MS = 400;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entry: EntryAnesthesia; catalog: AnestheticProduct[] };

type CheckState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; check: AnesthesiaCheck };

interface AnesthesiaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  entryId: string;
  entryDateLabel: string;
  /** DENTIST y ADMIN registran; la asistente solo lo ve. */
  canRecord: boolean;
  /** ADMIN: puede cargar los anestésicos sugeridos si el catálogo está vacío. */
  canManageCatalog: boolean;
  /** Reloj de la sede: la hora se pinta y se elige en su zona. */
  clock: SedeClock | null;
  onRecorded: (record: RecordedAnesthesia) => void;
}

function nowHHmm(clock: SedeClock | null): string {
  if (!clock) return '';
  const minute = wallMinuteOfDay(new Date(), clock.timeZone);
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function AlertLines({ alerts }: { alerts: DoseAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {alerts
        .filter((a) => a.code !== 'DOSE_NEAR_MAX' && a.code !== 'WEIGHT_MISSING')
        .map((alert) => {
          const blocking = alert.severity === 'BLOCKING';
          const Icon = blocking ? ShieldAlert : Info;
          return (
            <li
              key={alert.code}
              className={cn(
                'flex items-start gap-2 rounded-md border p-3 text-sm text-ink',
                blocking ? 'border-danger/40 bg-danger/5' : 'border-warning/40 bg-warning/5',
              )}
            >
              <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', blocking ? 'text-danger' : 'text-warning')} />
              <span className="min-w-0 break-words">{alert.message}</span>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * Anestesia local de una evolución (DX-307): lo ya registrado con su
 * acumulado y, para quien la aplica, el formulario de un registro nuevo con
 * la barra de dosis que calcula el SERVIDOR al cambiar anestésico, carpules o
 * peso. ≥ 80 % avisa; ≥ 100 % (o alergia a anestésicos) pide confirmación y
 * motivo, que la API sella y audita.
 */
export function AnesthesiaModal({
  open,
  onOpenChange,
  token,
  patientId,
  entryId,
  entryDateLabel,
  canRecord,
  canManageCatalog,
  clock,
  onRecorded,
}: AnesthesiaModalProps) {
  const id = useId();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [anestheticId, setAnestheticId] = useState('');
  const [carpulesText, setCarpulesText] = useState('');
  const [technique, setTechnique] = useState<AnesthesiaTechnique>('INFILTRATION');
  const [site, setSite] = useState('');
  const [lot, setLot] = useState('');
  const [time, setTime] = useState(() => nowHHmm(clock));
  const [weightText, setWeightText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  // Resultado de la última previsualización, con la clave de lo que se pidió.
  const [checkResult, setCheckResult] = useState<
    { key: string; kind: 'ready'; check: AnesthesiaCheck } | { key: string; kind: 'error' } | null
  >(null);
  const [checkKey, setCheckKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestSeq = useRef(0);

  function reload() {
    setLoad({ kind: 'loading' });
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEntryAnesthesia(token, patientId, entryId), listAnesthetics(token)])
      .then(([entry, catalog]) => {
        if (!cancelled) setLoad({ kind: 'ready', entry, catalog });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ kind: 'error', message: apiErrorMessage(err, anesthesiaCopy.loadError) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, entryId, reloadKey]);

  const carpules = parseCarpules(carpulesText);
  const weightKg = weightText.trim() === '' ? undefined : parseWeightKg(weightText);

  // Previsualización del servidor: con anestésico y carpules válidos. Lo que
  // se pinta se deriva de la clave: sin clave, nada; con una clave aún sin
  // resultado, «calculando».
  const currentKey =
    canRecord && anestheticId && carpules !== null && weightKg !== null
      ? `${anestheticId}|${carpules}|${weightKg ?? ''}|${checkKey}`
      : null;
  const check: CheckState =
    currentKey === null
      ? { kind: 'idle' }
      : checkResult?.key === currentKey
        ? checkResult
        : { kind: 'loading' };

  useEffect(() => {
    if (currentKey === null || carpules === null || weightKg === null) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      checkAnesthesiaDose(token, patientId, entryId, {
        anestheticId,
        carpules,
        ...(weightKg !== undefined ? { weightKg } : {}),
      })
        .then((result) => {
          if (seq === requestSeq.current) setCheckResult({ key: currentKey, kind: 'ready', check: result });
        })
        .catch(() => {
          if (seq === requestSeq.current) setCheckResult({ key: currentKey, kind: 'error' });
        });
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [currentKey, token, patientId, entryId, anestheticId, carpules, weightKg]);

  const preview = check.kind === 'ready' ? check.check : null;
  const blocking = preview?.summary.alerts.some((a) => a.severity === 'BLOCKING') ?? false;
  const entryState = load.kind === 'ready' ? load.entry : null;
  const weightRequired = preview?.weightRequired ?? entryState?.weightRequired ?? false;
  const showWeight =
    weightText !== '' ||
    weightRequired ||
    (preview ? preview.summary.weightKg === null : entryState?.summary.weightKg === null);

  const handleLoadSamples = useCallback(async () => {
    setLoadingSamples(true);
    try {
      await loadSampleAnesthetics(token);
      reload();
    } catch (err) {
      setLoad({ kind: 'error', message: apiErrorMessage(err, anesthesiaCopy.loadError) });
    } finally {
      setLoadingSamples(false);
    }
  }, [token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string | null> = {
      anesthetic: anestheticId ? null : anesthesiaCopy.anestheticRequired,
      carpules: carpules === null ? anesthesiaCopy.carpulesInvalid : null,
      weight:
        weightKg === null
          ? anesthesiaCopy.weightInvalid
          : weightRequired && weightKg === undefined
            ? anesthesiaCopy.weightRequired
            : null,
      confirm: blocking && !confirmed ? anesthesiaCopy.confirmRequired : null,
      reason:
        blocking && reason.trim().length < OVERRIDE_REASON_MIN ? anesthesiaCopy.reasonTooShort : null,
    };
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean) || carpules === null) return;

    const minutes = /^(\d{2}):(\d{2})$/.exec(time);
    const administeredAt =
      clock && minutes
        ? wallInstant(
            wallDay(new Date(), clock.timeZone),
            Number(minutes[1]) * 60 + Number(minutes[2]),
            clock.timeZone,
          ).toISOString()
        : undefined;

    setSubmitting(true);
    try {
      const created = await recordAnesthesia(token, patientId, entryId, {
        anestheticId,
        carpules,
        technique,
        ...(weightKg !== undefined && weightKg !== null ? { weightKg } : {}),
        ...(site.trim() ? { site: site.trim() } : {}),
        ...(lot.trim() ? { lot: lot.trim() } : {}),
        ...(administeredAt ? { administeredAt } : {}),
        ...(blocking ? { overrideReason: reason.trim() } : {}),
      });
      onRecorded(created);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // El acumulado cambió (otro registro) o hay un aviso nuevo: se
        // recalcula y se pide el motivo.
        setFormError(anesthesiaCopy.conflict);
        setCheckKey((k) => k + 1);
      } else {
        setFormError(apiErrorMessage(err, anesthesiaCopy.genericError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const catalog = load.kind === 'ready' ? load.catalog : [];
  const formVisible = canRecord && load.kind === 'ready' && catalog.length > 0;

  function renderRecorded(entry: EntryAnesthesia) {
    return (
      <section aria-labelledby={`${id}-recorded`} className="flex flex-col gap-2">
        <h3 id={`${id}-recorded`} className="text-sm font-medium text-ink">
          {anesthesiaCopy.recordedHeading}
        </h3>
        {entry.records.length === 0 ? (
          <p className="text-sm text-muted">{anesthesiaCopy.noneRecorded}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border">
              {entry.records.map((r) => (
                <li key={r.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{r.anestheticName}</span>
                  <span className="tabular-nums text-ink">
                    {anesthesiaCopy.line(r)} · {TECHNIQUE_LABELS[r.technique]}
                    {r.site ? ` · ${r.site}` : ''}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {sedeTime(r.administeredAt, clock)}
                    {r.lot ? ` · Lote ${r.lot}` : ''}
                  </span>
                  {r.overrideReason ? (
                    <span className="text-xs text-muted">
                      {anesthesiaCopy.override} {r.overrideReason}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {!formVisible ? <AnesthesiaDoseBar summary={entry.summary} id={`${id}-saved-bar`} /> : null}
          </>
        )}
      </section>
    );
  }

  function renderBody() {
    if (load.kind === 'loading') {
      return (
        <div role="status" aria-label={anesthesiaCopy.loading} className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }
    if (load.kind === 'error') {
      return (
        <SectionError
          title={anesthesiaCopy.loadError}
          description={load.message}
          onRetry={reload}
        />
      );
    }
    return (
      <>
        {renderRecorded(load.entry)}
        {canRecord && catalog.length === 0 ? (
          <EmptyState
            title={anesthesiaCopy.emptyCatalog}
            description={canManageCatalog ? anesthesiaCopy.emptyCatalogAdmin : anesthesiaCopy.emptyCatalogOther}
            action={
              canManageCatalog ? (
                <Button type="button" onClick={() => void handleLoadSamples()} disabled={loadingSamples}>
                  {anesthesiaCopy.loadSamples}
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {formVisible ? renderForm() : null}
        <p className="text-xs text-muted">{anesthesiaCopy.disclaimer}</p>
      </>
    );
  }

  function fieldProps(key: string, fieldId: string) {
    return {
      'aria-invalid': errors[key] ? true : undefined,
      'aria-describedby': errors[key] ? fieldErrorId(fieldId) : undefined,
    } as const;
  }

  function renderForm() {
    return (
      <fieldset className="flex flex-col gap-3 border-t border-hairline pt-3">
        <legend className="sr-only">{anesthesiaCopy.newHeading}</legend>
        <h3 className="text-sm font-medium text-ink">{anesthesiaCopy.newHeading}</h3>
        <FormField htmlFor={`${id}-anesthetic`} label={anesthesiaCopy.anesthetic} error={errors.anesthetic}>
          <select
            id={`${id}-anesthetic`}
            value={anestheticId}
            onChange={(e) => {
              setAnestheticId(e.target.value);
              setConfirmed(false);
            }}
            className={`${fieldClass} h-11 sm:h-10`}
            {...fieldProps('anesthetic', `${id}-anesthetic`)}
          >
            <option value="">{anesthesiaCopy.chooseAnesthetic}</option>
            {catalog.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatDecimal(p.mlPerCarpule)} ml
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            htmlFor={`${id}-carpules`}
            label={anesthesiaCopy.carpules}
            hint={anesthesiaCopy.carpulesHint}
            error={errors.carpules}
          >
            <Input
              id={`${id}-carpules`}
              inputMode="decimal"
              autoComplete="off"
              className="h-11 tabular-nums sm:h-10"
              value={carpulesText}
              onChange={(e) => setCarpulesText(e.target.value)}
              {...fieldProps('carpules', `${id}-carpules`)}
            />
          </FormField>
          <FormField htmlFor={`${id}-technique`} label={anesthesiaCopy.technique}>
            <select
              id={`${id}-technique`}
              value={technique}
              onChange={(e) => setTechnique(e.target.value as AnesthesiaTechnique)}
              className={`${fieldClass} h-11 sm:h-10`}
            >
              {TECHNIQUES.map((t) => (
                <option key={t} value={t}>
                  {TECHNIQUE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField htmlFor={`${id}-site`} label={anesthesiaCopy.site}>
            <Input
              id={`${id}-site`}
              maxLength={120}
              className="h-11 sm:h-10"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={`${id}-lot`} label={anesthesiaCopy.lot}>
            <Input
              id={`${id}-lot`}
              maxLength={60}
              className="h-11 sm:h-10"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
            />
          </FormField>
          {clock ? (
            <FormField htmlFor={`${id}-time`} label={anesthesiaCopy.time}>
              <Input
                id={`${id}-time`}
                type="time"
                className="h-11 tabular-nums sm:h-10"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </FormField>
          ) : null}
          {showWeight ? (
            <FormField
              htmlFor={`${id}-weight`}
              label={anesthesiaCopy.weight}
              hint={weightRequired ? anesthesiaCopy.weightHintRequired : anesthesiaCopy.weightHintMissing}
              error={errors.weight}
            >
              <Input
                id={`${id}-weight`}
                inputMode="decimal"
                autoComplete="off"
                aria-required={weightRequired ? 'true' : undefined}
                className="h-11 tabular-nums sm:h-10"
                value={weightText}
                onChange={(e) => setWeightText(e.target.value)}
                {...fieldProps('weight', `${id}-weight`)}
              />
            </FormField>
          ) : null}
        </div>
        {renderPreview()}
      </fieldset>
    );
  }

  function renderPreview() {
    if (check.kind === 'loading') {
      return (
        <p role="status" className="text-sm text-muted">
          {anesthesiaCopy.checking}
        </p>
      );
    }
    if (check.kind === 'error') {
      return (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <span>{anesthesiaCopy.checkError}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setCheckKey((k) => k + 1)}>
            Reintentar
          </Button>
        </div>
      );
    }
    if (check.kind === 'idle') {
      return entryState && entryState.records.length > 0 ? (
        <AnesthesiaDoseBar summary={entryState.summary} id={`${id}-bar`} />
      ) : null;
    }
    const { summary } = check.check;
    return (
      <div className="flex flex-col gap-3">
        <AnesthesiaDoseBar summary={summary} id={`${id}-bar`} />
        <AlertLines alerts={summary.alerts} />
        {blocking ? (
          <div className="flex flex-col gap-3 rounded-lg border border-danger/40 p-3">
            <p className="text-sm font-medium text-ink">{anesthesiaCopy.blockingTitle}</p>
            <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                aria-invalid={errors.confirm ? true : undefined}
              />
              <span>{anesthesiaCopy.confirm}</span>
            </label>
            {errors.confirm ? (
              <p role="alert" className="text-sm text-danger">
                {errors.confirm}
              </p>
            ) : null}
            <FormField
              htmlFor={`${id}-reason`}
              label={anesthesiaCopy.reasonLabel}
              hint={anesthesiaCopy.reasonHint}
              error={errors.reason}
            >
              <textarea
                id={`${id}-reason`}
                rows={2}
                maxLength={OVERRIDE_REASON_MAX}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={cn(fieldClass, 'h-auto')}
                {...fieldProps('reason', `${id}-reason`)}
              />
            </FormField>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={anesthesiaCopy.title}
      description={anesthesiaCopy.description(entryDateLabel)}
      onSubmit={handleSubmit}
      submitLabel={anesthesiaCopy.submit}
      cancelLabel={formVisible ? undefined : anesthesiaCopy.close}
      hideSubmit={!formVisible}
      submitting={submitting}
      submitDisabled={check.kind === 'loading'}
      error={formError}
    >
      {renderBody()}
    </FormModal>
  );
}
