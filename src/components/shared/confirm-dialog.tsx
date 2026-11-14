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

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** In-flight state on the confirm action. */
  confirming?: boolean;
  /** Etiqueta del botón mientras `confirming` (p. ej. «Deshaciendo…»); por defecto, la misma. */
  confirmingLabel?: string;
  /** Renders the confirm as a destructive (danger) action. Defaults to true. */
  destructive?: boolean;
  /** Optional error, e.g. the action failed server-side. */
  error?: string | null;
  /**
   * Al cerrar. Por defecto el foco vuelve a lo que lo tenía al abrir; si eso
   * ya no existe (p. ej. la fila que se acaba de quitar), quien llama lo
   * coloca aquí con `event.preventDefault()` para que no caiga en <body>.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /** Contenido extra entre la descripción y el error (p. ej. un aviso). */
  children?: React.ReactNode;
}

/**
 * A focused confirmation for an irreversible or destructive action. Replaces
 * inline "are you sure?" row state so the choice is unmissable and consistent.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  confirming = false,
  confirmingLabel,
  destructive = true,
  error,
  onCloseAutoFocus,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {error ? <InlineError variant="summary">{error}</InlineError> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={confirming}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            loading={confirming}
            onClick={onConfirm}
          >
            {confirming && confirmingLabel ? confirmingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
