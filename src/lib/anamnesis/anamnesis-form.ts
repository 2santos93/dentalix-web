/**
 * Estado y validación del cuestionario público de anamnesis (DX-099). La
 * estructura (secciones, preguntas, seguimiento, topes) llega de la API
 * (`GET /public/medical-history/:token`), que es la misma que usa la HC del
 * personal; aquí solo se guarda lo que escribe el paciente, se valida en
 * español y se arma el cuerpo del envío. Sin React: se prueba aparte.
 */

export type AnamnesisAnswer = 'SI' | 'NO' | 'NO_SE';
export type AllergyType = 'MEDICAMENTO' | 'MATERIAL' | 'ALIMENTO' | 'AMBIENTAL';
export type AllergySeverity = 'LEVE' | 'MODERADA' | 'ANAFILAXIA';

/** Lo que este módulo necesita del cuestionario (subconjunto del DTO). */
export interface QuestionnaireShape {
  limits: { text: number; note: number; listItems: number; weeks: number; perDay: number };
  sections: { key: string; questions: { key: string }[] }[];
}

export interface AllergyDraft {
  alergeno: string;
  tipo: AllergyType | '';
  severidad: AllergySeverity;
  reaccion: string;
}
export interface MedicationDraft {
  nombre: string;
  dosis: string;
  frecuencia: string;
}
export interface SurgeryDraft {
  descripcion: string;
  fecha: string;
}

export interface AnamnesisFormState {
  /** Respuesta de cada pregunta, por su `key` del cuestionario. */
  answers: Record<string, AnamnesisAnswer | undefined>;
  allergies: AllergyDraft[];
  medications: MedicationDraft[];
  surgeries: SurgeryDraft[];
  /** Detalle opcional de cada enfermedad, por `condition:<codigo>`. */
  notes: Record<string, string>;
  anticoagulantDetail: string;
  smokingPerDay: string;
  alcoholFrequency: string;
  pregnancyWeeks: string;
  declaration: boolean;
}

export const formCopy = {
  unanswered: 'Elija Sí, No o No sé.',
  allergyMissing: 'Añada al menos una alergia o cambie la respuesta.',
  allergyName: 'Escriba a qué es alérgico.',
  allergyType: 'Elija el tipo de alergia.',
  medicationMissing: 'Añada al menos un medicamento o cambie la respuesta.',
  medicationName: 'Escriba el nombre del medicamento.',
  surgeryMissing: 'Añada al menos una cirugía u hospitalización o cambie la respuesta.',
  surgeryName: 'Describa la cirugía u hospitalización.',
  tooLong: (max: number) => `Como mucho ${max} caracteres.`,
  weeks: (max: number) => `Escriba un número de semanas de 1 a ${max}.`,
  perDay: (max: number) => `Escriba un número de cigarrillos de 0 a ${max}.`,
  declaration: 'Marque la casilla para confirmar que la información es verdadera.',
  tooManyItems: (max: number) => `Como mucho ${max} elementos.`,
};

export const emptyAllergy = (): AllergyDraft => ({
  alergeno: '',
  tipo: '',
  severidad: 'MODERADA',
  reaccion: '',
});
export const emptyMedication = (): MedicationDraft => ({ nombre: '', dosis: '', frecuencia: '' });
export const emptySurgery = (): SurgeryDraft => ({ descripcion: '', fecha: '' });

/** Formulario en blanco: sin ninguna respuesta precargada (nada de datos previos). */
export function initialFormState(): AnamnesisFormState {
  return {
    answers: {},
    allergies: [emptyAllergy()],
    medications: [emptyMedication()],
    surgeries: [emptySurgery()],
    notes: {},
    anticoagulantDetail: '',
    smokingPerDay: '',
    alcoholFrequency: '',
    pregnancyWeeks: '',
    declaration: false,
  };
}

/** Errores por campo: `key` de la pregunta, `allergies.0.alergeno`, `declaration`… */
export type FormErrors = Record<string, string>;

const trimmed = (s: string) => s.trim();

function integerIn(raw: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}

/** Todas las preguntas del cuestionario, en orden. */
export function questionKeys(q: QuestionnaireShape): string[] {
  return q.sections.flatMap((s) => s.questions.map((qq) => qq.key));
}

