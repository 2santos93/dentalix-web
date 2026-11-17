'use client';
import { useEffect, useState } from 'react';
import { DescriptionItem } from '@/components/ui/description-list';
import { FieldError } from '@/components/errors/field-error';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { getAppointmentType } from '@/lib/appointments/appointment-types-api';
import { sortPreVisitInstructions, type PreVisitInstruction } from '@/lib/appointments/pre-visit-instructions';
import { languageName } from '@/lib/patients/patient-languages';

export const preVisitDetailCopy = {
  label: 'Indicaciones previas',
  loadError: 'No se cargaron',
};

/** Lo que se sabe de las indicaciones de un tipo. Sin entrada: aún no ha llegado. */
export type TypeInstructionsState =
  | { kind: 'error' }
  /** 404: el tipo ya no es de esta clínica (nada que enseñar). */
  | { kind: 'missing' }
  | { kind: 'ready'; variants: PreVisitInstruction[] };

/**
 * DX-564: la agenda no carga los tipos de cita (cada cita trae solo el
 * resumen con `hasPreVisitInstructions`). Al abrir una cita cuyo tipo tiene
 * indicaciones se pide ESE tipo (`GET /appointment-types/:id`, que incluye
 * los desactivados y retirados: su texto se sigue enviando al paciente), una
 * vez por tipo mientras la agenda esté abierta.
 */
export function useAppointmentTypeInstructions(token: string, typeId: string | null) {
  const [byType, setByType] = useState<Record<string, TypeInstructionsState>>({});
  const known = typeId ? byType[typeId] : undefined;
  // Se pide si no se tiene; un fallo se queda hasta «Reintentar», que borra la entrada.
  const fetchId = typeId && !known ? typeId : null;

  useEffect(() => {
    if (!fetchId) return;
    let alive = true;
    getAppointmentType(token, fetchId).then(
      (type) => {
        if (alive) setByType((prev) => ({ ...prev, [fetchId]: { kind: 'ready', variants: type.preVisitInstructions } }));
      },
      (err: unknown) => {
        if (!alive) return;
        const state: TypeInstructionsState =
          err instanceof ApiError && err.status === 404 ? { kind: 'missing' } : { kind: 'error' };
        setByType((prev) => ({ ...prev, [fetchId]: state }));
      },
    );
    return () => {
      alive = false;
    };
  }, [fetchId, token]);

  return {
    state: known ?? null,
    retry: () => {
      if (!typeId) return;
      setByType((prev) => {
        const next = { ...prev };
        delete next[typeId];
        return next;
      });
    },
  };
}

/**
 * La fila «Indicaciones previas» de la hoja de detalle: todas las variantes
 * del tipo con el nombre del idioma (recepción las ve para contestar por
 * teléfono). Texto, nunca HTML. `state` null: cargando.
 */
export function AppointmentPreVisitInstructions({
  state,
  onRetry,
}: {
  state: TypeInstructionsState | null;
  onRetry: () => void;
}) {
  if (state?.kind === 'error') {
    return (
      <DescriptionItem label={preVisitDetailCopy.label}>
        <FieldError label={preVisitDetailCopy.loadError} onRetry={onRetry} className="h-9" />
      </DescriptionItem>
    );
  }
  if (state === null) {
    return (
      <DescriptionItem label={preVisitDetailCopy.label}>
        <Skeleton className="h-5 w-40" />
      </DescriptionItem>
    );
  }
  if (state.kind === 'missing' || state.variants.length === 0) return null;
  return (
    <DescriptionItem label={preVisitDetailCopy.label} data-testid="appointment-pre-visit-instructions">
      <ul className="flex flex-col gap-2">
        {sortPreVisitInstructions(state.variants).map((variant) => (
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
