'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { keepOpenForNestedLayer, keepOpenWhileComboboxExpanded } from './combobox-escape';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('dlg-overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm', className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Pantalla completa bajo `sm`: arriba a la izquierda, todo el alto y ancho, sin esquinas. */
const FULL_SCREEN_ON_MOBILE =
  'max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:rounded-none max-sm:border-0 max-sm:p-4';

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /**
     * La X se ve deshabilitada y no cierra (p. ej. una escritura en vuelo que
     * no se puede cancelar). Sigue siendo enfocable: quitarle el foco a mitad
     * lo dejaría en <body>.
     */
    closeDisabled?: boolean;
    /**
     * Bajo `sm` (<640px) el diálogo ocupa la pantalla entera (sin esquinas ni
     * borde): formularios largos o que se firman en el teléfono. Desde `sm`,
     * modal centrado como siempre.
     */
    fullScreenOnMobile?: boolean;
  }
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, onEscapeKeyDown, onInteractOutside, closeDisabled = false, fullScreenOnMobile = false, ...props }, ref) => {
  // Los diálogos de la app se abren con `open` y sin `DialogTrigger`, así que
  // Radix no sabe a dónde devolver el foco al cerrar y lo deja en <body>. Se
  // recuerda el elemento que tenía el foco al abrir y se le devuelve al cerrar
  // (Esc, Cancelar o la X), como pide WCAG 2.4.3.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'dlg-content fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-surface p-6 shadow-overlay',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          fullScreenOnMobile && FULL_SCREEN_ON_MOBILE,
          className,
        )}
        data-fullscreen-mobile={fullScreenOnMobile || undefined}
        onOpenAutoFocus={(event) => {
          const active = document.activeElement;
          returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
          onOpenAutoFocus?.(event);
        }}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          keepOpenWhileComboboxExpanded(event);
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event);
          keepOpenForNestedLayer(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          const target = returnFocusRef.current;
          if (event.defaultPrevented || !target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-disabled={closeDisabled || undefined}
          // Radix no cierra si el clic ya viene con `preventDefault`.
          onClick={closeDisabled ? (e) => e.preventDefault() : undefined}
          className={cn(
            'absolute right-4 top-4 rounded-md p-1 text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text print:hidden',
            // DX-395: en móvil, «Cerrar» con el área táctil mínima (44 px).
            'max-sm:right-2 max-sm:top-2 max-sm:inline-flex max-sm:size-11 max-sm:items-center max-sm:justify-center',
            closeDisabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted',
          )}
        >
          <X className="size-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // DX-395: en móvil la «X» mide 44×44 (right-2/top-2): el título no pasa por
  // debajo de ella.
  return <div className={cn('flex flex-col gap-1.5 max-sm:pr-8', className)} {...props} />;
}

/**
 * Action row for a dialog. Reverses to a full-width stack on mobile so the
 * primary action stays thumb-reachable; right-aligned on larger screens.
 */
function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('t-title text-ink', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