/**
 * Valida lo que el paciente escribió. Vacío = listo para enviar. El orden de
 * las claves es el del formulario: el primero es a donde va el foco.
 */
export function validateForm(state: AnamnesisFormState, q: QuestionnaireShape): FormErrors {
  const errors: FormErrors = {};
  const { limits } = q;
  const long = (value: string, max: number) => value.trim().length > max;
  for (const key of questionKeys(q)) {
    const answer = state.answers[key];
    if (!answer) {
      errors[key] = formCopy.unanswered;
      continue;
    }
    if (answer !== 'SI') continue;
    if (key === 'allergies') {
      const items = state.allergies.filter((a) => trimmed(a.alergeno) || a.tipo || trimmed(a.reaccion));
      if (items.length === 0) errors.allergies = formCopy.allergyMissing;
      state.allergies.forEach((a, i) => {
        const touched = trimmed(a.alergeno) || a.tipo || trimmed(a.reaccion);
        if (!touched && items.length > 0) return;
        if (!trimmed(a.alergeno)) errors[`allergies.${i}.alergeno`] = formCopy.allergyName;
        else if (long(a.alergeno, limits.text)) errors[`allergies.${i}.alergeno`] = formCopy.tooLong(limits.text);
        if (!a.tipo) errors[`allergies.${i}.tipo`] = formCopy.allergyType;
        if (long(a.reaccion, limits.text)) errors[`allergies.${i}.reaccion`] = formCopy.tooLong(limits.text);
      });
    } else if (key === 'medications') {
      const items = state.medications.filter((m) => trimmed(m.nombre) || trimmed(m.dosis) || trimmed(m.frecuencia));
      if (items.length === 0) errors.medications = formCopy.medicationMissing;
      state.medications.forEach((m, i) => {
        const touched = trimmed(m.nombre) || trimmed(m.dosis) || trimmed(m.frecuencia);
        if (!touched && items.length > 0) return;
        if (!trimmed(m.nombre)) errors[`medications.${i}.nombre`] = formCopy.medicationName;
        else if (long(m.nombre, limits.text)) errors[`medications.${i}.nombre`] = formCopy.tooLong(limits.text);
      });
    } else if (key === 'surgeries') {
      const items = state.surgeries.filter((s) => trimmed(s.descripcion) || trimmed(s.fecha));
      if (items.length === 0) errors.surgeries = formCopy.surgeryMissing;
      state.surgeries.forEach((s, i) => {
        const touched = trimmed(s.descripcion) || trimmed(s.fecha);
        if (!touched && items.length > 0) return;
        if (!trimmed(s.descripcion)) errors[`surgeries.${i}.descripcion`] = formCopy.surgeryName;
        else if (long(s.descripcion, limits.text)) {
          errors[`surgeries.${i}.descripcion`] = formCopy.tooLong(limits.text);
        }
      });
    } else if (key === 'pregnancy') {
      if (state.pregnancyWeeks.trim() && integerIn(state.pregnancyWeeks, 1, limits.weeks) === null) {
        errors['pregnancy.weeks'] = formCopy.weeks(limits.weeks);
      }
    } else if (key === 'habits.tabaquismo') {
      if (state.smokingPerDay.trim() && integerIn(state.smokingPerDay, 0, limits.perDay) === null) {
        errors['habits.tabaquismo.perDay'] = formCopy.perDay(limits.perDay);
      }
    } else if (key === 'anticoagulants') {
      if (long(state.anticoagulantDetail, limits.text)) {
        errors['anticoagulants.detail'] = formCopy.tooLong(limits.text);
      }
    } else if (key === 'habits.alcohol') {
      if (long(state.alcoholFrequency, limits.text)) {
        errors['habits.alcohol.frequency'] = formCopy.tooLong(limits.text);
      }
    } else if (key.startsWith('condition:')) {
      if (long(state.notes[key] ?? '', limits.note)) errors[`${key}.note`] = formCopy.tooLong(limits.note);
    }
  }
  if (!state.declaration) errors.declaration = formCopy.declaration;
  return errors;
}

const optional = (value: string) => {
  const t = value.trim();
  return t ? t : undefined;
};

