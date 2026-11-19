'use client';
import * as React from 'react';
import { NotebookPen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const selectionBarCopy = {
  region: 'Pacientes seleccionados',
  count: (n: number) => (n === 1 ? '1 seleccionado' : `${n} seleccionados`),
  clear: 'Quitar selección',
  register: (n: number) => `Registrar intento (${n})`,
};
const copy = selectionBarCopy;

/**
 * DX-465: la barra de la selección múltiple de la lista de recall. Va pegada
 * al pie de la pantalla mientras hay algo marcado (también a 390 px, dentro
 * del alcance del pulgar) y descansa al final de la lista.
 */
export function RecallSelectionBar({
  count,
  onRegister,
  onClear,
}: {
  count: number;
  onRegister: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={copy.region}
      className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-canvas px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-3 sm:mx-0 sm:rounded-xl sm:border sm:bg-surface sm:pb-3"
    >
      <p aria-live="polite" className="mr-auto text-sm font-medium text-ink tabular-nums">
        {copy.count(count)}
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        <X aria-hidden />
        {copy.clear}
      </Button>
      <Button type="button" size="sm" onClick={onRegister} className="max-sm:w-full">
        <NotebookPen aria-hidden />
        {copy.register(count)}
      </Button>
    </div>
  );
}
