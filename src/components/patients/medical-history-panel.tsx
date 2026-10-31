'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listStaff, type StaffMember } from '@/lib/staff/staff-api';
import { formatDateTime } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DescriptionList, DescriptionItem } from '@/components/ui/description-list';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { ClinicalHistoryFields } from '@/components/clinical/clinical-history-fields';
import { ConditionSummaryText } from '@/components/clinical/condition-summary';
import {
  getMedicalHistory,
  saveMedicalHistory,
  type MedicalHistory,
} from '@/lib/patients/clinical-api';
import {
  ALLERGY_SEVERITY_LABELS,
  type ClinicalHistoryValue,
  type Habits,
} from '@/lib/clinical/clinical-types';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando anamnesis…',
  heading: 'Anamnesis',
  // Sin versión: el aviso «Sin anamnesis registrada» de arriba ya lo dice;
  // aquí solo queda la acción, con una línea de qué hace.
  emptyDescription: 'Registra la primera versión con lo que se le preguntó al paciente.',
  versionLabel: (v: number) => `Versión ${v}`,
  // El número solo no significa nada si no se puede alcanzar lo que cuenta.
  // Mientras el API no exponga la cadena de versiones (hoy `GET` devuelve solo
  // la última), se declara con lo que SÍ llega en la respuesta: cuándo se
  // registró y quién la firmó.
  versionRecordedBy: (author: string, when: string) => `Registrada el ${when} por ${author}`,
  versionRecordedAt: (when: string) => `Registrada el ${when}`,
  // La promesa del modelo, dicha en voz alta: sin esta línea el contador
  // afirma una inmutabilidad que la pantalla nunca explica.
  appendOnlyNote:
    'Cada corrección crea una versión nueva; las anteriores se conservan y no se sobrescriben.',
  unknownAuthor: 'autor no registrado',
  fieldFallback: '—',
  allergiesLabel: 'Alergias',
  noAllergies: 'Ninguna registrada',
  conditionsLabel: 'Condiciones',
  positiveConditions: (labels: string) => `Sí: ${labels}`,
  medicationsLabel: 'Medicamentos',
  noMedications: 'Ninguno registrado',
  pregnancyLabel: 'Embarazo',
  pregnancyYes: (weeks?: number) => (weeks !== undefined ? `Sí · ${weeks} semanas` : 'Sí'),
  habitsLabel: 'Hábitos',
  habitsNone: 'Sin hábitos marcados',
  familyHistoryLabel: 'Antecedentes familiares',
  notesLabel: 'Notas',
  // Con versión previa la acción es «Actualizar» (crea una versión nueva: no
  // se edita la vigente); sin ninguna, «Registrar» — «nueva versión» de nada
  // no significa nada.
  update: 'Actualizar anamnesis',
  create: 'Registrar anamnesis',
  formTitle: 'Nueva versión de la anamnesis',
  createTitle: 'Primera anamnesis',
  formHint: 'Parte de la versión vigente. Al guardar se crea una versión nueva; la anterior se conserva.',
  submit: 'Guardar nueva versión',
  submitFirst: 'Guardar anamnesis',
  cancel: 'Cancelar',
  discardTitle: '¿Descartar los cambios?',
  discardBody: 'Lo que escribiste en esta versión se perderá. La anamnesis vigente no cambia.',
  discardConfirm: 'Descartar',
  keepEditing: 'Seguir editando',
  // Sin "Intenta de nuevo." — alimenta AsyncSection -> SectionError, que trae su propio botón.
  genericLoadError: 'No pudimos cargar la anamnesis.',
  genericSaveError: 'No pudimos guardar la anamnesis. Intenta de nuevo.',
};

interface MedicalHistoryPanelProps {
  token: string;
  patientId: string;
  /** Id del título «Anamnesis» (destino de «Registrar en Historia clínica»). */
  headingId?: string;
  /** DX-247: una versión nueva cambia las banderas de la cabecera: se releen. */
  onSaved?: () => void;
}

/**
 * `saveMedicalHistory` creates a brand-new version from ONLY the fields
 * submitted — any field left out comes back `null`/empty on the new
 * version, silently wiping previously recorded data (allergies, conditions,
 * …). Carrying the latest version's values into `value` — on load AND right
 * after a successful save — means an untouched section still gets
 * re-submitted with its prior contents instead of being dropped.
 *
 * Deliberately excludes `hasCriticalAlert`/`id`/`tenantId`/`patientId`/
 * `version`/`createdById`/`createdAt` — those are server-derived or identity
 * fields, not editable input. `safetyFlags` itself is also excluded (it's
 * derived server-side from `conditions`/`medications`, not editable), EXCEPT
 * `embarazo`/`semanasEmbarazo` — `ClinicalHistoryFields` reads/writes those
 * as top-level `value` fields (not nested under `safetyFlags`), so they're
 * pulled out of `history.safetyFlags` here to carry the pregnancy flag
 * forward between versions like every other field.
 */
