'use client';
import * as React from 'react';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import {
  AnswerGroup,
  AnswerSection,
  TRI_STATE_CHOICES,
  answerOfChoice,
  choiceOf,
} from '@/components/clinical/answer-group';
import { type Habits } from '@/lib/clinical/clinical-types';

const copy = {
  legend: 'Hábitos e higiene oral',
  hint: 'Como las condiciones: lo que no se preguntó queda «Sin responder», nunca «No».',
  smokes: 'Fuma', perDay: 'Cigarrillos por día', years: 'Años fumando',
  drinks: 'Consume alcohol', frequency: 'Frecuencia',
  substances: 'Consume sustancias psicoactivas',
  bruxism: 'Bruxismo',
  brushingsPerDay: 'Cepillados por día', floss: 'Usa hilo dental',
  mouthwash: 'Usa enjuague bucal', fluorideToothpaste: 'Usa crema dental con flúor',
};

type Hygiene = NonNullable<Habits['higieneOral']>;

/** Quita las claves `undefined` de un objeto; `undefined` si no queda ninguna. */
function prune<T extends object>(obj: T): T | undefined {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

const numberOrUndefined = (raw: string) => (raw === '' ? undefined : Number(raw));

/**
 * Hábitos de la anamnesis del personal. Cada pregunta es Sí / No / No sabe
 * (como las condiciones) con «Sin responder» por defecto: un hábito que nadie
 * preguntó no se envía y nunca se guarda como «No».
 */
export function HabitsEditor({ value, onChange }: { value: Habits; onChange: (n: Habits) => void }) {
  const ids = useId();
  const emit = (next: Habits) => onChange(prune(next) ?? {});

  const setSmoking = (choice: string) => {
    const estado = answerOfChoice(choice);
    emit({
      ...value,
      tabaquismo: estado === undefined ? undefined : { ...value.tabaquismo, estado },
    });
  };
  const patchSmoking = (patch: Partial<NonNullable<Habits['tabaquismo']>>) =>
    emit({ ...value, tabaquismo: { estado: 'SI', ...value.tabaquismo, ...patch } });

  const setAlcohol = (choice: string) => {
    const estado = answerOfChoice(choice);
    emit({ ...value, alcohol: estado === undefined ? undefined : { ...value.alcohol, estado } });
  };
  const patchHygiene = (patch: Partial<Hygiene>) =>
    emit({ ...value, higieneOral: prune({ ...value.higieneOral, ...patch }) });

  const hygieneQuestion = (key: 'hilo' | 'enjuague' | 'cremaConFluor', label: string) => (
    <AnswerGroup
      id={`${ids}-${key}`}
      legend={label}
      value={choiceOf(value.higieneOral?.[key])}
      choices={TRI_STATE_CHOICES}
      onChange={(a) => patchHygiene({ [key]: answerOfChoice(a) })}
    />
  );

  return (
    <AnswerSection title={copy.legend} description={<p>{copy.hint}</p>}>
      <AnswerGroup
        id={`${ids}-tabaco`}
        legend={copy.smokes}
        value={choiceOf(value.tabaquismo?.estado)}
        choices={TRI_STATE_CHOICES}
        onChange={setSmoking}
      >
        {value.tabaquismo?.estado === 'SI' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField htmlFor={`${ids}-tabaco-porDia`} label={copy.perDay}>
              <Input id={`${ids}-tabaco-porDia`} type="number" inputMode="numeric" min={0}
                value={value.tabaquismo?.porDia ?? ''}
                onChange={(e) => patchSmoking({ porDia: numberOrUndefined(e.target.value) })} />
            </FormField>
            <FormField htmlFor={`${ids}-tabaco-anios`} label={copy.years}>
              <Input id={`${ids}-tabaco-anios`} type="number" inputMode="numeric" min={0}
                value={value.tabaquismo?.anios ?? ''}
                onChange={(e) => patchSmoking({ anios: numberOrUndefined(e.target.value) })} />
            </FormField>
          </div>
        )}
      </AnswerGroup>

      <AnswerGroup
        id={`${ids}-alcohol`}
        legend={copy.drinks}
        value={choiceOf(value.alcohol?.estado)}
        choices={TRI_STATE_CHOICES}
        onChange={setAlcohol}
      >
        {value.alcohol?.estado === 'SI' && (
          <FormField htmlFor={`${ids}-alcohol-frecuencia`} label={copy.frequency}>
            <Input id={`${ids}-alcohol-frecuencia`} value={value.alcohol?.frecuencia ?? ''}
              onChange={(e) =>
                emit({ ...value, alcohol: { estado: 'SI', ...value.alcohol, frecuencia: e.target.value } })
              } />
          </FormField>
        )}
      </AnswerGroup>

      <AnswerGroup
        id={`${ids}-sustancias`}
        legend={copy.substances}
        value={choiceOf(value.sustancias)}
        choices={TRI_STATE_CHOICES}
        onChange={(a) => emit({ ...value, sustancias: answerOfChoice(a) })}
      />

      <AnswerGroup
        id={`${ids}-bruxismo`}
        legend={copy.bruxism}
        value={choiceOf(value.bruxismo)}
        choices={TRI_STATE_CHOICES}
        onChange={(a) => emit({ ...value, bruxismo: answerOfChoice(a) })}
      />

      <li className="border-b border-border-subtle py-3">
        <FormField htmlFor={`${ids}-cepillados`} label={copy.brushingsPerDay}>
          <Input id={`${ids}-cepillados`} type="number" inputMode="numeric" min={0} className="sm:max-w-32"
            value={value.higieneOral?.cepilladoPorDia ?? ''}
            onChange={(e) => patchHygiene({ cepilladoPorDia: numberOrUndefined(e.target.value) })} />
        </FormField>
      </li>
      {hygieneQuestion('hilo', copy.floss)}
      {hygieneQuestion('enjuague', copy.mouthwash)}
      {hygieneQuestion('cremaConFluor', copy.fluorideToothpaste)}
    </AnswerSection>
  );
}
