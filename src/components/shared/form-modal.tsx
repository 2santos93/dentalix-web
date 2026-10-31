'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineError } from '@/components/errors/inline-error';
import { cn } from '@/lib/utils';

interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** The form fields. */
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  cancelLabel?: string;
  /** In-flight state: spinner on submit, both actions disabled. */
  submitting?: boolean;
  /** Independent of `submitting` — e.g. required fields missing. */
  submitDisabled?: boolean;
  /**
   * Explica junto a la acción qué falta para poder enviar. `null` = nada que
   * explicar ahora, pero el hueco se conserva; `undefined` = sin hueco.
   */
  submitHint?: string | null;
  /**
   * Nothing can be saved in the current state (e.g. the data it edits failed
   * to load, or the record does not admit the change): the footer keeps only
   * the way out.
   */
  hideSubmit?: boolean;
  /**
   * Top-of-form error banner (names the problem). When it appears it is
   * scrolled into view and focused: in a long form the submit button sits far
   * below it, and an off-screen banner reads as "nothing happened".
   */
  error?: string | null;
  /** `lg` widens for denser, multi-column forms. */
  size?: 'default' | 'lg';
  /** Renders the submit as a destructive action. */
  destructive?: boolean;
  /**
   * DX-395: por debajo de `sm` (móvil) los campos, selectores y botones del
   * modal miden al menos 44 px de alto, el mínimo táctil de DESIGN.md. Para
   * los formularios que se usan de pie en el mostrador (el abono).
   */
  touchTargets?: boolean;
  /**
   * A dónde va el foco al cerrar. Por defecto vuelve a quien abrió el modal;
   * si ese elemento desaparece (p. ej. la tarjeta que se descartó), quien
   * llama lo lleva a otro sitio con `event.preventDefault()`.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Mientras `submitting`, la X tampoco cierra (y se ve deshabilitada), igual
   * que Cancelar. Para envíos que no se pueden abandonar a medias; quien llama
   * bloquea también Escape y el fondo en su `onOpenChange`.
   */
  lockCloseWhileSubmitting?: boolean;
}

/**
 * Altura táctil (44 px) en móvil para todo control del modal; las casillas y
 * los radios conservan su tamaño (su etiqueta ya da el área táctil).
 */
const TOUCH_TARGETS =
  'max-sm:[&_input:not([type=checkbox]):not([type=radio])]:h-11 max-sm:[&_select]:h-11 max-sm:[&_button]:min-h-11';

/**
 * The standard "create / edit a thing" modal: a form with a titled header, an
 * optional error banner, the fields, and a Cancel + primary action footer.
 * Replaces the inline show/hide form pattern — a focused task gets protected
 * focus instead of shoving the page around.
 */
export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = 'Guardar',
  cancelLabel = 'Cancelar',
  submitting = false,
  submitDisabled = false,
  submitHint,
  hideSubmit = false,
  error,
  size = 'default',
  destructive = false,
  touchTargets = false,
  onCloseAutoFocus,
  lockCloseWhileSubmitting = false,
}: FormModalProps) {
  const submitHintId = React.useId();
  const errorRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!error) return;
    const el = errorRef.current;
    // `?.` porque jsdom no implementa scrollIntoView.
    el?.scrollIntoView?.({ block: 'nearest' });
    el?.focus({ preventScroll: true });
  }, [error]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(size === 'lg' && 'max-w-2xl', touchTargets && TOUCH_TARGETS)}
        onCloseAutoFocus={onCloseAutoFocus}
        closeDisabled={lockCloseWhileSubmitting && submitting}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* `min-w-0`: el diálogo es grid y sus hijos tienen `min-width: auto`;
            sin él, una tabla ancha dentro de su marco con scroll (QA DX-407:
            la de constantes a 390 px) ensancha el formulario entero en vez de
            desplazarse dentro de su marco. */}
        <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
          {error ? (
            <div
              ref={errorRef}
              tabIndex={-1}
              className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
            >
              <InlineError variant="summary">{error}</InlineError>
            </div>
          ) : null}
          {children}
          <div className="flex flex-col gap-2">
            {/* Con la prop (aunque valga null) el hueco queda reservado —dos
                líneas en móvil, una desde sm— para que la explicación cambie o
                se vacíe sin mover el pie ni el resto del diálogo. */}
            {submitHint !== undefined ? (
              <p
                id={submitHintId}
                aria-hidden={submitHint ? undefined : true}
                className="min-h-10 text-sm text-muted sm:min-h-5"
              >
                {submitHint}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>
                  {cancelLabel}
                </Button>
              </DialogClose>
              {hideSubmit ? null : (
                <Button
                  type="submit"
                  variant={destructive ? 'destructive' : 'default'}
                  loading={submitting}
                  disabled={submitDisabled}
                  aria-describedby={submitHint ? submitHintId : undefined}
                >
                  {submitLabel}
                </Button>
              )}
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
