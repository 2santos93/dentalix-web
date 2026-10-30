'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, CheckCircle2, LinkIcon, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPublicAnamnesis,
  submitPublicAnamnesis,
  type AnamnesisQuestionnaire,
  type PublicAnamnesis,
} from '@/lib/anamnesis/anamnesis-api';
import {
  emptyAllergy,
  emptyMedication,
  emptySurgery,
  initialFormState,
  toSubmitBody,
  validateForm,
  type AllergySeverity,
  type AllergyType,
  type AnamnesisAnswer,
  type AnamnesisFormState,
  type FormErrors,
} from '@/lib/anamnesis/anamnesis-form';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { fieldClass } from '@/lib/ui/field-class';
import { formatDateTime } from '@/lib/format/date';
import { cn } from '@/lib/utils';

const copy = {
  loading: 'Cargando su cuestionario…',
  // Sin «Intenta de nuevo.»: `SectionError` trae su propio botón.
  loadError: 'No pudimos cargar el cuestionario. Revise su conexión.',
  goneTitle: 'Este enlace ya no es válido',
  goneMessage: 'Este enlace ya no es válido, contacte con su clínica.',
  fallbackClinic: 'Su clínica',
  title: 'Cuestionario de salud',
  greeting: (name: string | null) => (name ? `Hola, ${name}.` : 'Hola.'),
  intro:
    'Antes de su cita, conteste estas preguntas sobre su salud. Su odontólogo las revisará; nada cambia en su historia hasta entonces.',
  expires: (when: string) => `El enlace caduca el ${when}.`,
  consentTitle: 'Autorización para tratar sus datos de salud',
  consentLead: 'Para responder necesitamos su autorización. Lea el texto de la clínica:',
  consentCheck: 'Autorizo el tratamiento de mis datos de salud en los términos anteriores.',
  readPolicy: 'Leer la política completa',
  consentRequired: 'Para continuar debe autorizar el tratamiento de sus datos de salud.',
  continue: 'Continuar',
  noPolicy:
    'La clínica aún no ha publicado su política de datos, así que no podemos pedirle la autorización. Contacte con su clínica.',
  addAllergy: 'Añadir otra alergia',
  addMedication: 'Añadir otro medicamento',
  addSurgery: 'Añadir otra',
  remove: 'Quitar',
  allergen: '¿A qué es alérgico?',
  allergyType: 'Tipo',
  chooseType: 'Elija…',
  severity: '¿Cómo fue la reacción?',
  reaction: 'Qué le pasó (opcional)',
  medName: 'Medicamento',
  dose: 'Dosis (opcional)',
  frequency: 'Cada cuánto (opcional)',
  surgery: 'Cirugía u hospitalización',
  surgeryDate: 'Año aproximado (opcional)',
  item: (label: string, n: number) => `${label} ${n}`,
  submit: 'Enviar respuestas',
  submitting: 'Enviando…',
  missing: (n: number) =>
    n === 1 ? 'Falta 1 dato por completar: revíselo arriba.' : `Faltan ${n} datos por completar: revíselos arriba.`,
  submitError: 'No pudimos enviar sus respuestas.',
  network: 'No pudimos enviar sus respuestas. Revise su conexión e intente de nuevo.',
  doneTitle: '¡Gracias! Recibimos sus respuestas',
  doneMessage: (clinic: string) =>
    `${clinic} revisará su cuestionario antes de la cita. Ya puede cerrar esta página.`,
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'gone' }
  | { kind: 'ready'; data: PublicAnamnesis };

type Question = AnamnesisQuestionnaire['sections'][number]['questions'][number];

/**
 * Página pública `/anamnesis/[token]` (DX-099): el paciente responde desde el
 * móvil. Pinta el cuestionario que manda la API (la misma estructura que la
 * HC del personal): Sí / No / No sé, seguimiento al contestar «Sí» y la
 * casilla de veracidad. Si no tiene vigente la autorización de datos de
 * salud, la pide antes con el texto versionado de la clínica (DX-037). Solo
 * muestra la marca de la clínica y el nombre de pila: ningún dato previo.
 */