function valueFromHistory(history: MedicalHistory | null): ClinicalHistoryValue {
  if (!history) return {};
  return {
    allergies: history.allergies,
    conditions: history.conditions,
    medications: history.medications,
    habits: history.habits ?? undefined,
    dentalHistory: history.dentalHistory ?? undefined,
    surgeries: history.surgeries,
    vitalSigns: history.vitalSigns ?? undefined,
    // La bandera no distingue «No» de «sin preguntar»: solo un `true` es dato.
    // Un `false` se trae como «Sin responder», nunca como un «No» afirmado.
    embarazo: history.safetyFlags.embarazo ? true : undefined,
    semanasEmbarazo: history.safetyFlags.embarazo ? history.safetyFlags.semanasEmbarazo : undefined,
    familyHistory: history.familyHistory ?? undefined,
    notes: history.notes ?? undefined,
  };
}

/**
 * Structural deep-equality over the plain JSON shapes `ClinicalHistoryValue`
 * is made of (nested objects, arrays, and scalar leaves — no dates/maps/etc).
 * A key that is `undefined` on one side and absent on the other counts as
 * equal, so the carried-forward baseline (which sets optional sections to
 * `undefined`) compares clean against an untouched form.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set(
    [...Object.keys(ao), ...Object.keys(bo)].filter(
      (k) => ao[k] !== undefined || bo[k] !== undefined,
    ),
  );
  for (const k of keys) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Anti-duplicate guard (ported from the free-text panel): the form is
 * re-seeded from the latest saved version on load AND after every save, so
 * without this an unchanged re-submit would create an identical duplicate
 * version. `valueFromHistory(null)` is `{}`, so an untouched first-visit form
 * is also treated as a no-op (no all-empty version created). Drives both the
 * save button's disabled state and the short-circuit in `handleSubmit`.
 */
function valueEqualsHistory(value: ClinicalHistoryValue, history: MedicalHistory | null): boolean {
  return deepEqual(value, valueFromHistory(history));
}

/** «Fuma · Bruxismo»: solo lo contestado «Sí»; nada se infiere de lo ausente. */
function habitsYes(habits: Habits | null | undefined): string[] {
  if (!habits) return [];
  const out: string[] = [];
  if (habits.tabaquismo?.activo) out.push('Fuma');
  if (habits.alcohol?.activo) out.push('Consume alcohol');
  if (habits.sustancias) out.push('Sustancias psicoactivas');
  if (habits.bruxismo) out.push('Bruxismo');
  return out;
}

