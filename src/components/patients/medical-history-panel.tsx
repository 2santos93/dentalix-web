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
  type DentalHistory,
  type Habits,
  type MedicalHistory,
  type Medication,
  type SaveMedicalHistoryInput,
  type Surgery,
  type VitalSigns,
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
  // Fase 2
  habitsLabel: 'Hábitos',
  smokingLabel: 'Tabaquismo',
  perDayLabel: 'Cigarrillos/día',
  yearsLabel: 'Años',
  alcoholLabel: 'Alcohol',
  alcoholFreqPlaceholder: 'Frecuencia (ej. fin de semana)',
  substancesLabel: 'Otras sustancias',
  bruxismLabel: 'Bruxismo',
  oralHygieneLabel: 'Higiene oral',
  brushingLabel: 'Cepillados/día',
  flossLabel: 'Hilo dental',
  rinseLabel: 'Enjuague',
  fluorideLabel: 'Crema con flúor',
  dietLabel: 'Dieta',
  dietPlaceholder: 'Ej. alta en azúcares',
  dentalHistoryLabel: 'Historia dental',
  reasonLabel: 'Motivo de consulta',
  lastVisitLabel: 'Última visita',
  previousTreatmentsLabel: 'Tratamientos previos',
  previousTreatmentsHint: 'Separados por coma',
  badExperiencesLabel: 'Malas experiencias',
  gumBleedingLabel: 'Sangrado de encías',
  sensitivityLabel: 'Sensibilidad',
  tmjLabel: 'ATM',
  orthodonticsLabel: 'Ortodoncia previa',
  periodontalLabel: 'Enfermedad periodontal',
  surgeriesLabel: 'Cirugías',
  addSurgery: 'Agregar cirugía',
  surgeryPlaceholder: 'Descripción (ej. Extracción de cordal)',
  surgeryDateLabel: 'Fecha',
  vitalSignsLabel: 'Signos vitales',
  systolicLabel: 'Sistólica',
  diastolicLabel: 'Diastólica',
  hrLabel: 'FC',
  rrLabel: 'FR',
  tempLabel: 'Temp.',
  spo2Label: 'SpO₂',
  weightLabel: 'Peso',
  heightLabel: 'Talla',
  glucoseLabel: 'Glucometría',
  yes: 'Sí',
  no: 'No',
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

/**
 * The nested sections of the entity (habits / dentalHistory / vitalSigns) are
 * held FLAT here — numbers as text so an input can be cleared — and rebuilt
 * into their objects by `normalize`. `formFromHistory` is its inverse; the two
 * must stay symmetric or the no-op guard would see a phantom change.
 */
interface FormState {
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  embarazo: boolean;
  /** Kept as text so the input can be cleared; parsed on submit. */
  semanasEmbarazo: string;
  familyHistory: string;
  notes: string;

  // Hábitos
  fumaActivo: boolean;
  fumaPorDia: string;
  fumaAnios: string;
  alcoholActivo: boolean;
  alcoholFrecuencia: string;
  sustancias: boolean;
  bruxismo: boolean;
  cepilladoPorDia: string;
  hilo: boolean;
  enjuague: boolean;
  cremaConFluor: boolean;
  dieta: string;

  // Historia dental
  motivoConsulta: string;
  ultimaVisita: string;
  /** Comma-separated in the UI; split into the API's string[]. */
  tratamientosPrevios: string;
  malasExperiencias: string;
  sangradoEncias: boolean;
  sensibilidad: boolean;
  atm: boolean;
  ortodonciaPrevia: boolean;
  enfPeriodontal: boolean;

  // Cirugías
  surgeries: Surgery[];

  // Signos vitales
  sistolica: string;
  diastolica: string;
  fc: string;
  fr: string;
  temp: string;
  spo2: string;
  peso: string;
  talla: string;
  glucometria: string;
}

