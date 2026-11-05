'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { PAYMENT_PROOF_ACCEPT, isImageProof } from '@/lib/payments/payment-proof-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { InlineError } from '@/components/errors/inline-error';
import { SingleFileField, type SingleFileUpload } from '@/components/shared/single-file-field';

// Copy como constantes (i18n-ready).
export const paymentProofFieldCopy = {
  label: 'Comprobante del cobro',
  labelRequired: 'Comprobante del cobro (obligatorio)',
  labelOptional: 'Comprobante del cobro (opcional)',
  hint: 'La captura del pago móvil o de la transferencia: JPG, PNG, WebP o PDF de hasta 10 MB. Solo la ven administración y recepción.',
  missing: 'Este medio de pago exige el comprobante del cobro. Adjúntalo para registrar el abono.',
  preview: (name: string) => `Vista previa de ${name}`,
  pdfPreview: 'PDF listo para guardar con el abono.',
  waiting: 'Espera a que termine la subida del comprobante.',
};
const copy = paymentProofFieldCopy;

/** La miniatura del comprobante elegido (imagen) o su icono (PDF). */
function ProofPreview({ file }: { file: File }) {
  const image = isImageProof(file.type);
  const [url, setUrl] = useState<string | null>(null);
  // La miniatura se lee del fichero elegido (data URL): nada que revocar y sin
  // `setState` síncrono en el efecto (el resultado llega en el callback).
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === 'string') setUrl(reader.result);
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [file, image]);

  if (!image) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <FileText aria-hidden className="size-4 shrink-0" />
        {copy.pdfPreview}
      </p>
    );
  }
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: local del fichero elegido; next/image no aplica.
    <img
      src={url}
      alt={copy.preview(file.name)}
      className="max-h-40 w-auto max-w-full self-start rounded-lg border border-border bg-surface-sunken object-contain"
    />
  );
}

interface PaymentProofFieldProps {
  id: string;
  /** `REQUIRED` marca el campo como obligatorio; `OPTIONAL`, como optativo. */
  policy: 'OPTIONAL' | 'REQUIRED';
  upload: SingleFileUpload;
  /** El error del envío (falta el comprobante): junto al campo. */
  error?: string | null;
  disabled?: boolean;
  fmt: RegionalFormat | null;
}

/**
 * El comprobante del cobro dentro de «Registrar abono» (DX-389): la subida
 * directa al almacén privado al elegirlo (progreso, cancelar, quitar y
 * reintentar, los de `SingleFileField`), con su previsualización. La HEIC del
 * iPhone se pasa a JPG antes de subir. El `uploadId` lo entrega el formulario
 * al registrar el abono (`proofUploadId`).
 */
export function PaymentProofField({ id, policy, upload, error, disabled, fmt }: PaymentProofFieldProps) {
  const file = upload.state.status === 'idle' || upload.state.status === 'preparing' ? null : upload.state.file;
  const errorId = `${id}-missing`;
  return (
    <div id={`${id}-group`} className="flex min-w-0 flex-col gap-2">
      <SingleFileField
        id={id}
        label={policy === 'REQUIRED' ? copy.labelRequired : copy.labelOptional}
        hint={copy.hint}
        accept={PAYMENT_PROOF_ACCEPT}
        upload={upload}
        disabled={disabled}
        fmt={fmt}
      />
      {file ? <ProofPreview file={file} /> : null}
      {error ? (
        <InlineError id={errorId} className="text-xs">
          {error}
        </InlineError>
      ) : null}
    </div>
  );
}
