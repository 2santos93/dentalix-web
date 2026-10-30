'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AnamnesisRequestCreated } from '@/lib/anamnesis/anamnesis-api';
import { AnamnesisLinkPanel } from './anamnesis-link-panel';

const copy = {
  title: 'Anamnesis por enlace',
};

interface AnamnesisSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Tras generar el enlace: la ficha relee el estado («Esperando al paciente»). */
  onCreated?: (created: AnamnesisRequestCreated) => void;
}

/**
 * «Enviar anamnesis» desde la ficha (DX-099) en un diálogo: se abre desde el
 * aviso «Sin anamnesis» de las pestañas Datos e Historia clínica y desde el
 * menú «⋯» de la cabecera, así que funciona igual en cualquier pestaña. El
 * panel es el mismo que el del detalle de la cita: explica qué pasa, genera el
 * enlace con un clic explícito (generar otro anula el anterior sin responder)
 * y lo copia o lo abre en WhatsApp. Se monta solo abierto: al cerrar, el
 * enlace se pierde, como antes (la API guarda solo su hash).
 */
export function AnamnesisSendDialog({
  open,
  onOpenChange,
  token,
  patientId,
  onCreated,
}: AnamnesisSendDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        // Sin descripción propia: el panel ya explica qué hace el enlace.
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
          </DialogHeader>
          <AnamnesisLinkPanel token={token} patientId={patientId} onCreated={onCreated} hideHeading />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