const emptyForm: FormState = {
  allergies: [],
  conditions: [],
  medications: [],
  embarazo: false,
  semanasEmbarazo: '',
  familyHistory: '',
  notes: '',

  fumaActivo: false,
  fumaPorDia: '',
  fumaAnios: '',
  alcoholActivo: false,
  alcoholFrecuencia: '',
  sustancias: false,
  bruxismo: false,
  cepilladoPorDia: '',
  hilo: false,
  enjuague: false,
  cremaConFluor: false,
  dieta: '',

  motivoConsulta: '',
  ultimaVisita: '',
  tratamientosPrevios: '',
  malasExperiencias: '',
  sangradoEncias: false,
  sensibilidad: false,
  atm: false,
  ortodonciaPrevia: false,
  enfPeriodontal: false,

  surgeries: [],

  sistolica: '',
  diastolica: '',
  fc: '',
  fr: '',
  temp: '',
  spo2: '',
  peso: '',
  talla: '',
  glucometria: '',
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
  /** Number -> input text; `undefined`/`null` become '' so the field renders empty. */
  const num = (v: number | undefined | null) => (v == null ? '' : String(v));
  const h = history.habits;
  const d = history.dentalHistory;
  const v = history.vitalSigns;
  return {
    allergies: history.allergies.map((a) => ({ ...a })),
    conditions: history.conditions.map((c) => ({ ...c })),
    medications: history.medications.map((m) => ({ ...m })),
    embarazo: history.safetyFlags.embarazo,
    semanasEmbarazo: num(history.safetyFlags.semanasEmbarazo),
    familyHistory: history.familyHistory ?? '',
    notes: history.notes ?? '',

    fumaActivo: h?.tabaquismo?.activo ?? false,
    fumaPorDia: num(h?.tabaquismo?.porDia),
    fumaAnios: num(h?.tabaquismo?.anios),
    alcoholActivo: h?.alcohol?.activo ?? false,
    alcoholFrecuencia: h?.alcohol?.frecuencia ?? '',
    sustancias: h?.sustancias ?? false,
    bruxismo: h?.bruxismo ?? false,
    cepilladoPorDia: num(h?.higieneOral?.cepilladoPorDia),
    hilo: h?.higieneOral?.hilo ?? false,
    enjuague: h?.higieneOral?.enjuague ?? false,
    cremaConFluor: h?.higieneOral?.cremaConFluor ?? false,
    dieta: h?.dieta ?? '',

    motivoConsulta: d?.motivoConsulta ?? '',
    ultimaVisita: d?.ultimaVisita ?? '',
    tratamientosPrevios: (d?.tratamientosPrevios ?? []).join(', '),
    malasExperiencias: d?.malasExperiencias ?? '',
    sangradoEncias: d?.sangradoEncias ?? false,
    sensibilidad: d?.sensibilidad ?? false,
    atm: d?.atm ?? false,
    ortodonciaPrevia: d?.ortodonciaPrevia ?? false,
    enfPeriodontal: d?.enfPeriodontal ?? false,

    surgeries: history.surgeries.map((s) => ({ ...s })),

    sistolica: num(v?.sistolica),
    diastolica: num(v?.diastolica),
    fc: num(v?.fc),
    fr: num(v?.fr),
    temp: num(v?.temp),
    spo2: num(v?.spo2),
    peso: num(v?.peso),
    talla: num(v?.talla),
    glucometria: num(v?.glucometria),
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
    habits: habitsFrom(form),
    dentalHistory: dentalHistoryFrom(form),
    surgeries: form.surgeries
      .filter((s) => s.descripcion.trim())
      .map((s) => ({
        descripcion: s.descripcion.trim(),
        ...(text(s.fecha) ? { fecha: text(s.fecha) } : {}),
      })),
    vitalSigns: vitalSignsFrom(form),
  };
}

