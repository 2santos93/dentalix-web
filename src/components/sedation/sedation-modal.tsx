'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  AGENT_KIND_LABELS,
  ASA_CLASSES,
  DOSE_UNIT_LABELS,
  GRADE_LABELS,
  HIGH_ASA,
  LEVEL_LABELS,
  PHASE_LABELS,
  ROUTE_LABELS,
  SEDATION_REASON_MIN,
  STATUS_LABELS,
  assessSedation,
  bodyMassIndex,
  dischargeSedation,
  formatDecimal,
  getEntrySedation,
  liveOverdue,
  parseNumber,
  recordSedationAgent,
  recordSedationChecklist,
  recordSedationVitals,
  reversalDoses,
  type AsaClass,
  type SedationAgentKind,
  type SedationDoseUnit,
  type SedationGrade,
  type SedationLevel,
  type SedationRoute,
  type SedationSheet,
  type SedationTemplate,
  type SedationVitalsValues,
} from '@/lib/sedation/sedation-api';
import type { ClinicRole, StaffMember } from '@/lib/staff/staff-api';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { wallDay, wallInstant, wallMinuteOfDay } from '@/lib/time/wall-clock';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const sedationCopy = {
  title: 'Hoja de sedación',
  description: (entryDate: string) =>
    `Evolución del ${entryDate}. Lo registrado no se edita: una corrección va en una adenda de la evolución.`,
  loading: 'Cargando la hoja de sedación',
  loadError: 'No pudimos cargar la hoja de sedación.',
  emptyTitle: 'Esta evolución no tiene hoja de sedación.',
  emptyWriter: 'Ábrela con la valoración previa: ASA, ayuno, vía aérea, peso, talla, acompañante y consentimiento.',
  emptyReader: 'La abre el odontólogo con la valoración previa; después podrás registrar las tomas de constantes.',
  readOnly: 'Solo lectura: el odontólogo registra la valoración, el checklist, los fármacos y el egreso.',
  closed: 'Egreso firmado: la hoja está cerrada. Una corrección va en una adenda de la evolución.',
  template: (version: string, minutes: number) =>
    `Plantilla de plataforma ${version} · constantes cada ${minutes} min`,
  status: 'Estado',
  // Secciones
  assessmentHeading: 'Valoración previa',
  checklistHeading: 'Checklist previo',
  checklistPending: 'Pendiente: sin checklist no se administran fármacos ni se toman constantes intraoperatorias.',
  agentsHeading: 'Fármacos',
  noAgents: 'Sin fármacos registrados.',
  vitalsHeading: 'Constantes',
  noVitals: 'Sin tomas registradas.',
  dischargeHeading: 'Egreso',
  byAt: (name: string | null, time: string) => `${name ?? 'Usuario'} · ${time}`,
  // Aviso de intervalo
  overdue: (minutes: number, interval: number) =>
    minutes > 0
      ? `Pasó el intervalo de ${interval} min sin toma: ${minutes} min de retraso. Registra las constantes.`
      : `Pasó el intervalo de ${interval} min sin toma. Registra las constantes.`,
  nextDue: (time: string) => `Próxima toma antes de las ${time}.`,
  missed: (n: number) => (n === 1 ? '1 intervalo pasado sin toma.' : `${n} intervalos pasados sin toma.`),
  // Acciones
  actionLegend: 'Qué registrar',
  actions: {
    ASSESS: 'Valoración previa',
    CHECKLIST: 'Checklist',
    VITALS: 'Toma de constantes',
    AGENT: 'Fármaco',
    DISCHARGE: 'Egreso',
  },
  submit: {
    ASSESS: 'Abrir hoja de sedación',
    CHECKLIST: 'Registrar checklist',
    VITALS: 'Registrar toma',
    AGENT: 'Registrar fármaco',
    DISCHARGE: 'Firmar egreso',
  },
  saved: {
    ASSESS: 'Hoja abierta con la valoración previa.',
    CHECKLIST: 'Checklist registrado.',
    VITALS: 'Toma registrada.',
    AGENT: 'Fármaco registrado.',
    DISCHARGE: 'Egreso firmado. La hoja queda cerrada.',
  },
  close: 'Cerrar',
  genericError: 'No pudimos guardar en la hoja de sedación.',
  // Campos
  grade: 'Grado de sedación planificado',
  asa: 'Clase ASA',
  chooseAsa: 'Elige la clase ASA',
  asaEmergency: 'Urgencia (sufijo E)',
  highAsaHint: `Con ASA III o más: interconsulta médica o justificación (mínimo ${SEDATION_REASON_MIN} caracteres).`,
  interconsultation: 'Interconsulta médica',
  justification: 'Justificación',
  fastingLiquids: 'Ayuno de líquidos claros (h)',
  fastingSolids: 'Ayuno de sólidos y leche (h)',
  mallampati: 'Vía aérea (Mallampati)',
  chooseMallampati: 'Elige la clase',
  weight: 'Peso hoy (kg)',
  height: 'Talla (cm)',
  bmi: 'IMC (calculado)',
  reversal: 'Reversores por peso',
  reversalLine: (naloxone: number, flumazenil: number) =>
    `Naloxona ${formatDecimal(naloxone)} mg · Flumazenil ${formatDecimal(flumazenil)} mg`,
  reversalHint: 'Naloxona 0,1 mg/kg (máx. 2 mg) · flumazenil 0,01 mg/kg (máx. 0,2 mg).',
  escortName: 'Acompañante adulto',
  escortRelationship: 'Relación con el paciente',
  consent: 'El consentimiento de sedación está firmado',
  phase: 'Fase',
  time: 'Hora',
  spo2: 'SpO₂ (%)',
  heartRate: 'FC (lpm)',
  systolic: 'TA sistólica',
  diastolic: 'TA diastólica',
  respiratoryRate: 'FR (rpm)',
  etco2: 'CO₂ espirado (mmHg, opcional)',
  level: 'Nivel de sedación',
  chooseLevel: 'Elige el nivel',
  agentKind: 'Tipo',
  n2oPercent: 'N₂O (%)',
  flow: 'Flujo total (l/min)',
  drugName: 'Fármaco',
  dose: 'Dosis',
  unit: 'Unidad',
  route: 'Vía',
  criteria: 'Criterios de alta',
  criteriaHint: (n: number, aldrete: number) =>
    `Marca los ${n} criterios o anota un Aldrete modificado ≥ ${aldrete}.`,
  aldrete: 'Aldrete modificado (0–10, opcional)',
  dischargeVitals: 'Constantes al alta',
  dischargedAt: 'Hora de egreso',
  handedOverTo: 'Se entrega a',
  handedOverRelationship: 'Relación',
  instructions: 'Indicaciones postoperatorias entregadas y explicadas',
  monitor: 'Quién monitorizó',
  chooseMonitor: 'Elige a quien monitorizó',
  sameMonitor: 'En sedación moderada quien monitoriza no debería ser el operador: justifícalo.',
  sameMonitorLabel: 'Justificación (operador = monitor)',
  operator: 'Operador (firma)',
  invalidNumber: 'Escribe un número válido.',
  // Lectura
  yes: 'Sí',
  no: 'No',
  fasting: 'Ayuno',
  fastingLine: (l: number | null, s: number | null) =>
    `${l === null ? '—' : formatDecimal(l)} h líquidos · ${s === null ? '—' : formatDecimal(s)} h sólidos`,
  body: 'Peso · talla · IMC',
  bodyLine: (w: number | null, h: number | null, bmi: number | null) =>
    `${w === null ? '—' : `${formatDecimal(w)} kg`} · ${h === null ? '—' : `${formatDecimal(h)} cm`} · IMC ${bmi === null ? '—' : formatDecimal(bmi)}`,
  escort: 'Acompañante',
  consentRead: 'Consentimiento firmado',
  highAsaRead: 'Interconsulta / justificación',
  aldreteRead: (score: number) => `Aldrete modificado ${score}`,
  handedRead: (name: string, rel: string, time: string) => `Entregado a ${name} (${rel}) a las ${time}`,
  instructionsRead: 'Indicaciones entregadas',
  sameMonitorRead: 'Operador = monitor:',
};

