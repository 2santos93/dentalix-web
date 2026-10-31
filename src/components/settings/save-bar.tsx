'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import { cn } from '@/lib/utils';

export const saveBarCopy = {
  dirty: 'Cambios sin guardar',
  saving: 'Guardando…',
  discard: 'Descartar',
  save: 'Guardar',
  leave: 'Hay cambios sin guardar. ¿Salir igualmente?',
};

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface SettingsDraft<T> {
  /** Lo que la persona está editando. */
  draft: T;
  setDraft: React.Dispatch<React.SetStateAction<T>>;
  /** Mezcla campos en el borrador (formularios de objeto). */
  update: (patch: Partial<T>) => void;
  /** El borrador difiere de lo guardado. */
  dirty: boolean;
  /** Vuelve a lo guardado. */
  discard: () => void;
  /** Tras guardar: lo guardado pasa a ser `next` (o el borrador actual). */
  commit: (next?: T) => void;
}

/**
 * Borrador de un formulario de ajustes frente a lo guardado. `saved` es lo que
 * devolvió la API: si cambia (se recarga) y NO hay cambios pendientes, el
 * borrador lo sigue; con cambios pendientes, el borrador manda (no se pisa lo
 * que la persona escribió).
 *
 * Mientras hay cambios, cerrar o recargar la pestaña pregunta antes de salir.
 */
export function useSettingsDraft<T>(saved: T, equals: (a: T, b: T) => boolean = sameValue): SettingsDraft<T> {
  const [base, setBase] = React.useState<T>(saved);
  const [draft, setDraft] = React.useState<T>(saved);
  const [seen, setSeen] = React.useState<T>(saved);

  // Ajuste de estado durante el render (patrón de React para «props que
  // cambian»): lo guardado cambió por fuera.
  if (!equals(seen, saved)) {
    setSeen(saved);
    setBase(saved);
    if (equals(draft, base)) setDraft(saved);
  }

  const dirty = !equals(draft, base);

  React.useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = React.useCallback((patch: Partial<T>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);
  const discard = React.useCallback(() => setDraft(base), [base]);
  const commit = React.useCallback(
    (next?: T) => {
      const value = next === undefined ? draft : next;
      setBase(value);
      setDraft(value);
    },
    [draft],
  );

  return { draft, setDraft, update, dirty, discard, commit };
}

export interface SaveBarProps {
  /** Hay cambios sin guardar: la barra se ve. */
  dirty: boolean;
  saving?: boolean;
  onDiscard: () => void;
  /**
   * id del `<form>` que «Guardar» envía (`type="submit" form=…`): la
   * validación y el `onSubmit` siguen en el formulario. Sin `form`, `onSave`.
   */
  form?: string;
  onSave?: () => void;
  /** Error del último guardado (rung 4, `InlineError`), dentro de la barra. */
  error?: string | null;
  saveLabel?: string;
  /** Nombre accesible de «Guardar» cuando la página tiene varias barras. */
  saveAriaLabel?: string;
  className?: string;
}

/**
 * La barra «Cambios sin guardar · Descartar · Guardar» (DESIGN.md → Settings
 * pages → Saving). Va al FINAL del formulario, dentro de la columna: es
 * `sticky bottom` dentro del área que se desplaza, así que mientras haya
 * cambios se queda al pie de la ventana y, al llegar al final, descansa en su
 * sitio. Sin cambios no se pinta nada: nunca un «Guardar» deshabilitado a la
 * vista.
 *
 * El contenedor vivo (`aria-live`) está siempre montado para que el lector de
 * pantalla anuncie «Cambios sin guardar» al aparecer.
 */
export function SaveBar({
  dirty,
  saving = false,
  onDiscard,
  form,
  onSave,
  error,
  saveLabel = saveBarCopy.save,
  saveAriaLabel,
  className,
}: SaveBarProps) {
  const visible = dirty || saving || Boolean(error);
  return (
    <div aria-live="polite" className={cn('sticky bottom-3 z-10', className)}>
      {visible ? (
        <div
          role="region"
          aria-label={saveBarCopy.dirty}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-overlay sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-ink">{saving ? saveBarCopy.saving : saveBarCopy.dirty}</p>
            {error ? <InlineError className="text-sm">{error}</InlineError> : null}
          </div>
          <div className="flex gap-2 max-sm:[&>*]:flex-1">
            <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving}>
              {saveBarCopy.discard}
            </Button>
            <Button
              type={form ? 'submit' : 'button'}
              form={form}
              onClick={form ? undefined : onSave}
              loading={saving}
              disabled={saving}
              aria-label={saveAriaLabel}
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
