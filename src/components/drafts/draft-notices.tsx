'use client';
import { CloudOff, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import type { FormDraft } from '@/lib/drafts/use-form-draft';
import type { ResilientSubmit } from '@/lib/drafts/use-resilient-submit';

export const draftCopy = {
  recoverTitle: (time: string) => `Recuperar borrador de las ${time}`,
  recoverBody:
    'Lo que escribiste quedó guardado en este equipo. Recuperarlo solo rellena el formulario: no se guarda en la historia hasta que pulses «Guardar».',
  recover: 'Recuperar',
  discard: 'Descartar',
  locked: 'Hay un borrador guardado en este equipo; se podrá recuperar cuando vuelva la conexión.',
  offlineSaved: 'Sin conexión; se guardó en este dispositivo.',
  offlineNotSaved: 'Sin conexión; no se pudo guardar en este dispositivo.',
  offlineSavedBody: 'Se enviará al volver la conexión.',
  offlineNotSavedBody: 'No cierres esta ventana: se enviará al volver la conexión.',
  retrying: 'Volvió la conexión; guardando…',
};

/** «14:05»: la hora del equipo (el borrador es de este equipo), en 24 h. */
export function draftTime(savedAt: number): string {
  const d = new Date(savedAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Aviso al abrir un formulario con borrador (DX-574): «Recuperar» solo
 * rellena; «Descartar» lo borra. Sin conexión al recargar no se puede
 * descifrar todavía: se dice y se ofrece al volver la red.
 */
export function DraftRecoveryCallout<T>({
  draft,
  onRestore,
}: {
  draft: Pick<FormDraft<T>, 'pending' | 'locked' | 'restore' | 'discard'>;
  /** Recibe el valor recuperado para rellenar el formulario. */
  onRestore: (value: T) => void;
}) {
  if (draft.locked && !draft.pending) {
    return (
      <Callout tone="neutral" icon={CloudOff} role="status">
        {draftCopy.locked}
      </Callout>
    );
  }
  if (!draft.pending) return null;
  return (
    <Callout
      tone="info"
      icon={History}
      title={<span className="tabular-nums">{draftCopy.recoverTitle(draftTime(draft.pending.savedAt))}</span>}
      action={
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const value = draft.restore();
              if (value !== null) onRestore(value);
            }}
          >
            {draftCopy.recover}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={draft.discard}>
            {draftCopy.discard}
          </Button>
        </>
      }
    >
      {draftCopy.recoverBody}
    </Callout>
  );
}

/** «Sin conexión; se guardó en este dispositivo» mientras un envío espera a la red. */
export function OfflineSaveNotice({ submit }: { submit: Pick<ResilientSubmit, 'queued' | 'retrying'> }) {
  if (submit.retrying) {
    return (
      <Callout tone="info" icon={CloudOff} role="status">
        {draftCopy.retrying}
      </Callout>
    );
  }
  if (!submit.queued) return null;
  const persisted = submit.queued.persisted;
  return (
    <Callout
      tone="warning"
      icon={CloudOff}
      role="status"
      title={persisted ? draftCopy.offlineSaved : draftCopy.offlineNotSaved}
    >
      {persisted ? draftCopy.offlineSavedBody : draftCopy.offlineNotSavedBody}
    </Callout>
  );
}
