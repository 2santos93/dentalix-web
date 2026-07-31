'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  getMedicalHistory,
  saveMedicalHistory,
  type MedicalHistory,
  type SaveMedicalHistoryInput,
} from '@/lib/patients/clinical-api';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando anamnesis…',
  empty: 'Aún no hay anamnesis registrada para este paciente.',
  emptyHint: 'Completa el formulario y guárdalo para registrar la primera anamnesis del paciente.',
  versionLabel: (v: number) => `Versión ${v}`,
  fieldFallback: '—',
  allergiesLabel: 'Alergias',
  chronicConditionsLabel: 'Condiciones crónicas',
  currentMedicationsLabel: 'Medicamentos actuales',
  habitsLabel: 'Hábitos',
  medicalAlertsLabel: 'Alertas médicas',
  notesLabel: 'Notas',
  formTitle: 'Guardar nueva versión',
  submit: 'Guardar nueva versión',
  // First visit (no anamnesis yet): "Guardar nueva versión" reads as a no-op
  // when there's nothing to version, so the create affordance is labelled
  // explicitly instead.
  createTitle: 'Registrar anamnesis',
  createSubmit: 'Registrar anamnesis',
  submitting: 'Guardando…',
  genericLoadError: 'No pudimos cargar la anamnesis. Intenta de nuevo.',
  genericSaveError: 'No pudimos guardar la anamnesis. Intenta de nuevo.',
  retry: 'Reintentar',
};

interface MedicalHistoryPanelProps {
  token: string;
  patientId: string;
}

const emptyForm = {
  allergies: '',
  chronicConditions: '',
  currentMedications: '',
  habits: '',
  medicalAlerts: '',
  notes: '',
};

/**
 * `saveMedicalHistory` creates a brand-new version from ONLY the fields
 * submitted in the form — any field left out (because the form was empty)
 * comes back `null` on the new version, silently wiping previously recorded
 * data (allergies, chronic conditions, …). Carrying the latest version's
 * values into the form — on load AND right after a successful save —
 * means an untouched field still gets re-submitted with its prior value
 * instead of being dropped.
 */
function formFromHistory(history: MedicalHistory | null): typeof emptyForm {
  if (!history) return emptyForm;
  return {
    allergies: history.allergies ?? '',
    chronicConditions: history.chronicConditions ?? '',
    currentMedications: history.currentMedications ?? '',
    habits: history.habits ?? '',
    medicalAlerts: history.medicalAlerts ?? '',
    notes: history.notes ?? '',
  };
}

export function MedicalHistoryPanel({ token, patientId }: MedicalHistoryPanelProps) {
  const [latest, setLatest] = useState<MedicalHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped by the retry action to re-run the load effect below.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getMedicalHistory(token, patientId);
        if (cancelled) return;
        setLatest(data);
        // Set once, on load — carries the latest version's values forward
        // so an untouched field isn't silently wiped on next save.
        setForm(formFromHistory(data));
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
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
    // Defense in depth: the form isn't rendered while loadError is set (see
    // below), but block here too in case this ever gets called some other
    // way. Without a trustworthy baseline from the latest version, saving
    // would create a new version from only the submitted fields and
    // silently null out everything else (allergies, medicalAlerts, …).
    if (loadError) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      const input: SaveMedicalHistoryInput = {
        ...(form.allergies.trim() ? { allergies: form.allergies.trim() } : {}),
        ...(form.chronicConditions.trim()
          ? { chronicConditions: form.chronicConditions.trim() }
          : {}),
        ...(form.currentMedications.trim()
          ? { currentMedications: form.currentMedications.trim() }
          : {}),
        ...(form.habits.trim() ? { habits: form.habits.trim() } : {}),
        ...(form.medicalAlerts.trim() ? { medicalAlerts: form.medicalAlerts.trim() } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      };
      const saved = await saveMedicalHistory(token, patientId, input);
      setLatest(saved);
      // Re-sync the form from the just-saved version (not emptyForm) so the
      // next edit still carries forward whatever wasn't just changed.
      setForm(formFromHistory(saved));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : copy.genericSaveError);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {loadError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink"
          >
            {copy.retry}
          </button>
        </div>
      ) : latest ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-muted">{copy.versionLabel(latest.version)}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted">{copy.allergiesLabel}</dt>
              <dd className="text-ink">{latest.allergies ?? copy.fieldFallback}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">{copy.chronicConditionsLabel}</dt>
              <dd className="text-ink">{latest.chronicConditions ?? copy.fieldFallback}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">{copy.currentMedicationsLabel}</dt>
              <dd className="text-ink">{latest.currentMedications ?? copy.fieldFallback}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">{copy.habitsLabel}</dt>
              <dd className="text-ink">{latest.habits ?? copy.fieldFallback}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">{copy.medicalAlertsLabel}</dt>
              <dd className="text-ink">{latest.medicalAlerts ?? copy.fieldFallback}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">{copy.notesLabel}</dt>
              <dd className="text-ink">{latest.notes ?? copy.fieldFallback}</dd>
            </div>
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
        While loadError is set we don't have a trustworthy baseline (the
        latest version failed to fetch) — rendering the form would let the
        user "save a new version" that silently wipes every field it didn't
        resubmit. No form at all until a load succeeds (or comes back
        genuinely empty via the retry above).
      */}
      {!loadError && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-ink">
            {latest ? copy.formTitle : copy.createTitle}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="mh-allergies" className="text-sm font-medium text-ink">
                {copy.allergiesLabel}
              </label>
              <textarea
                id="mh-allergies"
                name="allergies"
                rows={2}
                value={form.allergies}
                onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
                className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="mh-chronic-conditions" className="text-sm font-medium text-ink">
                {copy.chronicConditionsLabel}
              </label>
              <textarea
                id="mh-chronic-conditions"
                name="chronicConditions"
                rows={2}
                value={form.chronicConditions}
                onChange={(e) => setForm((f) => ({ ...f, chronicConditions: e.target.value }))}
                className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="mh-current-medications" className="text-sm font-medium text-ink">
                {copy.currentMedicationsLabel}
              </label>
              <textarea
                id="mh-current-medications"
                name="currentMedications"
                rows={2}
                value={form.currentMedications}
                onChange={(e) => setForm((f) => ({ ...f, currentMedications: e.target.value }))}
                className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="mh-habits" className="text-sm font-medium text-ink">
                {copy.habitsLabel}
              </label>
              <textarea
                id="mh-habits"
                name="habits"
                rows={2}
                value={form.habits}
                onChange={(e) => setForm((f) => ({ ...f, habits: e.target.value }))}
                className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mh-medical-alerts" className="text-sm font-medium text-ink">
              {copy.medicalAlertsLabel}
            </label>
            <textarea
              id="mh-medical-alerts"
              name="medicalAlerts"
              rows={2}
              value={form.medicalAlerts}
              onChange={(e) => setForm((f) => ({ ...f, medicalAlerts: e.target.value }))}
              className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mh-notes" className="text-sm font-medium text-ink">
              {copy.notesLabel}
            </label>
            <textarea
              id="mh-notes"
              name="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
            />
          </div>

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
            {submitting ? copy.submitting : latest ? copy.submit : copy.createSubmit}
          </button>
        </form>
      )}
    </div>
  );
}