export interface SubmitBody {
  answers: {
    allergies: {
      answer: AnamnesisAnswer;
      items?: { alergeno: string; tipo: AllergyType; severidad: AllergySeverity; reaccion?: string }[];
    };
    conditions: { codigo: string; answer: AnamnesisAnswer; nota?: string }[];
    medications: {
      answer: AnamnesisAnswer;
      items?: { nombre: string; dosis?: string; frecuencia?: string }[];
    };
    anticoagulants: { answer: AnamnesisAnswer; detail?: string };
    habits: {
      tabaquismo: { answer: AnamnesisAnswer; porDia?: number };
      alcohol: { answer: AnamnesisAnswer; frecuencia?: string };
      bruxismo: { answer: AnamnesisAnswer };
    };
    pregnancy: { answer: AnamnesisAnswer; semanas?: number };
    surgeries: { answer: AnamnesisAnswer; items?: { descripcion: string; fecha?: string }[] };
  };
  declarationAccepted: boolean;
  consent?: { policyVersionId: string; granted: boolean };
}

/**
 * El cuerpo del `POST`. Llamar solo con un formulario válido. Los seguimientos
 * de un «No» o «No sé» no se envían (aunque el paciente los hubiera escrito
 * antes de cambiar de respuesta).
 */
export function toSubmitBody(
  state: AnamnesisFormState,
  q: QuestionnaireShape,
  consentPolicyVersionId: string | null,
): SubmitBody {
  const answer = (key: string): AnamnesisAnswer => state.answers[key] ?? 'NO_SE';
  const yes = (key: string) => answer(key) === 'SI';
  const conditionKeys = questionKeys(q).filter((k) => k.startsWith('condition:'));
  return {
    answers: {
      allergies: {
        answer: answer('allergies'),
        ...(yes('allergies')
          ? {
              items: state.allergies
                .filter((a) => a.alergeno.trim())
                .map((a) => ({
                  alergeno: a.alergeno.trim(),
                  tipo: a.tipo as AllergyType,
                  severidad: a.severidad,
                  ...(optional(a.reaccion) ? { reaccion: optional(a.reaccion) } : {}),
                })),
            }
          : {}),
      },
      conditions: conditionKeys.map((key) => {
        const nota = yes(key) ? optional(state.notes[key] ?? '') : undefined;
        return {
          codigo: key.slice('condition:'.length),
          answer: answer(key),
          ...(nota ? { nota } : {}),
        };
      }),
      medications: {
        answer: answer('medications'),
        ...(yes('medications')
          ? {
              items: state.medications
                .filter((m) => m.nombre.trim())
                .map((m) => ({
                  nombre: m.nombre.trim(),
                  ...(optional(m.dosis) ? { dosis: optional(m.dosis) } : {}),
                  ...(optional(m.frecuencia) ? { frecuencia: optional(m.frecuencia) } : {}),
                })),
            }
          : {}),
      },
      anticoagulants: {
        answer: answer('anticoagulants'),
        ...(yes('anticoagulants') && optional(state.anticoagulantDetail)
          ? { detail: optional(state.anticoagulantDetail) }
          : {}),
      },
      habits: {
        tabaquismo: {
          answer: answer('habits.tabaquismo'),
          ...(yes('habits.tabaquismo') && state.smokingPerDay.trim()
            ? { porDia: Number(state.smokingPerDay.trim()) }
            : {}),
        },
        alcohol: {
          answer: answer('habits.alcohol'),
          ...(yes('habits.alcohol') && optional(state.alcoholFrequency)
            ? { frecuencia: optional(state.alcoholFrequency) }
            : {}),
        },
        bruxismo: { answer: answer('habits.bruxismo') },
      },
      pregnancy: {
        answer: answer('pregnancy'),
        ...(yes('pregnancy') && state.pregnancyWeeks.trim()
          ? { semanas: Number(state.pregnancyWeeks.trim()) }
          : {}),
      },
      surgeries: {
        answer: answer('surgeries'),
        ...(yes('surgeries')
          ? {
              items: state.surgeries
                .filter((s) => s.descripcion.trim())
                .map((s) => ({
                  descripcion: s.descripcion.trim(),
                  ...(optional(s.fecha) ? { fecha: optional(s.fecha) } : {}),
                })),
            }
          : {}),
      },
    },
    declarationAccepted: state.declaration,
    ...(consentPolicyVersionId ? { consent: { policyVersionId: consentPolicyVersionId, granted: true } } : {}),
  };
}
