'use client';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getPaymentProofUrl, isImageProof, type PaymentProofUrl } from '@/lib/payments/payment-proof-api';
import { SectionError } from '@/components/errors/section-error';
import { SignedFileViewerDialog } from '@/components/shared/signed-file-viewer-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

// Copy como constantes (i18n-ready).
export const paymentProofViewerCopy = {
  action: 'Ver comprobante',
  title: 'Comprobante del cobro',
  description: 'La captura que se guardó con el abono. La URL es de vida corta y cada consulta queda auditada.',
  loading: 'Cargando el comprobante',
  loadError: 'No pudimos abrir el comprobante.',
};
const copy = paymentProofViewerCopy;

interface PaymentProofViewerDialogProps {
  token: string;
  paymentId: string;
  onClose: () => void;
}

/**
 * Visor del comprobante de un abono (DX-389): pide la URL firmada `inline` al
 * abrir (la API devuelve también el nombre y el tipo, que el visor necesita
 * antes de pintar) y la reutiliza para el primer pintado; «Abrir en otra
 * pestaña» pide una nueva. El padre lo monta con `key` por apertura.
 */
function PaymentProofViewerDialog({ token, paymentId, onClose }: PaymentProofViewerDialogProps) {
  const [first, setFirst] = useState<PaymentProofUrl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // La URL ya pedida: el visor la consume en su primera carga (una sola consulta auditada).
  const prefetched = useRef<PaymentProofUrl | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPaymentProofUrl(token, paymentId, 'inline')
      .then((res) => {
        if (cancelled) return;
        prefetched.current = res;
        setError(null);
        setFirst(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, paymentId, reloadKey]);

  const loadUrl = useCallback(async () => {
    const ready = prefetched.current;
    if (ready) {
      prefetched.current = null;
      return ready;
    }
    return getPaymentProofUrl(token, paymentId, 'inline');
  }, [token, paymentId]);

  if (first) {
    return (
      <SignedFileViewerDialog
        open
        onOpenChange={(next) => !next && onClose()}
        name={first.name}
        description={copy.description}
        image={isImageProof(first.mime)}
        loadUrl={loadUrl}
      />
    );
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <SectionError
            description={error}
            onRetry={() => {
              setError(null);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : (
          <div role="status" aria-label={copy.loading}>
            <Skeleton className="h-[50dvh] w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * «Ver comprobante» para cualquier pantalla de abonos (plan, estado de cuenta,
 * caja y recibo): `open(paymentId)` abre el visor y `dialog` se pinta una vez
 * en la pantalla. Solo ADMIN y recepción llegan aquí (la API lo vuelve a
 * exigir: 403 al resto).
 */
export function usePaymentProofViewer(token: string): {
  open: (paymentId: string) => void;
  dialog: React.ReactNode;
} {
  const [target, setTarget] = useState<{ paymentId: string; seq: number } | null>(null);
  const open = useCallback((paymentId: string) => setTarget((t) => ({ paymentId, seq: (t?.seq ?? 0) + 1 })), []);
  const dialog = target ? (
    <PaymentProofViewerDialog
      key={target.seq}
      token={token}
      paymentId={target.paymentId}
      onClose={() => setTarget(null)}
    />
  ) : null;
  return { open, dialog };
}
