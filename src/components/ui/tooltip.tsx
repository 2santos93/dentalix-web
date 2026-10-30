'use client';
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

/** Un proveedor por árbol (el shell lo monta); fuera de él, `Tooltip` monta el suyo. */
export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  /** Texto del tooltip. Complementa, no sustituye, el nombre accesible del disparador. */
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
}

/**
 * Tooltip (DESIGN.md → Tooltip): etiqueta breve para un control de solo icono
 * o un dato abreviado, visible al pasar el ratón Y al enfocar con teclado (lo
 * que `title=` no hace). No lleva contenido interactivo (para eso, `Popover`)
 * y nunca es la única vía al nombre: el botón conserva su `aria-label`.
 */
export function Tooltip({ content, children, side = 'top', align = 'center', delayDuration = 300 }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className="z-50 max-w-64 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-ink shadow-overlay"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
