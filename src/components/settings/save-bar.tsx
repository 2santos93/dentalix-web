'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import { cn } from '@/lib/utils';
import { useUnsavedChanges } from './unsaved-changes';

export const saveBarCopy = {
  dirty: 'Cambios sin guardar',
  saving: 'Guardando…',
  discard: 'Descartar',
  save: 'Guardar',
  discarded: 'Cambios descartados.',
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
 * Mientras hay cambios, salir pregunta antes: cerrar o recargar la pestaña
 * (aviso del navegador) y navegar dentro de la app — enlace, ⌘K o «Atrás» —
 * (diálogo de `UnsavedChangesGuard`, ver unsaved-changes.tsx).
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

  // Salir con cambios (pestaña, enlaces de la app, ⌘K, «Atrás») pregunta antes.
  useUnsavedChanges(dirty);

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
  /**
   * Lo que se anuncia al terminar bien un guardado. Sin él, la barra no
   * anuncia el guardado: la pantalla ya lo dice (toast o aviso propio).
   * «Descartar» siempre se anuncia.
   */
  savedMessage?: string;
  /**
   * Adónde vuelve el foco cuando la barra se va con el foco dentro (tras
   * «Guardar» o «Descartar»). Por defecto, el título de la sección o de la
   * página que la contiene (`SaveBarFocusScope`, que ponen `SettingsSection`
   * y `SettingsPage`): un destino con nombre, declarado con `tabIndex={-1}`.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /**
   * Tras un guardado correcto, el foco va aquí en vez de a `returnFocusTo`
   * (p. ej. el aviso «… guardados.» de la pantalla, con `tabIndex={-1}`).
   */
  savedFocusTo?: React.RefObject<HTMLElement | null>;
  className?: string;
}

type Outcome = 'saved' | 'discarded' | null;

/** El foco se perdió: está en `<body>`, en nada o en un nodo que ya no está. */
function focusIsLost(doc: Document): boolean {
  const active = doc.activeElement;
  return active === null || active === doc.body || !active.isConnected;
}

/**
 * El destino del foco cuando la barra se va: el título de la sección (o de la
 * página) que la contiene. Lo ponen `SettingsSection` y `SettingsPage`; una
 * pantalla con su propia cabecera lo envuelve con `SaveBarFocusScope`. El
 * destino lleva `tabIndex={-1}` en su JSX: la barra no toca el DOM ajeno.
 */
const SaveBarFocusTarget = React.createContext<React.RefObject<HTMLElement | null> | null>(null);

export function SaveBarFocusScope({
  target,
  children,
}: {
  target: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  return <SaveBarFocusTarget.Provider value={target}>{children}</SaveBarFocusTarget.Provider>;
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
 * pantalla anuncie «Cambios sin guardar» al aparecer, y lo que pasó al irse
 * («Cambios descartados.», o `savedMessage`).
 *
 * Foco (DX-546 · FE-110): al irse la barra con el foco dentro (o con el foco
 * ya suelto, porque «Guardar» se deshabilitó mientras guardaba), el foco va a
 * un destino con nombre —`savedFocusTo` tras guardar, `returnFocusTo`, o el
 * título de su sección o página (`SaveBarFocusScope`)—, nunca a `<body>` ni a
 * un contenedor sin nombre (DESIGN.md → «focus lands on the section heading»). Si el guardado falla, la
 * barra sigue y el foco vuelve a «Guardar» para reintentar.
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
  savedMessage,
  returnFocusTo,
  savedFocusTo,
  className,
}: SaveBarProps) {
  const scopeTarget = React.useContext(SaveBarFocusTarget);
  const visible = dirty || saving || Boolean(error);
  const liveRef = React.useRef<HTMLDivElement>(null);
  const saveRef = React.useRef<HTMLButtonElement>(null);
  // El foco estaba dentro de la barra cuando React la quitó del DOM: la
  // limpieza del ref corre antes de que el nodo salga, con el foco aún dentro.
  const focusWasInside = React.useRef(false);
  const discarding = React.useRef(false);
  const previous = React.useRef({ visible, saving });
  const [outcome, setOutcome] = React.useState<Outcome>(null);

  const regionRef = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    focusWasInside.current = false;
    return () => {
      focusWasInside.current = node.contains(node.ownerDocument.activeElement);
    };
  }, []);

  React.useEffect(() => {
    const before = previous.current;
    previous.current = { visible, saving };
    const doc = liveRef.current?.ownerDocument;
    if (!doc) return;
    if (before.visible && !visible) {
      const result: Outcome = discarding.current ? 'discarded' : before.saving ? 'saved' : null;
      discarding.current = false;
      if (focusWasInside.current || (result !== null && focusIsLost(doc))) {
        const target =
          (result === 'saved' ? savedFocusTo?.current : null) ?? returnFocusTo?.current ?? scopeTarget?.current;
        target?.focus();
      }
      focusWasInside.current = false;
      // El aviso va al contenedor vivo, que ya está montado: el lector de
      // pantalla lo anuncia.
      setOutcome(result);
      return;
    }
    if (visible && !before.visible) {
      setOutcome(null);
      return;
    }
    if (visible && before.saving && !saving && focusIsLost(doc)) saveRef.current?.focus();
  }, [visible, saving, returnFocusTo, savedFocusTo, scopeTarget]);

  const announcement =
    visible || outcome === null ? null : outcome === 'discarded' ? saveBarCopy.discarded : (savedMessage ?? null);

  return (
    // Sin cambios, el contenedor vivo sale del flujo (`absolute`): sigue en el
    // árbol de accesibilidad para anunciar la barra, pero no suma el hueco del
    // `gap` del formulario.
    <div ref={liveRef} aria-live="polite" className={cn(visible ? 'sticky bottom-3 z-10' : 'absolute', className)}>
      {announcement ? <p className="sr-only">{announcement}</p> : null}
      {visible ? (
        <div
          ref={regionRef}
          role="region"
          aria-label={saveBarCopy.dirty}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-overlay sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-ink">{saving ? saveBarCopy.saving : saveBarCopy.dirty}</p>
            {error ? <InlineError className="text-sm">{error}</InlineError> : null}
          </div>
          <div className="flex gap-2 max-sm:[&>*]:flex-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                discarding.current = true;
                onDiscard();
              }}
              disabled={saving}
            >
              {saveBarCopy.discard}
            </Button>
            <Button
              ref={saveRef}
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
