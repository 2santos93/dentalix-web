'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Plus, X, TriangleAlert } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getMedicalHistory,
  saveMedicalHistory,
  type Allergy,
  type AllergySeverity,
  type AllergyType,
  type Condition,
  type ConditionStatus,
  type MedicalHistory,
  type Medication,
  type SaveMedicalHistoryInput,
} from '@/lib/patients/clinical-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando anamnesis…',
  empty: 'Aún no hay anamnesis registrada para este paciente.',
  emptyHint: 'Completa el formulario y guárdalo para registrar la primera anamnesis del paciente.',
  versionLabel: (v: number) => `Versión ${v}`,
  criticalAlert: 'Alertas críticas',
  allergiesLabel: 'Alergias',
  conditionsLabel: 'Condiciones',
  medicationsLabel: 'Medicamentos',
  pregnancyLabel: 'Embarazo',
  weeksLabel: 'Semanas',
  weeksShort: (n: number) => `${n} semanas`,
  familyHistoryLabel: 'Antecedentes familiares',
  notesLabel: 'Notas',
  sectionEmpty: 'Sin registros.',
  fieldFallback: '—',
  addAllergy: 'Agregar alergia',
  addCondition: 'Agregar condición',
  addMedication: 'Agregar medicamento',
  remove: 'Quitar',
  alertFlag: 'Alerta',
  alertTitle: 'Marcar como alerta clínica',
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
  // Field placeholders — the row editors are dense, so labels live in the
  // column header and the input carries the hint.
  allergenPlaceholder: 'Alérgeno (ej. Penicilina)',
  reactionPlaceholder: 'Reacción (opcional)',
  conditionPlaceholder: 'Condición (ej. Hipertensión)',
  conditionNotePlaceholder: 'Nota (opcional)',
  medicationPlaceholder: 'Medicamento (ej. Losartán)',
  dosePlaceholder: 'Dosis',
  frequencyPlaceholder: 'Frecuencia',
  reasonPlaceholder: 'Motivo',
  familyHistoryPlaceholder: 'Diabetes, cardiopatías, cáncer…',
};

const ALLERGY_TYPES: { value: AllergyType; label: string }[] = [
  { value: 'MEDICAMENTO', label: 'Medicamento' },
  { value: 'MATERIAL', label: 'Material' },
  { value: 'ALIMENTO', label: 'Alimento' },
  { value: 'AMBIENTAL', label: 'Ambiental' },
];

const ALLERGY_SEVERITIES: { value: AllergySeverity; label: string }[] = [
  { value: 'LEVE', label: 'Leve' },
  { value: 'MODERADA', label: 'Moderada' },
  { value: 'ANAFILAXIA', label: 'Anafilaxia' },
];

const CONDITION_STATUSES: { value: ConditionStatus; label: string }[] = [
  { value: 'SI', label: 'Sí' },
  { value: 'NO', label: 'No' },
  { value: 'DESCONOCE', label: 'Desconoce' },
];

const TYPE_LABEL: Record<AllergyType, string> = {
  MEDICAMENTO: 'Medicamento',
  MATERIAL: 'Material',
  ALIMENTO: 'Alimento',
  AMBIENTAL: 'Ambiental',
};
const SEVERITY_LABEL: Record<AllergySeverity, string> = {
  LEVE: 'Leve',
  MODERADA: 'Moderada',
  ANAFILAXIA: 'Anafilaxia',
};
const STATUS_LABEL: Record<ConditionStatus, string> = {
  SI: 'Sí',
  NO: 'No',
  DESCONOCE: 'Desconoce',
};

// Native <select> styled to match the Input atom (kept native for a11y/tests) —
// same class/rationale as staff-view.tsx / catalog-view.tsx.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface MedicalHistoryPanelProps {
  token: string;
  patientId: string;
}

interface FormState {
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  embarazo: boolean;
  /** Kept as text so the input can be cleared; parsed on submit. */
  semanasEmbarazo: string;
  familyHistory: string;
  notes: string;
}

const emptyForm: FormState = {
  allergies: [],
  conditions: [],
  medications: [],
  embarazo: false,
  semanasEmbarazo: '',
  familyHistory: '',
  notes: '',
};

/**
 * `saveMedicalHistory` appends a brand-new version built from ONLY what the
 * form submits — anything omitted comes back empty on the new version,
 * silently wiping previously recorded clinical data. Seeding the form from the
 * latest version (on load AND right after each save) means untouched entries
 * are re-submitted as they were instead of being dropped.
 */
