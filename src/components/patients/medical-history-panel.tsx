'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listStaff, type StaffMember } from '@/lib/staff/staff-api';
import { formatDateTime } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { ClinicalHistoryFields } from '@/components/clinical/clinical-history-fields';
import { ConditionSummaryText } from '@/components/clinical/condition-summary';
import {
  getMedicalHistory,
  saveMedicalHistory,
  type MedicalHistory,
} from '@/lib/patients/clinical-api';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';
import { DescriptionItem } from '@/components/ui/description-list';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando anamnesis…',
  empty: 'Aún no hay anamnesis registrada para este paciente.',
  emptyHint: 'Completa el formulario y guárdalo para registrar la primera anamnesis del paciente.',
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
  allergiesCountLabel: 'Alergias registradas',
  conditionsLabel: 'Condiciones',
  medicationsCountLabel: 'Medicamentos registrados',
  familyHistoryLabel: 'Antecedentes familiares',
  notesLabel: 'Notas',
  formTitle: 'Guardar nueva versión',
  // First visit (no anamnesis yet): "Guardar nueva versión" reads as a no-op
  // when there's nothing to version, so the create affordance is labelled
  // explicitly instead.
  createTitle: 'Registrar anamnesis',
  submit: 'Guardar',
  // Sin "Intenta de nuevo." — alimenta AsyncSection -> SectionError, que trae su propio botón.
  genericLoadError: 'No pudimos cargar la anamnesis.',
  genericSaveError: 'No pudimos guardar la anamnesis. Intenta de nuevo.',
};

interface MedicalHistoryPanelProps {
  token: string;
  patientId: string;
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
    embarazo: history.safetyFlags.embarazo,
    semanasEmbarazo: history.safetyFlags.semanasEmbarazo,
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

export function MedicalHistoryPanel({ token, patientId, onSaved }: MedicalHistoryPanelProps) {
  const [latest, setLatest] = useState<MedicalHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState<ClinicalHistoryValue>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  return (
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
      <div className="flex flex-col gap-6">
        {latest ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex flex-col gap-0.5">
              <p className="text-sm font-medium text-muted">
                {copy.versionLabel(latest.version)}
                <span className="ml-2 font-normal">{versionProvenance(latest)}</span>
              </p>
              <p className="t-label text-muted">{copy.appendOnlyNote}</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <DescriptionItem label={copy.allergiesCountLabel} numeric>{latest.allergies.length}</DescriptionItem>
              <DescriptionItem label={copy.conditionsLabel}>
                <ConditionSummaryText conditions={latest.conditions} />
              </DescriptionItem>
              <DescriptionItem label={copy.medicationsCountLabel} numeric>{latest.medications.length}</DescriptionItem>
              <DescriptionItem label={copy.familyHistoryLabel}>{latest.familyHistory ?? copy.fieldFallback}</DescriptionItem>
              <DescriptionItem label={copy.notesLabel}>{latest.notes ?? copy.fieldFallback}</DescriptionItem>
            </dl>
          </div>
        ) : (
          <div
            role="status"
            className="rounded-lg border border-dashed border-border bg-surface p-4"
          >
            <p className="text-sm font-medium text-ink">{copy.empty}</p>
            <p className="mt-1 text-sm text-muted">{copy.emptyHint}</p>
          </div>
        )}

        {/*
          AsyncSection swaps this whole subtree for the error+retry UI while
          loadError is set — the form (which would create a new version from
          only what's edited, silently wiping the rest) never renders
          without a trustworthy baseline.
        */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-ink">
            {latest ? copy.formTitle : copy.createTitle}
          </h3>

          <ClinicalHistoryFields value={value} onChange={setValue} />

          {saveError && <InlineError variant="summary">{saveError}</InlineError>}

          <Button type="submit" loading={submitting} disabled={isUnchanged} className="self-start">
            {copy.submit}
          </Button>
        </form>
      </div>
    </AsyncSection>
  );
}
