'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const chairProviderOfferCopy = {
  title: (provider: string) => `¿Asignar a ${provider}?`,
  description: (chair: string, offered: string, current: string) =>
    `«${chair}» tiene a ${offered} como profesional por defecto. La cita sigue con ${current} salvo que la asignes.`,
  keep: (current: string) => `Mantener a ${current}`,
  assign: (offered: string) => `Asignar a ${offered}`,
  cancel: 'Cancelar',
};

interface ChairProviderOfferDialogProps {
  open: boolean;
  chairName: string;
  currentProviderName: string;
  offeredProviderName: string;
  /** «Mantener»: la cita se mueve con su profesional de siempre (la opción por defecto). */
  onKeep: () => void;
  /** «Asignar a X»: la cita se mueve y pasa al profesional del sillón. */
  onAssign: () => void;
  /** Cancelar, Escape o clic fuera: no se mueve nada. */
  onCancel: () => void;
}

/**
 * DX-479: al soltar una cita en un sillón con OTRO profesional por defecto.
 * Mover nunca cambia el profesional solo (en la competencia es el fallo más
 * criticado); aquí se ofrece y «Mantener» es lo que tiene el foco al abrir.
 */
export function ChairProviderOfferDialog({
  open,
  chairName,
  currentProviderName,
  offeredProviderName,
  onKeep,
  onAssign,
  onCancel,
}: ChairProviderOfferDialogProps) {
  const keepRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent
        className="max-w-md"
        data-testid="chair-provider-offer"
        onOpenAutoFocus={(event) => {
          // «Mantener» por defecto: Enter nada más abrir conserva el profesional.
          event.preventDefault();
          keepRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{chairProviderOfferCopy.title(offeredProviderName)}</DialogTitle>
          <DialogDescription>
            {chairProviderOfferCopy.description(chairName, offeredProviderName, currentProviderName)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {chairProviderOfferCopy.cancel}
          </Button>
          <Button type="button" variant="outline" onClick={onAssign}>
            {chairProviderOfferCopy.assign(offeredProviderName)}
          </Button>
          <Button ref={keepRef} type="button" onClick={onKeep}>
            {chairProviderOfferCopy.keep(currentProviderName)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
