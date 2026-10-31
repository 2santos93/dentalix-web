'use client';
import * as React from 'react';
import { RotateCw } from 'lucide-react';
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
  /**
   * Reintento del envío junto al banner, para un fallo que no es del
   * formulario (sin red, servidor caído): la Way-Out Rule de DESIGN.md.
   * Reenvía lo que ya está escrito; no aparece en errores de validación.
   */
  errorRetry?: { label: string; onRetry: () => void } | null;
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
  /**
   * Bajo `sm` (<640px) el modal es una hoja a pantalla completa con el pie
   * pegado abajo y la primaria a todo el ancho. `false` lo deja flotante
   * (confirmaciones de dos líneas).
   */
  fullScreenOnMobile?: boolean;
  /**
   * El formulario valida TODOS sus campos él mismo (rung 4, junto a cada
   * campo): no queda ni la red de seguridad del navegador para los campos de
   * texto `required`. Ver `submitWithFallback`.
   */
  ownValidation?: boolean;
}

/**
 * El formulario del modal es `noValidate`: un `required` nativo de una
 * casilla o un grupo de radios (`Checkbox`, `RadioGroup`, que pintan su propio
 * error) nunca se adelanta a la validación del formulario. Los campos de texto
 * (`input`, `textarea`, `select`) con `required`/`pattern` conservan el aviso
 * del navegador como red de seguridad mientras su pantalla no valide ella misma
 * (`ownValidation`).
 */
function firstNativeInvalidTextControl(form: HTMLFormElement): HTMLElement | null {
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'hidden') continue;
    } else if (!(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement)) {
      continue;
    }
    if (el.willValidate && !el.validity.valid) return el;
  }
  return null;
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
  errorRetry = null,
  size = 'default',
  destructive = false,
  touchTargets = false,
  onCloseAutoFocus,
  lockCloseWhileSubmitting = false,
  fullScreenOnMobile = true,
  ownValidation = false,
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
        fullScreenOnMobile={fullScreenOnMobile}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* `min-w-0`: el diálogo es grid y sus hijos tienen `min-width: auto`;
            sin él, una tabla ancha dentro de su marco con scroll (QA DX-407:
            la de constantes a 390 px) ensancha el formulario entero en vez de
            desplazarse dentro de su marco. */}
        {/* `noValidate`: un `required` nativo de RadioGroup o Checkbox no se
            adelanta a la validación propia (ver firstNativeInvalidTextControl). */}
        <form
          onSubmit={(event) => {
            const invalid = ownValidation ? null : firstNativeInvalidTextControl(event.currentTarget);
            if (invalid) {
              event.preventDefault();
              (invalid as HTMLInputElement).reportValidity();
              return;
            }
            onSubmit(event);
          }}
          noValidate
          className="flex min-w-0 flex-col gap-4"
        >
          {error ? (
            <div
              ref={errorRef}
              tabIndex={-1}
              className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
            >
              <InlineError variant="summary">{error}</InlineError>
              {errorRetry ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={submitting}
                  onClick={errorRetry.onRetry}
                >
                  <RotateCw aria-hidden="true" />
                  {errorRetry.label}
                </Button>
              ) : null}
            </div>
          ) : null}
          {children}
          <div
            data-slot="form-modal-footer"
            className={cn(
              'flex flex-col gap-2',
              // En la hoja del teléfono el pie se queda abajo mientras se
              // desplaza el formulario (la primaria, a todo el ancho, siempre a mano).
              // El fondo y el filete llegan a los bordes de la pantalla con
              // sombras (16 px, el padding del diálogo) y no con `-mx-4`: un
              // margen negativo ensanchaba el formulario 16 px (scrollWidth).
              fullScreenOnMobile &&
                'max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mb-4 max-sm:mt-auto max-sm:border-t max-sm:border-border-subtle max-sm:bg-surface max-sm:pt-3 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:shadow-[-16px_0_0_0_var(--color-surface),16px_0_0_0_var(--color-surface),-16px_-1px_0_0_var(--color-border-subtle),16px_-1px_0_0_var(--color-border-subtle)]',
            )}
          >
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