type Action = keyof typeof sedationCopy.actions;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; template: SedationTemplate; sheet: SedationSheet | null };

interface SedationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  entryId: string;
  entryDateLabel: string;
  role: ClinicRole | null;
  /** Usuario de la sesión: el operador del egreso. */
  userId: string | null;
  /** Personal de la clínica (para elegir quién monitorizó). */
  staff: StaffMember[];
  clock: SedeClock | null;
  onSaved: (sheet: SedationSheet) => void;
}

const CLINICAL: readonly ClinicRole[] = ['ADMIN', 'DENTIST', 'ASSISTANT'];
const LEVELS = Object.keys(LEVEL_LABELS) as SedationLevel[];
const AGENT_KINDS = Object.keys(AGENT_KIND_LABELS) as SedationAgentKind[];
const UNITS = Object.keys(DOSE_UNIT_LABELS) as SedationDoseUnit[];
const OTHER_ROUTES = (Object.keys(ROUTE_LABELS) as SedationRoute[]).filter((r) => r !== 'INHALED');
const TICK_MS = 30_000;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-xs font-medium text-muted sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink tabular-nums">{children}</dd>
    </div>
  );
}

/** Qué se puede registrar ahora, en el orden de la hoja. */
export function availableActions(sheet: SedationSheet | null, role: ClinicRole | null): Action[] {
  const writer = role === 'DENTIST' || role === 'ADMIN';
  const vitals = writer || role === 'ASSISTANT';
  if (!sheet) return writer ? ['ASSESS'] : [];
  if (sheet.discharge) return [];
  const out: Action[] = [];
  if (!sheet.checklist) {
    if (writer) out.push('CHECKLIST');
    if (vitals) out.push('VITALS');
    return out;
  }
  if (vitals) out.push('VITALS');
  if (writer) out.push('AGENT', 'DISCHARGE');
  return out;
}

function nowHHmm(clock: SedeClock | null): string {
  if (!clock) return '';
  const minute = wallMinuteOfDay(new Date(), clock.timeZone);
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** «HH:MM» de hoy en la sede → ISO; sin reloj o sin hora, el servidor usa «ahora». */
function timeToIso(time: string, clock: SedeClock | null): string | undefined {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!clock || !m) return undefined;
  return wallInstant(
    wallDay(new Date(), clock.timeZone),
    Number(m[1]) * 60 + Number(m[2]),
    clock.timeZone,
  ).toISOString();
}

