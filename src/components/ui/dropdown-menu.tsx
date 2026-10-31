'use client';
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Menú desplegable sobre Radix — el átomo que faltaba para sacar las acciones
 * de las filas de una tabla.
 *
 * Se apoya en Radix y no en un `<details>` o un `useState` propio por lo que
 * cuesta hacer bien a mano: foco atrapado y devuelto al disparador al cerrar,
 * navegación con flechas, Escape, type-ahead, cierre al hacer clic fuera, y
 * `aria-expanded`/`aria-haspopup` correctos. Además va en un portal, así que el
 * menú no lo recorta el `overflow-x-auto` del contenedor de la tabla — que es
 * exactamente donde un dropdown posicionado en absoluto se corta por la mitad.
 *
 * El panel usa `shadow-overlay`: en este sistema la sombra señala una capa por
 * encima, nunca decora (DESIGN.md, "The Flat-By-Default Rule").
 */
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'dm-content z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-overlay',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  /** Acción que quita algo. Tinta el texto en `danger` SOLO al enfocar/pasar
   * por encima: un menú con una línea roja permanente grita antes de que nadie
   * haya decidido nada. */
  destructive?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        // `data-highlighted` es el estado de Radix que unifica ratón y teclado:
        // usar `hover:` dejaría la navegación con flechas sin resaltar.
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink outline-none transition-colors',
        'data-[highlighted]:bg-surface-2',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted',
        destructive &&
          'data-[highlighted]:bg-danger-subtle data-[highlighted]:text-danger-text [&_svg]:data-[highlighted]:text-danger-text',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Opción marcable (DX-121: profesionales visibles en la agenda). Radix le da
 * `role="menuitemcheckbox"` y `aria-checked`; la marca va a la izquierda.
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg py-2 pl-8 pr-2.5 text-sm text-ink outline-none transition-colors',
        'data-[highlighted]:bg-surface-2',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-4 items-center justify-center rounded border border-border">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3 text-primary" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-hairline', className)}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-2.5 pb-1 pt-2 t-overline',
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
};
