import * as React from 'react';
import { summarizeConditions, type Condition } from '@/lib/clinical/clinical-types';

const copy = {
  si: (n: number) => `${n} Sí`,
  no: (n: number) => `${n} No`,
  desconoce: (n: number) => `${n} No sabe`,
  sinResponder: (n: number) => `${n} sin responder`,
};

/**
 * «1 Sí · 3 No · 1 No sabe · 10 sin responder». Lo no contestado va en texto
 * atenuado y NUNCA se suma a «No»: la ausencia de una condición en la versión
 * es «Sin responder».
 */
export function ConditionSummaryText({ conditions }: { conditions: readonly Condition[] | null | undefined }) {
  const s = summarizeConditions(conditions);
  const answered = [
    s.si > 0 && copy.si(s.si),
    s.no > 0 && copy.no(s.no),
    s.desconoce > 0 && copy.desconoce(s.desconoce),
  ].filter((part): part is string => !!part);
  return (
    <span>
      {answered.length > 0 && <span className="text-ink">{answered.join(' · ')}</span>}
      {answered.length > 0 && s.sinResponder > 0 && <span className="text-muted"> · </span>}
      {s.sinResponder > 0 && <span className="text-muted">{copy.sinResponder(s.sinResponder)}</span>}
    </span>
  );
}
