'use client';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiErrorMessage } from '@/lib/api/error-message';

export const keepOverbookedCopy = {
  title: 'Su hora ya está ocupada',
  confirm: 'Mantener en sobrecupo',
  cancel: 'Volver',
  hint: 'Seguirá sin ocupar la hora del profesional y quedará anotado con tu nombre. Si prefieres, cierra y muévela a una hora libre.',
  error: 'No pudimos mantenerla en sobrecupo. Intenta de nuevo.',
};

/** Lo que el 409 `OVERBOOK_SLOT_TAKEN` pide confirmar. */
export interface KeepOverbookedPrompt {
  /** El mensaje de la API (la urgencia es sobrecupo y su hora ya la ocupa otra cita). */
  message: string;
  /** Reintenta lo mismo con `keepOverbooked: true`. */
  confirm: () => Promise<void>;
}

/**
 * DX-509: deshacer la llegada o reactivar una urgencia en sobrecupo cuya hora
 * ya ocupa otra cita del profesional. La API no la deja en sobrecupo sin que
 * alguien lo decida: este diálogo es esa decisión (queda auditada). Cerrar no
 * cambia nada.
 */
export function KeepOverbookedDialog({
  prompt,
  onClose,
}: {
  prompt: KeepOverbookedPrompt | null;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!prompt || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      await prompt.confirm();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, keepOverbookedCopy.error));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <ConfirmDialog
      open={prompt !== null}
      onOpenChange={(open) => {
        if (!open && !confirming) {
          setError(null);
          onClose();
        }
      }}
      title={keepOverbookedCopy.title}
      description={prompt?.message}
      confirmLabel={keepOverbookedCopy.confirm}
      cancelLabel={keepOverbookedCopy.cancel}
      onConfirm={() => void handleConfirm()}
      confirming={confirming}
      destructive={false}
      error={error}
    >
      <p className="text-sm text-muted">{keepOverbookedCopy.hint}</p>
    </ConfirmDialog>
  );
}