export function PublicAnamnesisView({ linkToken }: { linkToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  // Focus only after a user-driven step change, after React commits its heading.
  useEffect(() => {
    if (done) doneRef.current?.focus();
    else if (consentAccepted) headingRef.current?.focus();
  }, [consentAccepted, done]);

  useEffect(() => {
    let cancelled = false;
    getPublicAnamnesis(linkToken)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Desconocido (404) o caducado, anulado, ya enviado (410): mismo aviso.
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setState({ kind: 'gone' });
        } else setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, reloadKey]);

  const clinic = state.kind === 'ready' ? state.data.clinic : null;
  const clinicName = clinic?.name ?? copy.fallbackClinic;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-bg">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            description={copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'gone' && <Notice headingLevel={1} icon={LinkIcon} title={copy.goneTitle} message={copy.goneMessage} />}

        {state.kind === 'ready' && (
          <>
            <header className="flex items-center gap-3">
              {clinic?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- logo de la clínica en un host arbitrario; next/image exigiría whitelistear cada dominio
                <img
                  src={clinic.logoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-lg object-contain"
                />
              )}
              <p className="min-w-0 break-words text-base font-semibold text-ink">{clinicName}</p>
            </header>

            {done ? (
              <div
                role="status"
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-6 py-12 text-center"
              >
                <span
                  aria-hidden
                  className="mb-1 flex size-10 items-center justify-center rounded-full bg-success/10 text-success"
                >
                  <CheckCircle2 className="size-5" />
                </span>
                <h1 ref={doneRef} tabIndex={-1} className="text-lg font-semibold text-ink">{copy.doneTitle}</h1>
                <p className="max-w-sm text-sm text-muted">{copy.doneMessage(clinicName)}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <h1 ref={headingRef} tabIndex={-1} className="t-display text-ink">{copy.title}</h1>
                  <p className="text-base text-ink">{copy.greeting(state.data.patientFirstName)}</p>
                  <p className="text-sm text-muted">{copy.intro}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {copy.expires(formatDateTime(state.data.expiresAt))}
                  </p>
                </div>
                {state.data.consent.required && !consentAccepted ? (
                  <ConsentStep data={state.data} onAccept={() => setConsentAccepted(true)} />
                ) : (
                  <QuestionnaireForm
                    linkToken={linkToken}
                    data={state.data}
                    onSubmitted={() => setDone(true)}
                    onGone={() => setState({ kind: 'gone' })}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Paso previo: la autorización SENSITIVE_HEALTH con el texto versionado. */
function ConsentStep({ data, onAccept }: { data: PublicAnamnesis; onAccept: () => void }) {
  const ids = useId();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const policy = data.consent.policy;

  if (!policy) {
    return <InlineError variant="summary">{copy.noPolicy}</InlineError>;
  }
  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-5"
    >
      <h2 id={`${ids}-title`} className="text-lg font-semibold text-ink">
        {copy.consentTitle}
      </h2>
      <p className="text-sm text-muted">{copy.consentLead}</p>
      <blockquote className="whitespace-pre-line rounded-lg bg-surface-2 px-3 py-3 text-sm text-ink">
        {policy.sensitiveHealthText}
      </blockquote>
      <button
        type="button"
        aria-expanded={showPolicy}
        aria-controls={`${ids}-policy`}
        onClick={() => setShowPolicy((v) => !v)}
        className="min-h-11 self-start text-sm font-medium text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
      >
        {copy.readPolicy}
      </button>
      <div id={`${ids}-policy`} hidden={!showPolicy} className="whitespace-pre-line text-sm text-muted">
        {policy.policyText}
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ids}-error` : undefined}
          onChange={(e) => {
            setChecked(e.target.checked);
            if (e.target.checked) setError(null);
          }}
        />
        <span>{copy.consentCheck}</span>
      </label>
      {error && <InlineError id={`${ids}-error`}>{error}</InlineError>}
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto sm:self-start"
        onClick={() => (checked ? onAccept() : setError(copy.consentRequired))}
      >
        {copy.continue}
      </Button>
    </section>
  );
}

/** Sí / No / No sé como grupo de radios (teclado nativo, 44 px de alto). */
function AnswerGroup({
  name,
  value,
  labels,
  options,
  onChange,
  invalid,
  describedBy,
  labelledBy,
}: {
  labelledBy: string;
  name: string;
  value: AnamnesisAnswer | undefined;
  labels: Record<AnamnesisAnswer, string>;
  options: AnamnesisAnswer[];
  onChange: (value: AnamnesisAnswer) => void;
  invalid: boolean;
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      className="grid grid-cols-3 gap-2"
    >
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ink',
            value === option
              ? 'border-primary bg-primary text-primary-foreground font-semibold'
              : 'border-border bg-surface text-ink font-medium hover:bg-surface-2',
            invalid && value === undefined && 'border-danger/60',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          {value === option && <Check aria-hidden="true" className="size-4 shrink-0" />}
          {labels[option]}
        </label>
      ))}
    </div>
  );
}

function QuestionnaireForm({
  linkToken,
  data,
  onSubmitted,
  onGone,
}: {
  linkToken: string;
  data: PublicAnamnesis;
  onSubmitted: () => void;
  onGone: () => void;
}) {
  const q = data.questionnaire;
  const ids = useId();
  const [form, setForm] = useState<AnamnesisFormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const options = q.answers as AnamnesisAnswer[];

  const fieldId = (key: string) => `${ids}-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const errorId = (key: string) => `${fieldId(key)}-error`;
  const err = (key: string) => (submitted ? errors[key] : undefined);

  function update(next: AnamnesisFormState) {
    setForm(next);
    if (submitted) setErrors(validateForm(next, q));
  }
  const setAnswer = (key: string, answer: AnamnesisAnswer) =>
    update({ ...form, answers: { ...form.answers, [key]: answer } });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setSubmitError(null);
    const found = validateForm(form, q);
    setErrors(found);
    const keys = Object.keys(found);
    if (keys.length > 0) {
      // Al primer dato que falta: el resumen dice cuántos, el foco va al sitio.
      const first = document.getElementById(fieldId(keys[0])) ?? summaryRef.current;
      first?.scrollIntoView?.({ block: 'center' });
      first?.focus({ preventScroll: true });
      return;
    }
    setSubmitting(true);
    try {
      await submitPublicAnamnesis(
        linkToken,
        toSubmitBody(form, q, data.consent.required ? (data.consent.policy?.id ?? null) : null),
      );
      onSubmitted();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
        onGone();
        return;
      }
      setSubmitError(apiErrorMessage(error, { fallback: copy.submitError, network: copy.network }));
    } finally {
      setSubmitting(false);
    }
  }

  const missing = Object.keys(errors).length;

  function followUp(question: Question) {
    if (form.answers[question.key] !== 'SI' || !question.followUp) return null;
    const { kind, label } = question.followUp;
    if (kind === 'ALLERGY_LIST') {
      return (
        <ListFollowUp
          title={label}
          error={err('allergies')}
          errorId={errorId('allergies')}
          items={form.allergies}
          addLabel={copy.addAllergy}
          max={q.limits.listItems}
          onAdd={() => update({ ...form, allergies: [...form.allergies, emptyAllergy()] })}
          onRemove={(i) => update({ ...form, allergies: form.allergies.filter((_, j) => j !== i) })}
          render={(a, i) => {
            const set = (patch: Partial<typeof a>) =>
              update({ ...form, allergies: form.allergies.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <>
                <TextField
                  id={fieldId(`allergies.${i}.alergeno`)}
                  label={copy.allergen}
                  value={a.alergeno}
                  max={q.limits.text}
                  error={err(`allergies.${i}.alergeno`)}
                  onChange={(v) => set({ alergeno: v })}
                />
                <SelectField
                  id={fieldId(`allergies.${i}.tipo`)}
                  label={copy.allergyType}
                  value={a.tipo}
                  placeholder={copy.chooseType}
                  options={q.allergyTypes}
                  error={err(`allergies.${i}.tipo`)}
                  onChange={(v) => set({ tipo: v as AllergyType })}
                />
                <SelectField
                  id={fieldId(`allergies.${i}.severidad`)}
                  label={copy.severity}
                  value={a.severidad}
                  options={q.allergySeverities}
                  onChange={(v) => set({ severidad: v as AllergySeverity })}
                />
                <TextField
                  id={fieldId(`allergies.${i}.reaccion`)}
                  label={copy.reaction}
                  value={a.reaccion}
                  max={q.limits.text}
                  error={err(`allergies.${i}.reaccion`)}
                  onChange={(v) => set({ reaccion: v })}
                />
              </>
            );
          }}
          itemLabel={(i) => copy.item('Alergia', i + 1)}
        />
      );
    }
    if (kind === 'MEDICATION_LIST') {
      return (
        <ListFollowUp
          title={label}
          error={err('medications')}
          errorId={errorId('medications')}
          items={form.medications}
          addLabel={copy.addMedication}
          max={q.limits.listItems}
          onAdd={() => update({ ...form, medications: [...form.medications, emptyMedication()] })}
          onRemove={(i) => update({ ...form, medications: form.medications.filter((_, j) => j !== i) })}
          itemLabel={(i) => copy.item('Medicamento', i + 1)}
          render={(m, i) => {
            const set = (patch: Partial<typeof m>) =>
              update({ ...form, medications: form.medications.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <>
                <TextField
                  id={fieldId(`medications.${i}.nombre`)}
                  label={copy.medName}
                  value={m.nombre}
                  max={q.limits.text}
                  error={err(`medications.${i}.nombre`)}
                  onChange={(v) => set({ nombre: v })}
                />
                <TextField
                  id={fieldId(`medications.${i}.dosis`)}
                  label={copy.dose}
                  value={m.dosis}
                  max={q.limits.text}
                  onChange={(v) => set({ dosis: v })}
                />
                <TextField
                  id={fieldId(`medications.${i}.frecuencia`)}
                  label={copy.frequency}
                  value={m.frecuencia}
                  max={q.limits.text}
                  onChange={(v) => set({ frecuencia: v })}
                />
              </>
            );
          }}
        />
      );
    }
    if (kind === 'SURGERY_LIST') {
      return (
        <ListFollowUp
          title={label}
          error={err('surgeries')}
          errorId={errorId('surgeries')}
          items={form.surgeries}
          addLabel={copy.addSurgery}
          max={q.limits.listItems}
          onAdd={() => update({ ...form, surgeries: [...form.surgeries, emptySurgery()] })}
          onRemove={(i) => update({ ...form, surgeries: form.surgeries.filter((_, j) => j !== i) })}
          itemLabel={(i) => copy.item('Cirugía', i + 1)}
          render={(s, i) => {
            const set = (patch: Partial<typeof s>) =>
              update({ ...form, surgeries: form.surgeries.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <>
                <TextField
                  id={fieldId(`surgeries.${i}.descripcion`)}
                  label={copy.surgery}
                  value={s.descripcion}
                  max={q.limits.text}
                  error={err(`surgeries.${i}.descripcion`)}
                  onChange={(v) => set({ descripcion: v })}
                />
                <TextField
                  id={fieldId(`surgeries.${i}.fecha`)}
                  label={copy.surgeryDate}
                  value={s.fecha}
                  max={40}
                  inputMode="numeric"
                  onChange={(v) => set({ fecha: v })}
                />
              </>
            );
          }}
        />
      );
    }
    if (question.key === 'anticoagulants') {
      return (
        <TextField
          id={fieldId('anticoagulants.detail')}
          label={label}
          value={form.anticoagulantDetail}
          max={q.limits.text}
          error={err('anticoagulants.detail')}
          onChange={(v) => update({ ...form, anticoagulantDetail: v })}
        />
      );
    }
    if (question.key === 'habits.tabaquismo') {
      return (
        <TextField
          id={fieldId('habits.tabaquismo.perDay')}
          label={label}
          value={form.smokingPerDay}
          max={3}
          inputMode="numeric"
          error={err('habits.tabaquismo.perDay')}
          onChange={(v) => update({ ...form, smokingPerDay: v })}
        />
      );
    }
    if (question.key === 'habits.alcohol') {
      return (
        <TextField
          id={fieldId('habits.alcohol.frequency')}
          label={label}
          value={form.alcoholFrequency}
          max={q.limits.text}
          error={err('habits.alcohol.frequency')}
          onChange={(v) => update({ ...form, alcoholFrequency: v })}
        />
      );
    }
    if (question.key === 'pregnancy') {
      return (
        <TextField
          id={fieldId('pregnancy.weeks')}
          label={label}
          value={form.pregnancyWeeks}
          max={2}
          inputMode="numeric"
          error={err('pregnancy.weeks')}
          onChange={(v) => update({ ...form, pregnancyWeeks: v })}
        />
      );
    }
    if (kind === 'NOTE') {
      return (
        <TextField
          id={fieldId(`${question.key}.note`)}
          label={label}
          value={form.notes[question.key] ?? ''}
          max={q.limits.note}
          error={err(`${question.key}.note`)}
          onChange={(v) => update({ ...form, notes: { ...form.notes, [question.key]: v } })}
        />
      );
    }
    return null;
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <p className="text-sm text-ink">No cierre esta página hasta enviar.</p>
      {q.sections.map((section) => (
        <section
          key={section.key}
          aria-labelledby={fieldId(`section-${section.key}`)}
          className="flex flex-col gap-5 rounded-xl border border-border bg-surface px-4 py-5"
        >
          <div className="flex flex-col gap-1">
            <h2 id={fieldId(`section-${section.key}`)} className="text-lg font-semibold text-ink">
              {section.title}
            </h2>
            {section.description && <p className="text-sm text-muted">{section.description}</p>}
          </div>
          {section.questions.map((question, questionIndex) => {
            const error = err(question.key);
            return (
              <div key={question.key} className={cn(questionIndex > 0 && 'border-t border-hairline pt-4')}>
                <fieldset className="flex min-w-0 flex-col gap-3">
                  <legend
                    id={fieldId(question.key)}
                    tabIndex={-1}
                    className="mb-3 text-base text-ink focus-visible:outline-none"
                  >
                    {question.label}
                  </legend>
                  <AnswerGroup
                    name={fieldId(question.key)}
                    labelledBy={fieldId(question.key)}
                    value={form.answers[question.key]}
                    labels={q.answerLabels as Record<AnamnesisAnswer, string>}
                    options={options}
                    invalid={!!error}
                    describedBy={error ? errorId(question.key) : undefined}
                    onChange={(v) => setAnswer(question.key, v)}
                  />
                  {error && <InlineError id={errorId(question.key)}>{error}</InlineError>}
                  {followUp(question)}
                </fieldset>
              </div>
            );
          })}
        </section>
      ))}

      <div className="flex flex-col gap-2">
        <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
          <input
            id={fieldId('declaration')}
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            checked={form.declaration}
            aria-invalid={err('declaration') ? true : undefined}
            aria-describedby={err('declaration') ? errorId('declaration') : undefined}
            onChange={(e) => update({ ...form, declaration: e.target.checked })}
          />
          <span>{q.declaration}</span>
        </label>
        {err('declaration') && <InlineError id={errorId('declaration')}>{err('declaration')}</InlineError>}
      </div>

      <div ref={summaryRef} tabIndex={-1} className="flex flex-col gap-3 focus-visible:outline-none">
        {submitted && missing > 0 && <InlineError variant="summary">{copy.missing(missing)}</InlineError>}
        {submitError && <InlineError variant="summary">{submitError}</InlineError>}
        <Button type="submit" size="lg" loading={submitting} disabled={submitting} className="w-full sm:w-auto sm:self-start">
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </div>
    </form>
  );
}

function ListFollowUp<T>({
  title,
  items,
  render,
  itemLabel,
  addLabel,
  max,
  onAdd,
  onRemove,
  error,
  errorId,
}: {
  title: string;
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  itemLabel: (index: number) => string;
  addLabel: string;
  max: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  error?: string;
  errorId: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-2 p-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="t-label text-muted">{itemLabel(i)}</p>
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11"
                aria-label={`${copy.remove} ${itemLabel(i).toLowerCase()}`}
                onClick={() => onRemove(i)}
              >
                <Trash2 aria-hidden /> {copy.remove}
              </Button>
            )}
          </div>
          {render(item, i)}
        </div>
      ))}
      {error && <InlineError id={errorId}>{error}</InlineError>}
      {items.length < max && (
        <Button type="button" variant="secondary" className="min-h-11 self-start" onClick={onAdd}>
          <Plus aria-hidden /> {addLabel}
        </Button>
      )}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  max,
  error,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        maxLength={max}
        inputMode={inputMode}
        className="min-h-11 text-base"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <InlineError id={`${id}-error`} className="text-xs">
          {error}
        </InlineError>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        className={cn(fieldClass, 'min-h-11 text-base')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <InlineError id={`${id}-error`} className="text-xs">
          {error}
        </InlineError>
      )}
    </div>
  );
}
