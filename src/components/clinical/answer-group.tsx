'use client';
import * as React from 'react';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { CONDITION_UNANSWERED_LABEL } from '@/lib/clinical/clinical-types';

/** Valor del radio «Sin responder»: el dato no se guarda. */
export const UNANSWERED = '';

export interface AnswerChoice<V extends string> {
  value: V | typeof UNANSWERED;
  label: string;
}

/** Sí / No con «Sin responder» delante (hábitos, embarazo). */
export const YES_NO_CHOICES: AnswerChoice<'SI' | 'NO'>[] = [
  { value: UNANSWERED, label: CONDITION_UNANSWERED_LABEL },
  { value: 'SI', label: 'Sí' },
  { value: 'NO', label: 'No' },
];

/** `true` → «SI», `false` → «NO», ausente → «Sin responder». */
export function answerFromBoolean(value: boolean | undefined | null): 'SI' | 'NO' | typeof UNANSWERED {
  if (value === true) return 'SI';
  if (value === false) return 'NO';
  return UNANSWERED;
}

/** Lo inverso: «Sin responder» → `undefined` (el campo no se envía). */
export function booleanFromAnswer(answer: string): boolean | undefined {
  if (answer === 'SI') return true;
  if (answer === 'NO') return false;
  return undefined;
}

interface AnswerGroupProps<V extends string> {
  id: string;
  legend: React.ReactNode;
  value: V | typeof UNANSWERED;
  choices: readonly AnswerChoice<V>[];
  onChange: (value: V | typeof UNANSWERED) => void;
  hint?: React.ReactNode;
  /** Lo que se despliega bajo la pregunta cuando hay respuesta (nota, cantidades). */
  children?: React.ReactNode;
}

/**
 * Una pregunta de la anamnesis del personal: fila con hairline, la pregunta y
 * sus respuestas como tarjetas compactas. Siempre empieza en «Sin responder»
 * si el dato no está: lo que nadie preguntó nunca se pinta ni se guarda como
 * «No» (documento médico-legal). Es el único patrón de agrupación del
 * formulario: condiciones, embarazo y hábitos lo comparten.
 */
export function AnswerGroup<V extends string>({
  id,
  legend,
  value,
  choices,
  onChange,
  hint,
  children,
}: AnswerGroupProps<V>) {
  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle py-3 last:border-b-0">
      <RadioGroup
        id={id}
        legend={legend}
        value={value}
        hint={hint}
        onValueChange={(v) => onChange(v as V | typeof UNANSWERED)}
        optionsClassName={
          // Teléfono: rejilla a todo el ancho (objetivos grandes). Desde `sm`, cada
          // respuesta mide lo que su texto: la fila entera cabe en una línea.
          choices.length > 3
            ? 'grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap'
            : 'grid grid-cols-[auto_1fr_1fr] gap-2 sm:flex sm:flex-row sm:flex-wrap'
        }
      >
        {choices.map((choice, i) => (
          <RadioCard
            key={choice.value || 'unanswered'}
            id={i === 0 ? id : undefined}
            value={choice.value}
            title={choice.label}
            layout="inline"
            className="sm:min-w-24"
          />
        ))}
      </RadioGroup>
      {children}
    </li>
  );
}

/**
 * Subsección del formulario de anamnesis: título + filas con hairline. Un solo
 * estilo de agrupación (sin tarjetas por pregunta, sin cajas sueltas).
 */
export function AnswerSection({
  title,
  description,
  children,
  as: Heading = 'h4',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  as?: 'h3' | 'h4';
}) {
  // Sin aria-labelledby: un nombre de región («Medicamentos») chocaría con la
  // etiqueta de su campo («Medicamento») al buscar por etiqueta.
  return (
    <section className="flex flex-col gap-1">
      <Heading className="t-title text-ink">
        {title}
      </Heading>
      {description ? <div className="text-sm text-muted">{description}</div> : null}
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}