const NUMBER_RULES = {
  fastingLiquids: { min: 0, max: 72, decimals: 1 },
  fastingSolids: { min: 0, max: 72, decimals: 1 },
  weight: { min: 0.1, max: 399, decimals: 1 },
  height: { min: 30, max: 250, decimals: 1 },
  spo2: { min: 50, max: 100 },
  heartRate: { min: 20, max: 250 },
  systolic: { min: 40, max: 300 },
  diastolic: { min: 20, max: 200 },
  respiratoryRate: { min: 2, max: 80 },
  etco2: { min: 0, max: 150 },
  n2oPercent: { min: 10, max: 70 },
  flow: { min: 0.5, max: 15, decimals: 1 },
  dose: { min: 0.01, max: 10000, decimals: 2 },
  aldrete: { min: 0, max: 10 },
} as const;
type NumberField = keyof typeof NUMBER_RULES;

/**
 * Hoja de sedación consciente de una evolución (DX-407): lo registrado
 * (valoración, checklist, fármacos, constantes y egreso) y, según el estado y
 * el rol, el formulario de la parte siguiente. El servidor valida con la
 * plantilla y devuelve la hoja entera; el aviso de intervalo sin toma se
 * recalcula cada 30 s con el `nextDueAt` del servidor.
 */
export function SedationModal({
  open,
  onOpenChange,
  token,
  patientId,
  entryId,
  entryDateLabel,
  role,
  userId,
  staff,
  clock,
  onSaved,
}: SedationModalProps) {
  const id = useId();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [chosen, setChosen] = useState<Action | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    getEntrySedation(token, patientId, entryId)
      .then((data) => {
        if (!cancelled) setLoad({ kind: 'ready', template: data.template, sheet: data.sheet });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ kind: 'error', message: apiErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, entryId, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, [open]);

  const sheet = load.kind === 'ready' ? load.sheet : null;
  const template = load.kind === 'ready' ? load.template : null;
  const actions = load.kind === 'ready' ? availableActions(sheet, role) : [];
  const action: Action | null = chosen && actions.includes(chosen) ? chosen : (actions[0] ?? null);

  const monitors = useMemo(() => staff.filter((m) => CLINICAL.includes(m.role)), [staff]);

  const defaultMonitor =
    monitors.find((m) => m.role === 'ASSISTANT')?.userId ?? userId ?? monitors[0]?.userId ?? '';

  function reset(next: Action | null) {
    setChosen(next);
    setText({});
    setFlags({});
    setErrors({});
    setFormError(null);
  }

  const t = (key: string, fallback = '') => text[key] ?? fallback;
  const setT = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setText((prev) => ({ ...prev, [key]: e.target.value }));
  const f = (key: string) => flags[key] ?? false;
  const setF = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFlags((prev) => ({ ...prev, [key]: e.target.checked }));

  function fieldProps(key: string) {
    return {
      'aria-invalid': errors[key] ? true : undefined,
      'aria-describedby': errors[key] ? fieldErrorId(`${id}-${key}`) : undefined,
    } as const;
  }

  /** Lee los números del formulario; marca los que no valen. */
  function numbers(keys: string[], prefix = ''): { values: Record<string, number | undefined>; bad: Record<string, string> } {
    const values: Record<string, number | undefined> = {};
    const bad: Record<string, string> = {};
    for (const key of keys) {
      const rule = NUMBER_RULES[key as NumberField];
      const parsed = parseNumber(t(prefix + key), rule);
      if (parsed === null) bad[prefix + key] = sedationCopy.invalidNumber;
      else values[key] = parsed;
    }
    return { values, bad };
  }

  function vitalsPayload(prefix: string): { values: SedationVitalsValues; bad: Record<string, string> } {
    const { values, bad } = numbers(['spo2', 'heartRate', 'systolic', 'diastolic', 'respiratoryRate', 'etco2'], prefix);
    const level = t(`${prefix}level`) as SedationLevel | '';
    return {
      values: {
        ...(values.spo2 !== undefined ? { spo2: values.spo2 } : {}),
        ...(values.heartRate !== undefined ? { heartRate: values.heartRate } : {}),
        ...(values.systolic !== undefined ? { systolic: values.systolic } : {}),
        ...(values.diastolic !== undefined ? { diastolic: values.diastolic } : {}),
        ...(values.respiratoryRate !== undefined ? { respiratoryRate: values.respiratoryRate } : {}),
        ...(values.etco2 !== undefined ? { etco2: values.etco2 } : {}),
        ...(level ? { sedationLevel: level } : {}),
      },
      bad,
    };
  }

  async function save(): Promise<SedationSheet | null> {
    if (!action || !template) return null;
    const time = timeToIso(t('time', nowHHmm(clock)), clock);
    switch (action) {
      case 'ASSESS': {
        const { values, bad } = numbers(['fastingLiquids', 'fastingSolids', 'weight', 'height']);
        const mallampati = t('mallampati');
        setErrors(bad);
        if (Object.keys(bad).length > 0) return null;
        const asa = t('asa') as AsaClass | '';
        const trim = (k: string) => t(k).trim();
        return assessSedation(token, patientId, entryId, {
          grade: t('grade', 'MINIMAL') as SedationGrade,
          ...(asa ? { asaClass: asa } : {}),
          asaEmergency: f('asaEmergency'),
          ...(trim('interconsultation') ? { highAsaInterconsultation: trim('interconsultation') } : {}),
          ...(trim('justification') ? { highAsaJustification: trim('justification') } : {}),
          ...(values.fastingLiquids !== undefined ? { fastingClearLiquidsHours: values.fastingLiquids } : {}),
          ...(values.fastingSolids !== undefined ? { fastingSolidsHours: values.fastingSolids } : {}),
          ...(mallampati ? { mallampati: Number(mallampati) } : {}),
          ...(values.weight !== undefined ? { weightKg: values.weight } : {}),
          ...(values.height !== undefined ? { heightCm: values.height } : {}),
          ...(trim('escortName') ? { escortName: trim('escortName') } : {}),
          ...(trim('escortRelationship') ? { escortRelationship: trim('escortRelationship') } : {}),
          consentConfirmed: f('consent'),
        });
      }
      case 'CHECKLIST':
        return recordSedationChecklist(
          token,
          patientId,
          entryId,
          template.checklist.map((i) => ({ code: i.code, checked: f(`item-${i.code}`) })),
        );
      case 'VITALS': {
        const { values, bad } = vitalsPayload('v-');
        setErrors(bad);
        if (Object.keys(bad).length > 0) return null;
        const phase = sheet?.checklist ? (t('phase', 'INTRA') as 'BASELINE' | 'INTRA') : 'BASELINE';
        return recordSedationVitals(token, patientId, entryId, {
          phase,
          ...(time ? { takenAt: time } : {}),
          ...values,
        });
      }
      case 'AGENT': {
        const kind = t('kind', 'NITROUS_OXIDE') as SedationAgentKind;
        const { values, bad } = numbers(kind === 'NITROUS_OXIDE' ? ['n2oPercent', 'flow'] : ['dose']);
        setErrors(bad);
        if (Object.keys(bad).length > 0) return null;
        const route = t('route') as SedationRoute | '';
        return recordSedationAgent(token, patientId, entryId, {
          kind,
          ...(time ? { administeredAt: time } : {}),
          ...(kind === 'NITROUS_OXIDE'
            ? {
                ...(values.n2oPercent !== undefined ? { n2oPercent: values.n2oPercent } : {}),
                ...(values.flow !== undefined ? { flowLpm: values.flow } : {}),
              }
            : {
                ...(t('drugName').trim() ? { drugName: t('drugName').trim() } : {}),
                ...(values.dose !== undefined ? { dose: values.dose } : {}),
                doseUnit: t('unit', 'MG') as SedationDoseUnit,
                ...(kind === 'OTHER' && route ? { route } : {}),
                ...(kind === 'ORAL' ? { route: (route || 'ORAL') as SedationRoute } : {}),
              }),
        });
      }
      case 'DISCHARGE': {
        const vitals = vitalsPayload('d-');
        const aldrete = numbers(['aldrete']);
        const bad = { ...vitals.bad, ...aldrete.bad };
        setErrors(bad);
        if (Object.keys(bad).length > 0) return null;
        const monitorId = t('monitor', defaultMonitor);
        const justification = t('sameMonitor').trim();
        return dischargeSedation(token, patientId, entryId, {
          criteria: template.dischargeCriteria.map((c) => ({ code: c.code, met: f(`crit-${c.code}`) })),
          ...(aldrete.values.aldrete !== undefined ? { aldreteScore: aldrete.values.aldrete } : {}),
          vitals: vitals.values,
          ...(time ? { dischargedAt: time } : {}),
          handedOverToName: t('handedName', sheet?.escortName ?? '').trim(),
          handedOverToRelationship: t('handedRel', sheet?.escortRelationship ?? '').trim(),
          instructionsDelivered: f('instructions'),
          monitorId,
          ...(justification ? { sameMonitorJustification: justification } : {}),
        });
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setFormError(null);
    setSavedMessage(null);
    setSubmitting(true);
    try {
      const saved = await save();
      if (!saved || !template) return;
      setLoad({ kind: 'ready', template, sheet: saved });
      setSavedMessage(sedationCopy.saved[action]);
      onSaved(saved);
      reset(null);
    } catch (err) {
      setFormError(apiErrorMessage(err, { fallback: sedationCopy.genericError, maxLength: 1200 }));
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Lectura de la hoja
  // ---------------------------------------------------------------------------

  function by(actor: { name: string | null }, iso: string) {
    return sedationCopy.byAt(actor.name, sedeTime(iso, clock));
  }

  function renderWatch(s: SedationSheet) {
    const live = liveOverdue(s.watch, now);
    if (live.overdue) {
      return (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-ink"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>{sedationCopy.overdue(live.overdueMinutes, s.watch.intervalMinutes)}</span>
        </div>
      );
    }
    if (!s.watch.active || !s.watch.nextDueAt) {
      return s.watch.missedIntervals > 0 ? (
        <p className="text-xs text-muted">{sedationCopy.missed(s.watch.missedIntervals)}</p>
      ) : null;
    }
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-ink">
        <Clock aria-hidden className="size-4 shrink-0 text-muted" />
        {sedationCopy.nextDue(sedeTime(s.watch.nextDueAt, clock))}
        {s.watch.missedIntervals > 0 ? ` ${sedationCopy.missed(s.watch.missedIntervals)}` : ''}
      </p>
    );
  }

  function renderSheet(s: SedationSheet) {
    const heading = (key: string, label: string) => (
      <h3 id={`${id}-${key}`} className="text-sm font-medium text-ink">
        {label}
      </h3>
    );
    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          {sedationCopy.status}: <span className="font-medium text-ink">{STATUS_LABELS[s.status]}</span>
          {' · '}
          {sedationCopy.template(s.templateVersion, s.vitalsIntervalMinutes)}
        </p>
        {renderWatch(s)}

        <section aria-labelledby={`${id}-assessment`} className="flex flex-col gap-2">
          {heading('assessment', sedationCopy.assessmentHeading)}
          <dl className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <Row label={sedationCopy.grade}>{GRADE_LABELS[s.grade]}</Row>
            <Row label={sedationCopy.asa}>
              {s.asaClass ? `ASA ${s.asaClass}${s.asaEmergency ? 'E' : ''}` : '—'}
            </Row>
            {s.highAsaInterconsultation || s.highAsaJustification ? (
              <Row label={sedationCopy.highAsaRead}>
                {s.highAsaInterconsultation ?? s.highAsaJustification}
              </Row>
            ) : null}
            <Row label={sedationCopy.fasting}>
              {sedationCopy.fastingLine(s.fastingClearLiquidsHours, s.fastingSolidsHours)}
            </Row>
            <Row label={sedationCopy.mallampati}>{s.mallampati ?? '—'}</Row>
            <Row label={sedationCopy.body}>{sedationCopy.bodyLine(s.weightKg, s.heightCm, s.bmi)}</Row>
            {s.naloxoneMg !== null && s.flumazenilMg !== null ? (
              <Row label={sedationCopy.reversal}>{sedationCopy.reversalLine(s.naloxoneMg, s.flumazenilMg)}</Row>
            ) : null}
            <Row label={sedationCopy.escort}>
              {s.escortName ? `${s.escortName}${s.escortRelationship ? ` (${s.escortRelationship})` : ''}` : '—'}
            </Row>
            <Row label={sedationCopy.consentRead}>{s.consentConfirmed ? sedationCopy.yes : sedationCopy.no}</Row>
          </dl>
          <p className="text-xs text-muted">{by(s.author, s.createdAt)}</p>
        </section>

        <section aria-labelledby={`${id}-checklist`} className="flex flex-col gap-2">
          {heading('checklist', sedationCopy.checklistHeading)}
          {s.checklist ? (
            <>
              <ul className="flex flex-col gap-1">
                {s.checklist.items.map((item) => (
                  <li key={item.code} className="flex items-start gap-2 text-sm text-ink">
                    {item.checked ? (
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : (
                      <span aria-hidden className="mt-0.5 inline-block size-4 shrink-0 text-center text-muted">
                        —
                      </span>
                    )}
                    <span>
                      <span className="sr-only">{item.checked ? `${sedationCopy.yes}: ` : `${sedationCopy.no}: `}</span>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">{by(s.checklist.author, s.checklist.checkedAt)}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{sedationCopy.checklistPending}</p>
          )}
        </section>

        <section aria-labelledby={`${id}-agents`} className="flex flex-col gap-2">
          {heading('agents', sedationCopy.agentsHeading)}
          {s.agents.length === 0 ? (
            <p className="text-sm text-muted">{sedationCopy.noAgents}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border">
              {s.agents.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">
                    {a.kind === 'NITROUS_OXIDE'
                      ? `N₂O ${a.n2oPercent ?? '—'} % · ${a.flowLpm === null ? '—' : formatDecimal(a.flowLpm)} l/min`
                      : `${a.drugName ?? '—'} ${a.dose === null ? '' : formatDecimal(a.dose)} ${a.doseUnit ? DOSE_UNIT_LABELS[a.doseUnit] : ''}`}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {ROUTE_LABELS[a.route]} · {by(a.author, a.administeredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${id}-vitals`} className="flex flex-col gap-2">
          {heading('vitals', sedationCopy.vitalsHeading)}
          {s.vitals.length === 0 ? (
            <p className="text-sm text-muted">{sedationCopy.noVitals}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table aria-labelledby={`${id}-vitals`} className="w-full min-w-[34rem] text-sm text-ink">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th scope="col" className="px-2 py-2 font-medium">{sedationCopy.time}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{sedationCopy.phase}</th>
                    <th scope="col" className="px-2 py-2 font-medium">SpO₂</th>
                    <th scope="col" className="px-2 py-2 font-medium">FC</th>
                    <th scope="col" className="px-2 py-2 font-medium">TA</th>
                    <th scope="col" className="px-2 py-2 font-medium">FR</th>
                    <th scope="col" className="px-2 py-2 font-medium">CO₂</th>
                    <th scope="col" className="px-2 py-2 font-medium">{sedationCopy.level}</th>
                    <th scope="col" className="px-2 py-2 font-medium">Registra</th>
                  </tr>
                </thead>
                <tbody>
                  {s.vitals.map((v) => (
                    <tr key={v.id} className="border-b border-hairline last:border-0 tabular-nums">
                      <td className="px-2 py-1.5">{sedeTime(v.takenAt, clock)}</td>
                      <td className="px-2 py-1.5">{PHASE_LABELS[v.phase]}</td>
                      <td className="px-2 py-1.5">{v.spo2 ?? '—'}</td>
                      <td className="px-2 py-1.5">{v.heartRate ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        {v.systolic !== null && v.diastolic !== null ? `${v.systolic}/${v.diastolic}` : '—'}
                      </td>
                      <td className="px-2 py-1.5">{v.respiratoryRate ?? '—'}</td>
                      <td className="px-2 py-1.5">{v.etco2 ?? '—'}</td>
                      <td className="px-2 py-1.5">{v.sedationLevel ? LEVEL_LABELS[v.sedationLevel] : '—'}</td>
                      <td className="px-2 py-1.5 text-muted">{v.author.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {s.discharge ? (
          <section aria-labelledby={`${id}-discharge`} className="flex flex-col gap-2">
            {heading('discharge', sedationCopy.dischargeHeading)}
            <dl className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <Row label={sedationCopy.criteria}>
                {s.discharge.criteria.every((c) => c.met)
                  ? s.discharge.criteria.map((c) => c.label).join(' · ')
                  : s.discharge.aldreteScore !== null
                    ? sedationCopy.aldreteRead(s.discharge.aldreteScore)
                    : '—'}
              </Row>
              <Row label={sedationCopy.handedOverTo}>
                {sedationCopy.handedRead(
                  s.discharge.handedOverToName,
                  s.discharge.handedOverToRelationship,
                  sedeTime(s.discharge.dischargedAt, clock),
                )}
              </Row>
              <Row label={sedationCopy.instructionsRead}>
                {s.discharge.instructionsDelivered ? sedationCopy.yes : sedationCopy.no}
              </Row>
              <Row label={sedationCopy.operator}>{s.discharge.operator.name ?? '—'}</Row>
              <Row label={sedationCopy.monitor}>{s.discharge.monitor.name ?? '—'}</Row>
              {s.discharge.sameMonitorJustification ? (
                <Row label={sedationCopy.sameMonitorRead}>{s.discharge.sameMonitorJustification}</Row>
              ) : null}
            </dl>
          </section>
        ) : null}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Formularios
  // ---------------------------------------------------------------------------

  const selectClass = `${fieldClass} h-11 sm:h-10`;
  const inputClass = 'h-11 tabular-nums sm:h-10';

  function numberInput(key: string, label: string, hint?: string) {
    const fieldId = `${id}-${key}`;
    return (
      <FormField htmlFor={fieldId} label={label} hint={hint} error={errors[key]}>
        <Input
          id={fieldId}
          inputMode="decimal"
          autoComplete="off"
          className={inputClass}
          value={t(key)}
          onChange={setT(key)}
          {...fieldProps(key)}
        />
      </FormField>
    );
  }

  function textInput(key: string, label: string, maxLength: number, fallback = '') {
    const fieldId = `${id}-${key}`;
    return (
      <FormField htmlFor={fieldId} label={label}>
        <Input
          id={fieldId}
          maxLength={maxLength}
          className="h-11 sm:h-10"
          value={t(key, fallback)}
          onChange={setT(key)}
        />
      </FormField>
    );
  }

  function checkbox(key: string, label: React.ReactNode) {
    return (
      <label key={key} className="flex min-h-11 items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
          checked={f(key)}
          onChange={setF(key)}
        />
        <span>{label}</span>
      </label>
    );
  }

  function timeInput(key = 'time', label: string = sedationCopy.time) {
    if (!clock) return null;
    const fieldId = `${id}-${key}`;
    return (
      <FormField htmlFor={fieldId} label={label}>
        <Input
          id={fieldId}
          type="time"
          className={inputClass}
          value={t(key, nowHHmm(clock))}
          onChange={setT(key)}
        />
      </FormField>
    );
  }

  function vitalsFields(prefix: string) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {numberInput(`${prefix}spo2`, sedationCopy.spo2)}
        {numberInput(`${prefix}heartRate`, sedationCopy.heartRate)}
        {numberInput(`${prefix}systolic`, sedationCopy.systolic)}
        {numberInput(`${prefix}diastolic`, sedationCopy.diastolic)}
        {numberInput(`${prefix}respiratoryRate`, sedationCopy.respiratoryRate)}
        {numberInput(`${prefix}etco2`, sedationCopy.etco2)}
        <div className="col-span-2 sm:col-span-3">
          <FormField htmlFor={`${id}-${prefix}level`} label={sedationCopy.level}>
            <select
              id={`${id}-${prefix}level`}
              value={t(`${prefix}level`)}
              onChange={setT(`${prefix}level`)}
              className={selectClass}
            >
              <option value="">{sedationCopy.chooseLevel}</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </div>
    );
  }

  function renderAssessForm() {
    const asa = t('asa') as AsaClass | '';
    const w = parseNumber(t('weight'), NUMBER_RULES.weight);
    const h = parseNumber(t('height'), NUMBER_RULES.height);
    const bmi = bodyMassIndex(w ?? null, h ?? null);
    const reversal = reversalDoses(w ?? null);
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField htmlFor={`${id}-grade`} label={sedationCopy.grade}>
            <select id={`${id}-grade`} value={t('grade', 'MINIMAL')} onChange={setT('grade')} className={selectClass}>
              {(Object.keys(GRADE_LABELS) as SedationGrade[]).map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABELS[g]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField htmlFor={`${id}-asa`} label={sedationCopy.asa}>
            <select id={`${id}-asa`} value={asa} onChange={setT('asa')} className={selectClass}>
              <option value="">{sedationCopy.chooseAsa}</option>
              {ASA_CLASSES.map((c) => (
                <option key={c} value={c}>
                  ASA {c}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {checkbox('asaEmergency', sedationCopy.asaEmergency)}
        {asa && HIGH_ASA.includes(asa) ? (
          <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm text-ink">{sedationCopy.highAsaHint}</p>
            <FormField htmlFor={`${id}-interconsultation`} label={sedationCopy.interconsultation}>
              <textarea
                id={`${id}-interconsultation`}
                rows={2}
                maxLength={1000}
                value={t('interconsultation')}
                onChange={setT('interconsultation')}
                className={cn(fieldClass, 'h-auto')}
              />
            </FormField>
            <FormField htmlFor={`${id}-justification`} label={sedationCopy.justification}>
              <textarea
                id={`${id}-justification`}
                rows={2}
                maxLength={1000}
                value={t('justification')}
                onChange={setT('justification')}
                className={cn(fieldClass, 'h-auto')}
              />
            </FormField>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {numberInput('fastingLiquids', sedationCopy.fastingLiquids)}
          {numberInput('fastingSolids', sedationCopy.fastingSolids)}
          <FormField htmlFor={`${id}-mallampati`} label={sedationCopy.mallampati}>
            <select id={`${id}-mallampati`} value={t('mallampati')} onChange={setT('mallampati')} className={selectClass}>
              <option value="">{sedationCopy.chooseMallampati}</option>
              {['1', '2', '3', '4'].map((m) => (
                <option key={m} value={m}>
                  {['I', 'II', 'III', 'IV'][Number(m) - 1]}
                </option>
              ))}
            </select>
          </FormField>
          {numberInput('weight', sedationCopy.weight)}
          {numberInput('height', sedationCopy.height)}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">{sedationCopy.bmi}</span>
            <output aria-live="polite" className="text-sm tabular-nums text-ink">
              {bmi === null ? '—' : formatDecimal(bmi)}
            </output>
          </div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-ink">{sedationCopy.reversal}</p>
          <p aria-live="polite" className="text-sm tabular-nums text-ink">
            {reversal ? sedationCopy.reversalLine(reversal.naloxoneMg, reversal.flumazenilMg) : '—'}
          </p>
          <p className="text-xs text-muted">{sedationCopy.reversalHint}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {textInput('escortName', sedationCopy.escortName, 120)}
          {textInput('escortRelationship', sedationCopy.escortRelationship, 60)}
        </div>
        {checkbox('consent', sedationCopy.consent)}
      </div>
    );
  }

  function renderChecklistForm(tpl: SedationTemplate, s: SedationSheet) {
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">{sedationCopy.checklistHeading}</legend>
        {tpl.checklist.map((item) =>
          checkbox(
            `item-${item.code}`,
            <>
              {item.label}
              {item.required ? null : <span className="text-muted"> (opcional)</span>}
              {item.code === 'REVERSAL_AGENTS' && s.naloxoneMg !== null && s.flumazenilMg !== null ? (
                <span className="block text-xs tabular-nums text-muted">
                  {sedationCopy.reversalLine(s.naloxoneMg, s.flumazenilMg)}
                </span>
              ) : null}
            </>,
          ),
        )}
      </fieldset>
    );
  }

  function renderVitalsForm(s: SedationSheet) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField htmlFor={`${id}-phase`} label={sedationCopy.phase}>
            <select
              id={`${id}-phase`}
              value={s.checklist ? t('phase', 'INTRA') : 'BASELINE'}
              onChange={setT('phase')}
              disabled={!s.checklist}
              className={selectClass}
            >
              <option value="BASELINE">{PHASE_LABELS.BASELINE}</option>
              {s.checklist ? <option value="INTRA">{PHASE_LABELS.INTRA}</option> : null}
            </select>
          </FormField>
          {timeInput()}
        </div>
        {vitalsFields('v-')}
      </div>
    );
  }

  function renderAgentForm() {
    const kind = t('kind', 'NITROUS_OXIDE') as SedationAgentKind;
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField htmlFor={`${id}-kind`} label={sedationCopy.agentKind}>
          <select id={`${id}-kind`} value={kind} onChange={setT('kind')} className={selectClass}>
            {AGENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {AGENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </FormField>
        {timeInput()}
        {kind === 'NITROUS_OXIDE' ? (
          <>
            {numberInput('n2oPercent', sedationCopy.n2oPercent)}
            {numberInput('flow', sedationCopy.flow)}
          </>
        ) : (
          <>
            {textInput('drugName', sedationCopy.drugName, 80)}
            {numberInput('dose', sedationCopy.dose)}
            <FormField htmlFor={`${id}-unit`} label={sedationCopy.unit}>
              <select id={`${id}-unit`} value={t('unit', 'MG')} onChange={setT('unit')} className={selectClass}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {DOSE_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField htmlFor={`${id}-route`} label={sedationCopy.route}>
              <select
                id={`${id}-route`}
                value={t('route', kind === 'ORAL' ? 'ORAL' : '')}
                onChange={setT('route')}
                className={selectClass}
              >
                {kind === 'OTHER' ? <option value="">{sedationCopy.route}</option> : null}
                {(kind === 'ORAL' ? (['ORAL', 'SUBLINGUAL'] as SedationRoute[]) : OTHER_ROUTES).map((r) => (
                  <option key={r} value={r}>
                    {ROUTE_LABELS[r]}
                  </option>
                ))}
              </select>
            </FormField>
          </>
        )}
      </div>
    );
  }

  function renderDischargeForm(tpl: SedationTemplate, s: SedationSheet) {
    const monitorId = t('monitor', defaultMonitor);
    const sameMonitor = s.grade === 'MODERATE' && monitorId !== '' && monitorId === userId;
    return (
      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium text-ink">{sedationCopy.criteria}</legend>
          <p className="text-xs text-muted">
            {sedationCopy.criteriaHint(tpl.dischargeCriteria.length, tpl.aldreteMinimum)}
          </p>
          {tpl.dischargeCriteria.map((c) => checkbox(`crit-${c.code}`, c.label))}
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {numberInput('aldrete', sedationCopy.aldrete)}
          {timeInput('time', sedationCopy.dischargedAt)}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">{sedationCopy.dischargeVitals}</legend>
          {vitalsFields('d-')}
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {textInput('handedName', sedationCopy.handedOverTo, 120, s.escortName ?? '')}
          {textInput('handedRel', sedationCopy.handedOverRelationship, 60, s.escortRelationship ?? '')}
        </div>
        {checkbox('instructions', sedationCopy.instructions)}
        <FormField htmlFor={`${id}-monitor`} label={sedationCopy.monitor}>
          <select id={`${id}-monitor`} value={monitorId} onChange={setT('monitor')} className={selectClass}>
            <option value="">{sedationCopy.chooseMonitor}</option>
            {monitors.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.fullName}
              </option>
            ))}
          </select>
        </FormField>
        {sameMonitor ? (
          <FormField htmlFor={`${id}-sameMonitor`} label={sedationCopy.sameMonitorLabel} hint={sedationCopy.sameMonitor}>
            <textarea
              id={`${id}-sameMonitor`}
              rows={2}
              maxLength={500}
              value={t('sameMonitor')}
              onChange={setT('sameMonitor')}
              className={cn(fieldClass, 'h-auto')}
            />
          </FormField>
        ) : null}
      </div>
    );
  }

  function renderForm(tpl: SedationTemplate) {
    if (!action) return null;
    return (
      <div className="flex flex-col gap-3 border-t border-hairline pt-3">
        {actions.length > 1 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">{sedationCopy.actionLegend}</legend>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <label
                  key={a}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm sm:min-h-9',
                    a === action ? 'border-primary bg-primary/5 text-ink' : 'border-border text-ink',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-action`}
                    value={a}
                    checked={a === action}
                    onChange={() => reset(a)}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  {sedationCopy.actions[a]}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <h3 className="text-sm font-medium text-ink">{sedationCopy.actions[action]}</h3>
        )}
        {action === 'ASSESS' ? renderAssessForm() : null}
        {action === 'CHECKLIST' && sheet ? renderChecklistForm(tpl, sheet) : null}
        {action === 'VITALS' && sheet ? renderVitalsForm(sheet) : null}
        {action === 'AGENT' ? renderAgentForm() : null}
        {action === 'DISCHARGE' && sheet ? renderDischargeForm(tpl, sheet) : null}
      </div>
    );
  }

  function renderBody() {
    if (load.kind === 'loading') {
      return (
        <div role="status" aria-label={sedationCopy.loading} className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }
    if (load.kind === 'error') {
      return (
        <SectionError
          title={sedationCopy.loadError}
          description={load.message}
          onRetry={() => {
            setLoad({ kind: 'loading' });
            setReloadKey((k) => k + 1);
          }}
        />
      );
    }
    const writer = role === 'DENTIST' || role === 'ADMIN';
    return (
      <>
        {savedMessage ? (
          <p role="status" className="rounded-md border border-success/40 bg-success/5 p-3 text-sm text-ink">
            {savedMessage}
          </p>
        ) : null}
        {load.sheet ? (
          renderSheet(load.sheet)
        ) : (
          <EmptyState
            title={sedationCopy.emptyTitle}
            description={writer ? sedationCopy.emptyWriter : sedationCopy.emptyReader}
          />
        )}
        {load.sheet?.discharge ? <p className="text-xs text-muted">{sedationCopy.closed}</p> : null}
        {load.sheet && !load.sheet.discharge && !writer ? (
          <p className="text-xs text-muted">{sedationCopy.readOnly}</p>
        ) : null}
        {renderForm(load.template)}
      </>
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={sedationCopy.title}
      description={sedationCopy.description(entryDateLabel)}
      onSubmit={handleSubmit}
      submitLabel={action ? sedationCopy.submit[action] : undefined}
      cancelLabel={action ? undefined : sedationCopy.close}
      hideSubmit={!action}
      submitting={submitting}
      error={formError}
      size="lg"
      touchTargets
    >
      {renderBody()}
    </FormModal>
  );
}