function formFromHistory(history: MedicalHistory | null): FormState {
  if (!history) return emptyForm;
  return {
    allergies: history.allergies.map((a) => ({ ...a })),
    conditions: history.conditions.map((c) => ({ ...c })),
    medications: history.medications.map((m) => ({ ...m })),
    embarazo: history.safetyFlags.embarazo,
    semanasEmbarazo:
      history.safetyFlags.semanasEmbarazo == null
        ? ''
        : String(history.safetyFlags.semanasEmbarazo),
    familyHistory: history.familyHistory ?? '',
    notes: history.notes ?? '',
  };
}

/** `codigo` is required by the API and normally comes from a standard list; with no such catalog yet, derive a stable slug from the label (accent-free, upper snake case). */
function codeFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Drops abandoned rows (the ones whose required field was never filled) and trims the rest — what actually gets sent, and the basis of the no-op compare. */
function normalize(form: FormState) {
  const text = (v?: string) => {
    const t = (v ?? '').trim();
    return t ? t : undefined;
  };
  return {
    allergies: form.allergies
      .filter((a) => a.alergeno.trim())
      .map((a) => ({
        alergeno: a.alergeno.trim(),
        tipo: a.tipo,
        severidad: a.severidad,
        esAlerta: a.esAlerta,
        ...(text(a.reaccion) ? { reaccion: text(a.reaccion) } : {}),
      })),
    conditions: form.conditions
      .filter((c) => c.etiqueta.trim())
      .map((c) => ({
        codigo: c.codigo.trim() || codeFromLabel(c.etiqueta),
        etiqueta: c.etiqueta.trim(),
        estado: c.estado,
        esAlerta: c.esAlerta,
        ...(text(c.nota) ? { nota: text(c.nota) } : {}),
      })),
    medications: form.medications
      .filter((m) => m.nombre.trim())
      .map((m) => ({
        nombre: m.nombre.trim(),
        esAlerta: m.esAlerta,
        ...(text(m.dosis) ? { dosis: text(m.dosis) } : {}),
        ...(text(m.frecuencia) ? { frecuencia: text(m.frecuencia) } : {}),
        ...(text(m.motivo) ? { motivo: text(m.motivo) } : {}),
      })),
    embarazo: form.embarazo,
    semanasEmbarazo:
      form.embarazo && form.semanasEmbarazo.trim()
        ? Number(form.semanasEmbarazo)
        : undefined,
    familyHistory: text(form.familyHistory),
    notes: text(form.notes),
  };
}

/**
 * Compares the normalized form against the latest saved version. The form is
 * re-seeded from the saved version after every save, so without this an
 * unchanged re-submit would append an identical duplicate version. Normalizing
 * both sides means a whitespace-only edit (or an empty row left behind) counts
 * as unchanged, and an untouched first-visit form is a no-op too.
 */
function formEqualsHistory(form: FormState, history: MedicalHistory | null): boolean {
  return JSON.stringify(normalize(form)) === JSON.stringify(normalize(formFromHistory(history)));
}

/** Read-only "⚠" marker for an entry the clinician flagged as an alert. */
function AlertMark() {
  return (
    <Badge variant="danger" className="gap-1">
      <TriangleAlert className="size-3" aria-hidden />
      {copy.alertFlag}
    </Badge>
  );
}