export function MedicalHistoryPanel({ token, patientId, headingId, onSaved }: MedicalHistoryPanelProps) {
  const [latest, setLatest] = useState<MedicalHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState<ClinicalHistoryValue>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // El formulario (largo) va detrás de una acción explícita: la pestaña abre
  // con las evoluciones y el resumen de la versión vigente.
  const [editing, setEditing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // Bumped by the retry action to re-run the load effect below.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Fail soft y aparte: sin la lista de personal la versión sigue diciendo
    // CUÁNDO se registró, que es la mitad que nunca se puede perder.
    listStaff(token)
      .then((data) => {
        if (!cancelled) setStaff(data ?? []);
      })
      .catch(() => {
        /* fail soft — cae a «autor no registrado» */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.userId, member.fullName])),
    [staff],
  );

  /** «Registrada el 8 ago 2026 14:32 por Dra. Ríos». */
  function versionProvenance(history: MedicalHistory): string {
    const when = formatDateTime(history.createdAt);
    const author = history.createdById ? staffById.get(history.createdById) : null;
    return author ? copy.versionRecordedBy(author, when) : copy.versionRecordedAt(when);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getMedicalHistory(token, patientId);
        if (cancelled) return;
        setLatest(data);
        // Set once, on load — carries the latest version's values forward
        // so an untouched section isn't silently wiped on next save.
        setValue(valueFromHistory(data));
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, copy.genericLoadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  function handleRetry() {
    setReloadKey((k) => k + 1);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // No-op when nothing changed since the latest saved version — saving would
    // otherwise create an identical duplicate version (the form is re-seeded
    // from the saved version after each save, below). Mirrors the button's
    // disabled state; kept here as defense in depth for a programmatic submit.
    if (valueEqualsHistory(value, latest)) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      const saved = await saveMedicalHistory(token, patientId, value);
      setLatest(saved);
      // Re-sync from the just-saved version (not an empty value) so the
      // next edit still carries forward whatever wasn't just changed.
      setValue(valueFromHistory(saved));
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.genericSaveError));
    } finally {
      setSubmitting(false);
    }
  }

  // Drives the save button's disabled state (mirrored by the handler's
  // short-circuit above): true when the form matches the latest saved version,
  // so an unchanged save can't produce a duplicate version.
  const isUnchanged = valueEqualsHistory(value, latest);

  function startEditing() {
    setValue(valueFromHistory(latest));
    setSaveError(null);
    setEditing(true);
  }

  function stopEditing() {
    setValue(valueFromHistory(latest));
    setSaveError(null);
    setConfirmDiscard(false);
    setEditing(false);
    document.getElementById(headingId ?? '')?.focus();
  }

  function handleCancel() {
    if (isUnchanged) stopEditing();
    else setConfirmDiscard(true);
  }

  const habitsMarked = latest ? habitsYes(latest.habits) : [];
  const positives = latest ? latest.conditions.filter((c) => c.estado === 'SI').map((c) => c.etiqueta) : [];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      {/* Cabecera de sección (mismo patrón que SectionHeader): el título es
          enfocable porque «Registrar en Historia clínica» aterriza aquí. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={headingId}
            tabIndex={-1}
            className="t-title scroll-mt-16 text-ink focus-visible:outline-none"
          >
            {copy.heading}
          </h2>
          {!loading && !loadError && !editing ? (
            <p className="text-sm text-muted">
              {latest ? copy.appendOnlyNote : copy.emptyDescription}
            </p>
          ) : null}
        </div>
        {!loading && !loadError && !editing ? (
          <Button type="button" variant="secondary" onClick={startEditing} className="w-full sm:w-auto">
            {latest ? copy.update : copy.create}
          </Button>
        ) : null}
      </div>

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={handleRetry}
        skeleton={
          <p role="status" className="text-sm text-muted">
            {copy.loading}
          </p>
        }
      >
        {latest && !editing ? (
          <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
            <p className="t-caption text-muted">
              <span className="font-medium text-ink">{copy.versionLabel(latest.version)}</span>
              {' · '}
              <span className="tnum">{versionProvenance(latest)}</span>
            </p>
            <DescriptionList columns={2}>
              <DescriptionItem label={copy.allergiesLabel}>
                {latest.allergies.length > 0
                  ? latest.allergies
                      .map((a) => `${a.alergeno} (${ALLERGY_SEVERITY_LABELS[a.severidad].toLowerCase()})`)
                      .join(' · ')
                  : <span className="text-muted">{copy.noAllergies}</span>}
              </DescriptionItem>
              <DescriptionItem label={copy.conditionsLabel}>
                <ConditionSummaryText conditions={latest.conditions} />
                {positives.length > 0 ? (
                  <span className="mt-0.5 block">{copy.positiveConditions(positives.join(' · '))}</span>
                ) : null}
              </DescriptionItem>
              <DescriptionItem label={copy.medicationsLabel}>
                {latest.medications.length > 0
                  ? latest.medications.map((m) => [m.nombre, m.dosis].filter(Boolean).join(' ')).join(' · ')
                  : <span className="text-muted">{copy.noMedications}</span>}
              </DescriptionItem>
              {latest.safetyFlags.embarazo ? (
                <DescriptionItem label={copy.pregnancyLabel}>
                  {copy.pregnancyYes(latest.safetyFlags.semanasEmbarazo)}
                </DescriptionItem>
              ) : null}
              <DescriptionItem label={copy.habitsLabel}>
                {habitsMarked.length > 0
                  ? habitsMarked.join(' · ')
                  : <span className="text-muted">{copy.habitsNone}</span>}
              </DescriptionItem>
              <DescriptionItem label={copy.familyHistoryLabel}>{latest.familyHistory ?? copy.fieldFallback}</DescriptionItem>
              <DescriptionItem label={copy.notesLabel} wide>{latest.notes ?? copy.fieldFallback}</DescriptionItem>
            </DescriptionList>
          </div>
        ) : null}

        {/*
          AsyncSection swaps this whole subtree for the error+retry UI while
          loadError is set — the form (which would create a new version from
          only what's edited, silently wiping the rest) never renders
          without a trustworthy baseline.
        */}
        {editing ? (
          <form
            onSubmit={handleSubmit}
            aria-labelledby={`${headingId}-form`}
            className="flex flex-col gap-6 border-t border-border-subtle pt-4"
          >
            <div className="flex flex-col gap-1">
              <h3 id={`${headingId}-form`} className="t-title text-ink">
                {latest ? copy.formTitle : copy.createTitle}
              </h3>
              {latest ? <p className="text-sm text-muted">{copy.formHint}</p> : null}
            </div>

            <ClinicalHistoryFields value={value} onChange={setValue} />

            {saveError && <InlineError variant="summary">{saveError}</InlineError>}

            {/* Barra de acción pegajosa: el formulario es largo y el botón no
                puede quedar a varias pantallas de la última respuesta. */}
            <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-canvas px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:flex-row sm:px-0">
              <Button type="button" variant="ghost" onClick={handleCancel} className="w-full sm:w-auto">
                {copy.cancel}
              </Button>
              <Button type="submit" loading={submitting} disabled={isUnchanged} className="w-full sm:w-auto">
                {latest ? copy.submit : copy.submitFirst}
              </Button>
            </div>
          </form>
        ) : null}
      </AsyncSection>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={copy.discardTitle}
        description={copy.discardBody}
        confirmLabel={copy.discardConfirm}
        cancelLabel={copy.keepEditing}
        destructive
        onConfirm={stopEditing}
      />
    </section>
  );
}
