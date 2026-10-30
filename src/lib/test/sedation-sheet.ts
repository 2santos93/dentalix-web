import type { SedationSheet, SedationTemplate } from '@/lib/sedation/sedation-api';

/** Plantilla de plataforma de DX-407, como la devuelve la API (tests). */
export function platformTemplate(): SedationTemplate {
  return {
    version: 'SEDATION_PLATFORM_V1',
    source: 'PLATFORM',
    vitalsIntervalMinutes: 5,
    requiredAssessment: ['ASA', 'FASTING', 'MALLAMPATI', 'WEIGHT', 'HEIGHT', 'ESCORT', 'CONSENT'],
    checklist: [
      { code: 'MONITORS_TESTED', label: 'Monitores probados (pulsioxímetro y tensiómetro)', required: true },
      { code: 'OXYGEN_SUCTION', label: 'Oxígeno y aspiración listos', required: true },
      { code: 'EMERGENCY_KIT', label: 'Kit de emergencia revisado', required: true },
      {
        code: 'REVERSAL_AGENTS',
        label: 'Reversores preparados con la dosis por peso (naloxona y flumazenil)',
        required: true,
      },
      { code: 'NO_CONTRAINDICATION', label: 'Sin contraindicación hoy', required: true },
      { code: 'TWO_ADULTS_TRANSPORT', label: 'Dos adultos para el traslado (niño en coche)', required: false },
    ],
    requiredVitals: ['SPO2', 'HEART_RATE', 'BLOOD_PRESSURE', 'RESPIRATORY_RATE', 'SEDATION_LEVEL'],
    dischargeCriteria: [
      { code: 'CARDIOVASCULAR_STABLE', label: 'Función cardiovascular satisfactoria y estable' },
      { code: 'AIRWAY_PATENT', label: 'Vía aérea permeable y estable' },
      { code: 'EASILY_AROUSABLE', label: 'Despierta con facilidad' },
      { code: 'PROTECTIVE_REFLEXES', label: 'Reflejos protectores intactos' },
      { code: 'BASELINE_SPEECH_SITTING', label: 'Habla y se sienta como antes de la sedación' },
      { code: 'HYDRATION', label: 'Hidratación adecuada' },
    ],
    aldreteMinimum: 9,
  };
}

const DENTIST = { id: 'u-dent', name: 'Dra. Ana Ríos' };

/** Hoja recién valorada (sin checklist); `overrides` la lleva a otro estado. */
export function sedationSheet(overrides: Partial<SedationSheet> = {}): SedationSheet {
  return {
    id: 'sh-1',
    patientId: 'p1',
    clinicalEntryId: 'ce-2',
    locationId: null,
    templateVersion: 'SEDATION_PLATFORM_V1',
    rulesVersion: 'SEDATION_RULES_V1',
    vitalsIntervalMinutes: 5,
    status: 'ASSESSED',
    grade: 'MODERATE',
    asaClass: 'II',
    asaEmergency: false,
    highAsaInterconsultation: null,
    highAsaJustification: null,
    fastingClearLiquidsHours: 2,
    fastingSolidsHours: 6,
    mallampati: 2,
    weightKg: 15,
    heightCm: 100,
    bmi: 15,
    naloxoneMg: 1.5,
    flumazenilMg: 0.15,
    escortName: 'Laura Ortiz',
    escortRelationship: 'Madre',
    consentConfirmed: true,
    consentId: null,
    author: DENTIST,
    createdAt: '2026-10-30T15:00:00.000Z',
    checklist: null,
    agents: [],
    vitals: [],
    discharge: null,
    watch: {
      intervalMinutes: 5,
      active: false,
      startedAt: null,
      lastTakenAt: null,
      nextDueAt: null,
      overdue: false,
      overdueMinutes: 0,
      missedIntervals: 0,
    },
    ...overrides,
  };
}

/** Checklist hecho por la dentista. */
export function checkedSheet(overrides: Partial<SedationSheet> = {}): SedationSheet {
  return sedationSheet({
    status: 'CHECKED',
    checklist: {
      id: 'ck-1',
      items: platformTemplate().checklist.map((i) => ({ code: i.code, label: i.label, checked: true })),
      author: DENTIST,
      checkedAt: '2026-10-30T15:05:00.000Z',
    },
    ...overrides,
  });
}
