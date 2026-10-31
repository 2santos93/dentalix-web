'use client';
import * as React from 'react';
import { Loader2, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface RowAction {
  /** Texto del ítem. Nombra la ACCIÓN, no el objeto: "Desactivar", no "Estado". */
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Quita o inutiliza algo. Se tinta en rojo solo al enfocarlo. */
  destructive?: boolean;
  /** Traza una línea encima de este ítem: separa lo que edita de lo que quita. */
  separatorBefore?: boolean;
}

interface RowActionsProps {
  /** Nombre accesible del disparador. DEBE identificar la fila —"Acciones de
   * Ana Ruiz"—: veinte botones llamados "Acciones" hacen inservible la lista
   * de un lector de pantalla. */
  label: string;
  actions: RowAction[];
  /** Hay una acción de esta fila en vuelo: el disparador gira y se bloquea. */
  busy?: boolean;
  className?: string;
}

/**
 * Las acciones de una fila, detrás de un botón de tres puntos.
 *
 * Por qué un menú y no botones sueltos: con dos o tres acciones por fila, la
 * columna de acciones acaba pesando más que los datos, y en móvil los empuja
 * fuera de la pantalla. Recogidas aquí, la tabla vuelve a ser una tabla —que es
 * lo que se viene a leer— y las acciones siguen a un gesto de distancia.
 *
 * Va `relative z-10` porque estas filas suelen llevar un enlace estirado con
 * `after:absolute after:inset-0` (ver `staff-view`): sin esto, el pseudo-
 * elemento del enlace quedaría por encima y se tragaría el clic del menú.
 */
export function RowActions({
  label,
  actions,
  busy = false,
  className,
}: RowActionsProps) {
  const trigger = React.useRef<HTMLButtonElement>(null);
  const pending = React.useRef<(() => void) | null>(null);

  // La acción elegida corre DESPUÉS de que el menú se cierre y devuelva el foco
  // a su «⋯»: si abre un Dialog, el diálogo recuerda el «⋯» (no la opción, que
  // desaparece) y al cerrarse el foco vuelve a la fila, no a <body>.
  const runPending = React.useCallback(() => {
    const run = pending.current;
    pending.current = null;
    run?.();
  }, []);

  if (actions.length === 0) {
    // Sin acciones no se pinta un botón muerto: un disparador que abre un menú
    // vacío es peor que no tener botón. La celda se queda con su guion.
    return <span className="text-sm text-muted">—</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={label}
        disabled={busy}
        className={cn(
          'relative z-10 inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg text-muted transition-colors',
          'hover:bg-surface-sunken hover:text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
          // Mientras el menú está abierto el botón se queda marcado: si no,
          // con el foco dentro del panel nada indica de qué fila salió.
          'data-[state=open]:bg-surface-sunken data-[state=open]:text-ink',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <MoreHorizontal className="size-4" aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          if (!pending.current) return;
          event.preventDefault();
          trigger.current?.focus();
          runPending();
        }}
      >
        {actions.map((action, i) => (
          <React.Fragment key={action.label}>
            {action.separatorBefore && i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={action.disabled}
              destructive={action.destructive}
              onSelect={() => {
                pending.current = action.onSelect;
                // Red de seguridad: si el menú no avisa del cierre, corre igual.
                window.setTimeout(runPending, 0);
              }}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