/** Input text -> number, dropping blanks and anything non-numeric. */
function num(value: string): number | undefined {
  const t = value.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Drops keys that are empty/false so an untouched section serializes to `undefined` instead of a hollow object (which would look like a change to the no-op guard). */
function compact<T extends object>(obj: T): T | undefined {
  const entries = Object.entries(obj).filter(([, v]) => {
    if (v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'object' && v !== null) return Object.keys(v).length > 0;
    return true;
  });
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

function habitsFrom(form: FormState): Habits | undefined {
  const tabaquismo = form.fumaActivo
    ? compact({
        activo: true,
        porDia: num(form.fumaPorDia),
        anios: num(form.fumaAnios),
      })
    : undefined;
  const alcohol = form.alcoholActivo
    ? compact({ activo: true, frecuencia: form.alcoholFrecuencia.trim() || undefined })
    : undefined;
  const higieneOral = compact({
    cepilladoPorDia: num(form.cepilladoPorDia),
    hilo: form.hilo,
    enjuague: form.enjuague,
    cremaConFluor: form.cremaConFluor,
  });
  return compact({
    tabaquismo,
    alcohol,
    sustancias: form.sustancias,
    bruxismo: form.bruxismo,
    higieneOral,
    dieta: form.dieta.trim() || undefined,
  }) as Habits | undefined;
}

function dentalHistoryFrom(form: FormState): DentalHistory | undefined {
  const tratamientos = form.tratamientosPrevios
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return compact({
    motivoConsulta: form.motivoConsulta.trim() || undefined,
    ultimaVisita: form.ultimaVisita.trim() || undefined,
    tratamientosPrevios: tratamientos.length ? tratamientos : undefined,
    malasExperiencias: form.malasExperiencias.trim() || undefined,
    sangradoEncias: form.sangradoEncias,
    sensibilidad: form.sensibilidad,
    atm: form.atm,
    ortodonciaPrevia: form.ortodonciaPrevia,
    enfPeriodontal: form.enfPeriodontal,
  }) as DentalHistory | undefined;
}

function vitalSignsFrom(form: FormState): VitalSigns | undefined {
  return compact({
    sistolica: num(form.sistolica),
    diastolica: num(form.diastolica),
    fc: num(form.fc),
    fr: num(form.fr),
    temp: num(form.temp),
    spo2: num(form.spo2),
    peso: num(form.peso),
    talla: num(form.talla),
    glucometria: num(form.glucometria),
  });
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

/* ── Resúmenes de lectura ──────────────────────────────────────────────────
 * Las secciones anidadas se muestran como una línea legible en vez de un
 * volcado de campos: el resumen sólo nombra lo que está registrado.
 */

function summarizeHabits(habits: Habits | null): string {
  if (!habits) return copy.fieldFallback;
  const parts: string[] = [];
  if (habits.tabaquismo?.activo) {
    const detail = [
      habits.tabaquismo.porDia ? `${habits.tabaquismo.porDia}/día` : null,
      habits.tabaquismo.anios ? `${habits.tabaquismo.anios} años` : null,
    ].filter(Boolean);
    parts.push(`${copy.smokingLabel}${detail.length ? ` (${detail.join(', ')})` : ''}`);
  }
  if (habits.alcohol?.activo) {
    parts.push(
      `${copy.alcoholLabel}${habits.alcohol.frecuencia ? ` (${habits.alcohol.frecuencia})` : ''}`,
    );
  }
  if (habits.sustancias) parts.push(copy.substancesLabel);
  if (habits.bruxismo) parts.push(copy.bruxismLabel);
  const hygiene = [
    habits.higieneOral?.cepilladoPorDia
      ? `${habits.higieneOral.cepilladoPorDia} ${copy.brushingLabel.toLowerCase()}`
      : null,
    habits.higieneOral?.hilo ? copy.flossLabel.toLowerCase() : null,
    habits.higieneOral?.enjuague ? copy.rinseLabel.toLowerCase() : null,
    habits.higieneOral?.cremaConFluor ? 'flúor' : null,
  ].filter(Boolean);
  if (hygiene.length) parts.push(`${copy.oralHygieneLabel}: ${hygiene.join(', ')}`);
  if (habits.dieta) parts.push(`${copy.dietLabel}: ${habits.dieta}`);
  return parts.length ? parts.join(' · ') : copy.fieldFallback;
}

function summarizeDentalHistory(d: DentalHistory | null): string {
  if (!d) return copy.fieldFallback;
  const parts: string[] = [];
  if (d.motivoConsulta) parts.push(d.motivoConsulta);
  if (d.ultimaVisita) parts.push(`${copy.lastVisitLabel}: ${d.ultimaVisita}`);
  if (d.tratamientosPrevios?.length) parts.push(d.tratamientosPrevios.join(', '));
  const flags = [
    d.sangradoEncias ? copy.gumBleedingLabel : null,
    d.sensibilidad ? copy.sensitivityLabel : null,
    d.atm ? copy.tmjLabel : null,
    d.ortodonciaPrevia ? copy.orthodonticsLabel : null,
    d.enfPeriodontal ? copy.periodontalLabel : null,
  ].filter(Boolean);
  if (flags.length) parts.push(flags.join(', '));
  if (d.malasExperiencias) parts.push(d.malasExperiencias);
  return parts.length ? parts.join(' · ') : copy.fieldFallback;
}

function summarizeVitalSigns(v: VitalSigns | null): string {
  if (!v) return copy.fieldFallback;
  const parts = [
    v.sistolica && v.diastolica ? `TA ${v.sistolica}/${v.diastolica}` : null,
    v.fc ? `${copy.hrLabel} ${v.fc}` : null,
    v.fr ? `${copy.rrLabel} ${v.fr}` : null,
    v.temp ? `${copy.tempLabel} ${v.temp}°` : null,
    v.spo2 ? `${copy.spo2Label} ${v.spo2}%` : null,
    v.peso ? `${v.peso} kg` : null,
    v.talla ? `${v.talla} cm` : null,
    v.glucometria ? `${copy.glucoseLabel} ${v.glucometria}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : copy.fieldFallback;
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

/** Labeled checkbox — the anamnesis is mostly yes/no clinical questions. */
function CheckField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-primary)]"
      />
      {label}
    </label>
  );
}

/** Labeled numeric field — kept as text in state so it can be cleared (see `FormState`). */
function NumField({
  id,
  label,
  value,
  onChange,
  disabled,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={0}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Section wrapper for the form's grouped clinical blocks (fase 2). */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h4 className="text-sm font-medium text-ink">{title}</h4>
      {children}
    </section>
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
        // Every save is a full snapshot, so each section is sent whenever it
        // has content — an omitted one is wiped from the new version. These
        // are now edited by the form (fase 2) instead of being copied from
        // `latest`, but they still round-trip: the form is seeded from the
        // latest version on load.
        ...(n.habits ? { habits: n.habits } : {}),
        ...(n.dentalHistory ? { dentalHistory: n.dentalHistory } : {}),
        ...(n.surgeries.length ? { surgeries: n.surgeries } : {}),
        ...(n.vitalSigns ? { vitalSigns: n.vitalSigns } : {}),
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
              <p className="text-sm font-medium text-muted">{copy.habitsLabel}</p>
              <p className="text-ink">{summarizeHabits(latest.habits)}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted">{copy.dentalHistoryLabel}</p>
              <p className="text-ink">{summarizeDentalHistory(latest.dentalHistory)}</p>
            </div>

            <SummarySection title={copy.surgeriesLabel} isEmpty={latest.surgeries.length === 0}>
              {latest.surgeries.map((s, i) => (
                <li key={`${s.descripcion}-${i}`} className="flex flex-wrap items-center gap-2 text-ink">
                  <span className="font-medium">{s.descripcion}</span>
                  {s.fecha && <span className="text-xs text-muted">{s.fecha}</span>}
                </li>
              ))}
            </SummarySection>

            <div>
              <p className="text-sm font-medium text-muted">{copy.vitalSignsLabel}</p>
              <p className="text-ink tabular-nums">{summarizeVitalSigns(latest.vitalSigns)}</p>
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

          {/* ── Hábitos ──────────────────────────────────────────────── */}
          <FormSection title={copy.habitsLabel}>
            <div className="flex flex-wrap items-end gap-4">
              <CheckField
                id="mh-smoking"
                label={copy.smokingLabel}
                checked={form.fumaActivo}
                onChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    fumaActivo: checked,
                    // Clearing the habit clears its details, so stale numbers
                    // can't travel with a "no fuma" version.
                    fumaPorDia: checked ? f.fumaPorDia : '',
                    fumaAnios: checked ? f.fumaAnios : '',
                  }))
                }
              />
              <NumField
                id="mh-smoking-per-day"
                label={copy.perDayLabel}
                value={form.fumaPorDia}
                disabled={!form.fumaActivo}
                onChange={(v) => setForm((f) => ({ ...f, fumaPorDia: v }))}
              />
              <NumField
                id="mh-smoking-years"
                label={copy.yearsLabel}
                value={form.fumaAnios}
                disabled={!form.fumaActivo}
                onChange={(v) => setForm((f) => ({ ...f, fumaAnios: v }))}
              />
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <CheckField
                id="mh-alcohol"
                label={copy.alcoholLabel}
                checked={form.alcoholActivo}
                onChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    alcoholActivo: checked,
                    alcoholFrecuencia: checked ? f.alcoholFrecuencia : '',
                  }))
                }
              />
              <Input
                aria-label={copy.alcoholFreqPlaceholder}
                placeholder={copy.alcoholFreqPlaceholder}
                className="max-w-xs"
                disabled={!form.alcoholActivo}
                value={form.alcoholFrecuencia}
                onChange={(e) => setForm((f) => ({ ...f, alcoholFrecuencia: e.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <CheckField
                id="mh-substances"
                label={copy.substancesLabel}
                checked={form.sustancias}
                onChange={(checked) => setForm((f) => ({ ...f, sustancias: checked }))}
              />
              <CheckField
                id="mh-bruxism"
                label={copy.bruxismLabel}
                checked={form.bruxismo}
                onChange={(checked) => setForm((f) => ({ ...f, bruxismo: checked }))}
              />
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <NumField
                id="mh-brushing"
                label={copy.brushingLabel}
                value={form.cepilladoPorDia}
                onChange={(v) => setForm((f) => ({ ...f, cepilladoPorDia: v }))}
              />
              <CheckField
                id="mh-floss"
                label={copy.flossLabel}
                checked={form.hilo}
                onChange={(checked) => setForm((f) => ({ ...f, hilo: checked }))}
              />
              <CheckField
                id="mh-rinse"
                label={copy.rinseLabel}
                checked={form.enjuague}
                onChange={(checked) => setForm((f) => ({ ...f, enjuague: checked }))}
              />
              <CheckField
                id="mh-fluoride"
                label={copy.fluorideLabel}
                checked={form.cremaConFluor}
                onChange={(checked) => setForm((f) => ({ ...f, cremaConFluor: checked }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="mh-diet" className="text-xs font-medium text-muted">
                {copy.dietLabel}
              </label>
              <Input
                id="mh-diet"
                placeholder={copy.dietPlaceholder}
                value={form.dieta}
                onChange={(e) => setForm((f) => ({ ...f, dieta: e.target.value }))}
              />
            </div>
          </FormSection>

          {/* ── Historia dental ──────────────────────────────────────── */}
          <FormSection title={copy.dentalHistoryLabel}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="mh-reason" className="text-xs font-medium text-muted">
                  {copy.reasonLabel}
                </label>
                <Input
                  id="mh-reason"
                  value={form.motivoConsulta}
                  onChange={(e) => setForm((f) => ({ ...f, motivoConsulta: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="mh-last-visit" className="text-xs font-medium text-muted">
                  {copy.lastVisitLabel}
                </label>
                <Input
                  id="mh-last-visit"
                  type="date"
                  value={form.ultimaVisita}
                  onChange={(e) => setForm((f) => ({ ...f, ultimaVisita: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="mh-prev-treatments" className="text-xs font-medium text-muted">
                  {copy.previousTreatmentsLabel}
                </label>
                <Input
                  id="mh-prev-treatments"
                  placeholder={copy.previousTreatmentsHint}
                  value={form.tratamientosPrevios}
                  onChange={(e) => setForm((f) => ({ ...f, tratamientosPrevios: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="mh-bad-experiences" className="text-xs font-medium text-muted">
                  {copy.badExperiencesLabel}
                </label>
                <Input
                  id="mh-bad-experiences"
                  value={form.malasExperiencias}
                  onChange={(e) => setForm((f) => ({ ...f, malasExperiencias: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <CheckField
                id="mh-gum-bleeding"
                label={copy.gumBleedingLabel}
                checked={form.sangradoEncias}
                onChange={(checked) => setForm((f) => ({ ...f, sangradoEncias: checked }))}
              />
              <CheckField
                id="mh-sensitivity"
                label={copy.sensitivityLabel}
                checked={form.sensibilidad}
                onChange={(checked) => setForm((f) => ({ ...f, sensibilidad: checked }))}
              />
              <CheckField
                id="mh-tmj"
                label={copy.tmjLabel}
                checked={form.atm}
                onChange={(checked) => setForm((f) => ({ ...f, atm: checked }))}
              />
              <CheckField
                id="mh-orthodontics"
                label={copy.orthodonticsLabel}
                checked={form.ortodonciaPrevia}
                onChange={(checked) => setForm((f) => ({ ...f, ortodonciaPrevia: checked }))}
              />
              <CheckField
                id="mh-periodontal"
                label={copy.periodontalLabel}
                checked={form.enfPeriodontal}
                onChange={(checked) => setForm((f) => ({ ...f, enfPeriodontal: checked }))}
              />
            </div>
          </FormSection>

          {/* ── Cirugías ─────────────────────────────────────────────── */}
          <FormSection title={copy.surgeriesLabel}>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({ ...f, surgeries: [...f.surgeries, { descripcion: '' }] }))
                }
              >
                <Plus className="size-4" /> {copy.addSurgery}
              </Button>
            </div>
            <ul className="flex flex-col gap-2">
              {form.surgeries.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center"
                >
                  <Input
                    aria-label={`${copy.surgeriesLabel} ${i + 1}`}
                    placeholder={copy.surgeryPlaceholder}
                    className="flex-1"
                    value={s.descripcion}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        surgeries: f.surgeries.map((x, idx) =>
                          idx === i ? { ...x, descripcion: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <Input
                    aria-label={`${copy.surgeryDateLabel} ${i + 1}`}
                    type="date"
                    className="sm:w-44"
                    value={s.fecha ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        surgeries: f.surgeries.map((x, idx) =>
                          idx === i ? { ...x, fecha: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${copy.remove} ${s.descripcion || copy.surgeriesLabel}`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        surgeries: f.surgeries.filter((_, idx) => idx !== i),
                      }))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </FormSection>

          {/* ── Signos vitales ───────────────────────────────────────── */}
          <FormSection title={copy.vitalSignsLabel}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <NumField
                id="mh-systolic"
                label={copy.systolicLabel}
                value={form.sistolica}
                onChange={(v) => setForm((f) => ({ ...f, sistolica: v }))}
              />
              <NumField
                id="mh-diastolic"
                label={copy.diastolicLabel}
                value={form.diastolica}
                onChange={(v) => setForm((f) => ({ ...f, diastolica: v }))}
              />
              <NumField
                id="mh-hr"
                label={copy.hrLabel}
                value={form.fc}
                onChange={(v) => setForm((f) => ({ ...f, fc: v }))}
              />
              <NumField
                id="mh-rr"
                label={copy.rrLabel}
                value={form.fr}
                onChange={(v) => setForm((f) => ({ ...f, fr: v }))}
              />
              <NumField
                id="mh-temp"
                label={copy.tempLabel}
                step="0.1"
                value={form.temp}
                onChange={(v) => setForm((f) => ({ ...f, temp: v }))}
              />
              <NumField
                id="mh-spo2"
                label={copy.spo2Label}
                value={form.spo2}
                onChange={(v) => setForm((f) => ({ ...f, spo2: v }))}
              />
              <NumField
                id="mh-weight"
                label={copy.weightLabel}
                step="0.1"
                value={form.peso}
                onChange={(v) => setForm((f) => ({ ...f, peso: v }))}
              />
              <NumField
                id="mh-height"
                label={copy.heightLabel}
                step="0.1"
                value={form.talla}
                onChange={(v) => setForm((f) => ({ ...f, talla: v }))}
              />
              <NumField
                id="mh-glucose"
                label={copy.glucoseLabel}
                value={form.glucometria}
                onChange={(v) => setForm((f) => ({ ...f, glucometria: v }))}
              />
            </div>
          </FormSection>

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