function SummarySection({
  title,
  isEmpty,
  children,
}: {
  title: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-muted">{title}</p>
      {isEmpty ? (
        <p className="text-sm text-muted">{copy.sectionEmpty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">{children}</ul>
      )}
    </div>
  );
}

/** One editable row: the fields plus the alert toggle and the remove button. */
function RowShell({
  children,
  onRemove,
  removeLabel,
  alertChecked,
  onAlertChange,
  alertId,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  removeLabel: string;
  alertChecked: boolean;
  onAlertChange: (checked: boolean) => void;
  alertId: string;
}) {
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="grid flex-1 gap-2 sm:grid-cols-2">{children}</div>
        <div className="flex items-center gap-3 sm:pt-2">
          <label htmlFor={alertId} className="flex items-center gap-1.5 text-xs text-muted">
            <input
              id={alertId}
              type="checkbox"
              checked={alertChecked}
              onChange={(e) => onAlertChange(e.target.checked)}
              className="size-4 accent-[var(--color-danger)]"
            />
            {copy.alertFlag}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={removeLabel}
            onClick={onRemove}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

export function MedicalHistoryPanel({ token, patientId }: MedicalHistoryPanelProps) {
  const [latest, setLatest] = useState<MedicalHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
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
        // Set once, on load — carries the latest version forward so untouched
        // entries aren't silently wiped on the next save.
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

  function patchAllergy(index: number, patch: Partial<Allergy>) {
    setForm((f) => ({
      ...f,
      allergies: f.allergies.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  }
  function patchCondition(index: number, patch: Partial<Condition>) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }
  function patchMedication(index: number, patch: Partial<Medication>) {
    setForm((f) => ({
      ...f,
      medications: f.medications.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Defense in depth: the form isn't rendered while loadError is set (see
    // below), but block here too in case this ever gets called some other way.
    // Without a trustworthy baseline from the latest version, saving would
    // append a version built from only the submitted fields and silently drop
    // everything else.
    if (loadError) return;
    // No-op when nothing changed since the latest saved version — saving would
    // otherwise append an identical duplicate version.
    if (formEqualsHistory(form, latest)) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      const n = normalize(form);
      const input: SaveMedicalHistoryInput = {
        allergies: n.allergies,
        conditions: n.conditions,
        medications: n.medications,
        embarazo: n.embarazo,
        ...(n.semanasEmbarazo !== undefined ? { semanasEmbarazo: n.semanasEmbarazo } : {}),
        ...(n.familyHistory ? { familyHistory: n.familyHistory } : {}),
        ...(n.notes ? { notes: n.notes } : {}),
        // Sections this form doesn't edit yet (hábitos, historia dental,
        // cirugías, signos vitales) travel with the new version untouched —
        // omitting them would wipe them, since each save is a full snapshot.
        ...(latest?.habits ? { habits: latest.habits } : {}),
        ...(latest?.dentalHistory ? { dentalHistory: latest.dentalHistory } : {}),
        ...(latest && latest.surgeries.length ? { surgeries: latest.surgeries } : {}),
        ...(latest?.vitalSigns ? { vitalSigns: latest.vitalSigns } : {}),
      };
      const saved = await saveMedicalHistory(token, patientId, input);
      setLatest(saved);
      // Re-seed from the just-saved version (not emptyForm) so the next edit
      // still carries forward whatever wasn't just changed.
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
          <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
            {copy.retry}
          </Button>
        </div>
      ) : latest ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-muted">{copy.versionLabel(latest.version)}</p>
            {latest.hasCriticalAlert && (
              <Badge variant="danger" className="gap-1">
                <TriangleAlert className="size-3" aria-hidden />
                {copy.criticalAlert}
              </Badge>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SummarySection title={copy.allergiesLabel} isEmpty={latest.allergies.length === 0}>
              {latest.allergies.map((a, i) => (
                <li key={`${a.alergeno}-${i}`} className="flex flex-wrap items-center gap-2 text-ink">
                  <span className="font-medium">{a.alergeno}</span>
                  <span className="text-xs text-muted">
                    {TYPE_LABEL[a.tipo]} · {SEVERITY_LABEL[a.severidad]}
                    {a.reaccion ? ` · ${a.reaccion}` : ''}
                  </span>
                  {a.esAlerta && <AlertMark />}
                </li>
              ))}
            </SummarySection>

            <SummarySection title={copy.conditionsLabel} isEmpty={latest.conditions.length === 0}>
              {latest.conditions.map((c, i) => (
                <li key={`${c.codigo}-${i}`} className="flex flex-wrap items-center gap-2 text-ink">
                  <span className="font-medium">{c.etiqueta}</span>
                  <span className="text-xs text-muted">
                    {STATUS_LABEL[c.estado]}
                    {c.nota ? ` · ${c.nota}` : ''}
                  </span>
                  {c.esAlerta && <AlertMark />}
                </li>
              ))}
            </SummarySection>

            <SummarySection title={copy.medicationsLabel} isEmpty={latest.medications.length === 0}>
              {latest.medications.map((m, i) => (
                <li key={`${m.nombre}-${i}`} className="flex flex-wrap items-center gap-2 text-ink">
                  <span className="font-medium">{m.nombre}</span>
                  <span className="text-xs text-muted">
                    {[m.dosis, m.frecuencia, m.motivo].filter(Boolean).join(' · ')}
                  </span>
                  {m.esAlerta && <AlertMark />}
                </li>
              ))}
            </SummarySection>

            <div>
              <p className="text-sm font-medium text-muted">{copy.pregnancyLabel}</p>
              <p className="text-ink">
                {latest.safetyFlags.embarazo
                  ? latest.safetyFlags.semanasEmbarazo != null
                    ? `Sí · ${copy.weeksShort(latest.safetyFlags.semanasEmbarazo)}`
                    : 'Sí'
                  : 'No'}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted">{copy.familyHistoryLabel}</p>
              <p className="text-ink">{latest.familyHistory ?? copy.fieldFallback}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted">{copy.notesLabel}</p>
              <p className="text-ink">{latest.notes ?? copy.fieldFallback}</p>
            </div>
          </div>
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
        While loadError is set we don't have a trustworthy baseline (the latest
        version failed to fetch) — rendering the form would let the user save a
        version that silently drops everything it didn't resubmit. No form at
        all until a load succeeds (or comes back genuinely empty via retry).
      */}
      {!loadError && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <h3 className="text-base font-semibold text-ink">
            {latest ? copy.formTitle : copy.createTitle}
          </h3>

          {/* ── Alergias ─────────────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-ink">{copy.allergiesLabel}</h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    allergies: [
                      ...f.allergies,
                      {
                        alergeno: '',
                        tipo: 'MEDICAMENTO',
                        severidad: 'LEVE',
                        esAlerta: false,
                      },
                    ],
                  }))
                }
              >
                <Plus className="size-4" /> {copy.addAllergy}
              </Button>
            </div>
            <ul className="flex flex-col gap-2">
              {form.allergies.map((a, i) => (
                <RowShell
                  key={i}
                  alertId={`mh-allergy-alert-${i}`}
                  alertChecked={a.esAlerta}
                  onAlertChange={(checked) => patchAllergy(i, { esAlerta: checked })}
                  removeLabel={`${copy.remove} ${a.alergeno || copy.allergiesLabel}`}
                  onRemove={() =>
                    setForm((f) => ({
                      ...f,
                      allergies: f.allergies.filter((_, idx) => idx !== i),
                    }))
                  }
                >
                  <Input
                    aria-label={`${copy.allergiesLabel} ${i + 1}`}
                    placeholder={copy.allergenPlaceholder}
                    value={a.alergeno}
                    onChange={(e) => patchAllergy(i, { alergeno: e.target.value })}
                  />
                  <Input
                    aria-label={`${copy.reactionPlaceholder} ${i + 1}`}
                    placeholder={copy.reactionPlaceholder}
                    value={a.reaccion ?? ''}
                    onChange={(e) => patchAllergy(i, { reaccion: e.target.value })}
                  />
                  <select
                    aria-label={`Tipo de alergia ${i + 1}`}
                    value={a.tipo}
                    onChange={(e) => patchAllergy(i, { tipo: e.target.value as AllergyType })}
                    className={fieldClass}
                  >
                    {ALLERGY_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Severidad ${i + 1}`}
                    value={a.severidad}
                    onChange={(e) =>
                      patchAllergy(i, { severidad: e.target.value as AllergySeverity })
                    }
                    className={fieldClass}
                  >
                    {ALLERGY_SEVERITIES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </RowShell>
              ))}
            </ul>
          </section>

          {/* ── Condiciones ──────────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-ink">{copy.conditionsLabel}</h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    conditions: [
                      ...f.conditions,
                      { codigo: '', etiqueta: '', estado: 'SI', esAlerta: false },
                    ],
                  }))
                }
              >
                <Plus className="size-4" /> {copy.addCondition}
              </Button>
            </div>
            <ul className="flex flex-col gap-2">
              {form.conditions.map((c, i) => (
                <RowShell
                  key={i}
                  alertId={`mh-condition-alert-${i}`}
                  alertChecked={c.esAlerta}
                  onAlertChange={(checked) => patchCondition(i, { esAlerta: checked })}
                  removeLabel={`${copy.remove} ${c.etiqueta || copy.conditionsLabel}`}
                  onRemove={() =>
                    setForm((f) => ({
                      ...f,
                      conditions: f.conditions.filter((_, idx) => idx !== i),
                    }))
                  }
                >
                  <Input
                    aria-label={`${copy.conditionsLabel} ${i + 1}`}
                    placeholder={copy.conditionPlaceholder}
                    value={c.etiqueta}
                    onChange={(e) => patchCondition(i, { etiqueta: e.target.value })}
                  />
                  <select
                    aria-label={`Estado de la condición ${i + 1}`}
                    value={c.estado}
                    onChange={(e) =>
                      patchCondition(i, { estado: e.target.value as ConditionStatus })
                    }
                    className={fieldClass}
                  >
                    {CONDITION_STATUSES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Nota de la condición ${i + 1}`}
                    placeholder={copy.conditionNotePlaceholder}
                    value={c.nota ?? ''}
                    onChange={(e) => patchCondition(i, { nota: e.target.value })}
                    className="sm:col-span-2"
                  />
                </RowShell>
              ))}
            </ul>
          </section>

          {/* ── Medicamentos ─────────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-ink">{copy.medicationsLabel}</h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    medications: [...f.medications, { nombre: '', esAlerta: false }],
                  }))
                }
              >
                <Plus className="size-4" /> {copy.addMedication}
              </Button>
            </div>
            <ul className="flex flex-col gap-2">
              {form.medications.map((m, i) => (
                <RowShell
                  key={i}
                  alertId={`mh-medication-alert-${i}`}
                  alertChecked={m.esAlerta}
                  onAlertChange={(checked) => patchMedication(i, { esAlerta: checked })}
                  removeLabel={`${copy.remove} ${m.nombre || copy.medicationsLabel}`}
                  onRemove={() =>
                    setForm((f) => ({
                      ...f,
                      medications: f.medications.filter((_, idx) => idx !== i),
                    }))
                  }
                >
                  <Input
                    aria-label={`${copy.medicationsLabel} ${i + 1}`}
                    placeholder={copy.medicationPlaceholder}
                    value={m.nombre}
                    onChange={(e) => patchMedication(i, { nombre: e.target.value })}
                  />
                  <Input
                    aria-label={`Dosis ${i + 1}`}
                    placeholder={copy.dosePlaceholder}
                    value={m.dosis ?? ''}
                    onChange={(e) => patchMedication(i, { dosis: e.target.value })}
                  />
                  <Input
                    aria-label={`Frecuencia ${i + 1}`}
                    placeholder={copy.frequencyPlaceholder}
                    value={m.frecuencia ?? ''}
                    onChange={(e) => patchMedication(i, { frecuencia: e.target.value })}
                  />
                  <Input
                    aria-label={`Motivo ${i + 1}`}
                    placeholder={copy.reasonPlaceholder}
                    value={m.motivo ?? ''}
                    onChange={(e) => patchMedication(i, { motivo: e.target.value })}
                  />
                </RowShell>
              ))}
            </ul>
          </section>

          {/* ── Embarazo / textos ────────────────────────────────────── */}
          <div className="flex flex-wrap items-end gap-4">
            <label htmlFor="mh-pregnancy" className="flex items-center gap-2 text-sm text-ink">
              <input
                id="mh-pregnancy"
                type="checkbox"
                checked={form.embarazo}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    embarazo: e.target.checked,
                    // Clearing the flag clears the weeks with it, so a stale
                    // number can't travel with a "no embarazo" version.
                    semanasEmbarazo: e.target.checked ? f.semanasEmbarazo : '',
                  }))
                }
                className="size-4 accent-[var(--color-primary)]"
              />
              {copy.pregnancyLabel}
            </label>
            <div className="flex flex-col gap-1">
              <label htmlFor="mh-pregnancy-weeks" className="text-sm font-medium text-ink">
                {copy.weeksLabel}
              </label>
              <Input
                id="mh-pregnancy-weeks"
                type="number"
                min={0}
                max={45}
                className="w-28"
                disabled={!form.embarazo}
                value={form.semanasEmbarazo}
                onChange={(e) => setForm((f) => ({ ...f, semanasEmbarazo: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mh-family-history" className="text-sm font-medium text-ink">
              {copy.familyHistoryLabel}
            </label>
            <textarea
              id="mh-family-history"
              rows={2}
              placeholder={copy.familyHistoryPlaceholder}
              value={form.familyHistory}
              onChange={(e) => setForm((f) => ({ ...f, familyHistory: e.target.value }))}
              className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mh-notes" className="text-sm font-medium text-ink">
              {copy.notesLabel}
            </label>
            <textarea
              id="mh-notes"
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

          <Button type="submit" className="self-start" loading={submitting}>
            {submitting ? copy.submitting : latest ? copy.submit : copy.createSubmit}
          </Button>
        </form>
      )}
    </div>
  );
}
