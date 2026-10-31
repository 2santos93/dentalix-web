'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { keepOpenForNestedLayer, keepOpenWhileComboboxExpanded } from './combobox-escape';

/**
 * A side sheet / drawer built on the same Radix Dialog primitive as
 * `dialog.tsx` — so it inherits focus-trap, Esc-to-close, and
 * click-outside for free. It docks to the right on `sm+` (a slim vertical
 * drawer) and to the bottom on mobile (a bottom sheet), reusing the shared
 * `.dlg-overlay` and the `.sheet-content` motion classes in `globals.css`.
 * Used for the agenda's day / appointment panel so a frequent, contextual
 * action never pushes the calendar or scrolls the page.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('dlg-overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm', className)}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /**
     * `auto` (por defecto): hoja inferior en móvil y cajón a la derecha desde
     * `sm`. `bottom`: siempre hoja inferior (la hoja «Más» del shell).
     */
    side?: 'auto' | 'bottom';
    /** Sin la X de cierre (la hoja la cierra su propio control o el gesto). */
    hideClose?: boolean;
  }
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, onEscapeKeyDown, onInteractOutside, side = 'auto', hideClose = false, ...props }, ref) => {
  // Igual que `DialogContent`: las hojas se abren con `open` y sin
  // `SheetTrigger`, así que Radix no sabe a dónde devolver el foco al cerrar.
  // Se recuerda quién lo tenía al abrir y se le devuelve (WCAG 2.4.3).
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
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
        className={cn(
          'sheet-content fixed z-50 flex flex-col border-border bg-surface shadow-overlay',
          // Mobile: bottom sheet
          'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t',
          // sm+: right drawer, full height
          side === 'auto' &&
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[24rem] sm:rounded-none sm:border-l sm:border-t-0',
          side === 'bottom' && 'sheet-bottom',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text print:hidden">
          <X className="size-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = 'SheetContent';

/** Sticky header for a sheet — stays visible while the body scrolls. */
function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-b border-hairline bg-surface px-6 py-5',
        className,
      )}
      {...props}
    />
  );
}

/** Scrollable body region of a sheet. */
function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...props} />;
}

/** Footer action row, pinned to the bottom of the sheet. */
function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-t border-hairline bg-surface px-6 py-4', className)}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('t-title text-ink first-letter:uppercase', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-xs text-muted', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
