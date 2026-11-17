'use client';
import { useEffect, useState } from 'react';
import { DescriptionItem } from '@/components/ui/description-list';
import { FieldError } from '@/components/errors/field-error';
import { Skeleton } from '@/components/ui/skeleton';
import { listAppointmentTypes, type AppointmentType } from '@/lib/appointments/appointment-types-api';
import { sortPreVisitInstructions } from '@/lib/appointments/pre-visit-instructions';
import { languageName } from '@/lib/patients/patient-languages';

export const preVisitDetailCopy = {
  label: 'Indicaciones previas',
  loadError: 'No se cargaron',
};

/** `idle`: aún no ha llegado (cargando). */
export type TypesState =
  | { kind: 'idle' }
  | { kind: 'error' }
  | { kind: 'ready'; types: AppointmentType[] };

/**
 * DX-564: la agenda no carga los tipos de cita (cada cita trae solo el
 * resumen con `hasPreVisitInstructions`). La lista se pide UNA vez, la
 * primera vez que se abre una cita cuyo tipo tiene indicaciones, con los
 * inactivos (una cita puede ser de un tipo ya desactivado).
 */
export function useAppointmentTypesOnDemand(token: string, needed: boolean) {
  const [state, setState] = useState<TypesState>({ kind: 'idle' });
  const [attempt, setAttempt] = useState(0);
  // Una vez pedida, la lista se queda (no se vuelve a pedir al abrir otra cita).
  const [requested, setRequested] = useState(false);
  if (needed && !requested) setRequested(true);

  useEffect(() => {
    if (!requested) return;
    let alive = true;
    listAppointmentTypes(token, { includeInactive: true }).then(
      (types) => {
        if (alive) setState({ kind: 'ready', types });
      },
      () => {
        if (alive) setState({ kind: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [requested, token, attempt]);

  return {
    state,
    retry: () => {
      setState({ kind: 'idle' });
      setAttempt((n) => n + 1);
    },
  };
}

/**
 * La fila «Indicaciones previas» de la hoja de detalle: todas las variantes
 * del tipo con el nombre del idioma (recepción las ve para contestar por
 * teléfono). Texto, nunca HTML.
 */
export function AppointmentPreVisitInstructions({
  typeId,
  state,
  onRetry,
}: {
  typeId: string;
  state: TypesState;
  onRetry: () => void;
}) {
  if (state.kind === 'error') {
    return (
      <DescriptionItem label={preVisitDetailCopy.label}>
        <FieldError label={preVisitDetailCopy.loadError} onRetry={onRetry} className="h-9" />
      </DescriptionItem>
    );
  }
  if (state.kind !== 'ready') {
    return (
      <DescriptionItem label={preVisitDetailCopy.label}>
        <Skeleton className="h-5 w-40" />
      </DescriptionItem>
    );
  }
  const variants = state.types.find((t) => t.id === typeId)?.preVisitInstructions ?? [];
  if (variants.length === 0) return null;
  return (
    <DescriptionItem label={preVisitDetailCopy.label} data-testid="appointment-pre-visit-instructions">
      <ul className="flex flex-col gap-2">
        {sortPreVisitInstructions(variants).map((variant) => (
          <li key={variant.language} className="min-w-0">
            <span className="block text-xs text-muted">{languageName(variant.language)}</span>
            <span lang={variant.language} className="block whitespace-pre-line break-words">
              {variant.text}
            </span>
          </li>
        ))}
      </ul>
    </DescriptionItem>
  );
}
