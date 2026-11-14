'use client';
import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { saveBlob } from '@/lib/files/save-blob';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';

const copy = {
  warning:
    'Guárdalos ahora: no volveremos a mostrarlos. Cada uno sirve una sola vez si pierdes el móvil.',
  listLabel: 'Códigos de recuperación',
  copy: 'Copiar',
  copied: 'Copiados',
  download: 'Descargar',
  fileName: 'dentalix-codigos-de-recuperacion.txt',
  fileHeader: 'Códigos de recuperación de Dentalix. Cada uno sirve una sola vez.',
  saved: 'Ya guardé mis códigos en un lugar seguro',
};

/**
 * Los códigos de recuperación, que solo existen en esta respuesta (DX-021).
 * `saved` lo controla quien lo usa: sin confirmar no se puede seguir.
 */
export function RecoveryCodesPanel({
  codes,
  saved,
  onSavedChange,
}: {
  codes: string[];
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles: quedan «Descargar» y seleccionar a mano.
    }
  }

  function handleDownload() {
    saveBlob(
      new Blob([`${copy.fileHeader}\n\n${codes.join('\n')}\n`], { type: 'text/plain' }),
      copy.fileName,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout tone="warning" role="note">
        {copy.warning}
      </Callout>
      <ul
        aria-label={copy.listLabel}
        data-testid="mfa-recovery-codes"
        className="grid select-all grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-border bg-surface-sunken px-3 py-2 font-mono text-sm tabular-nums text-ink sm:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
          {copied ? <Check /> : <Copy />} {copied ? copy.copied : copy.copy}
        </Button>
        <Button type="button" variant="secondary" onClick={handleDownload}>
          <Download /> {copy.download}
        </Button>
      </div>
      <Checkbox
        label={copy.saved}
        checked={saved}
        onChange={(e) => onSavedChange(e.target.checked)}
      />
    </div>
  );
}
