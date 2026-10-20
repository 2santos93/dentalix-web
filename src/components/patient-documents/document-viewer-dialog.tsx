'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import {
  getPatientDocumentUrl,
  isImageDocument,
  PATIENT_DOCUMENT_CATEGORY_LABELS,
  type PatientDocument,
} from '@/lib/patient-documents/patient-documents-api';
import { notifyError } from '@/components/errors/notify';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const copy = {
  loading: 'Cargando el documento',
  loadError: 'No pudimos abrir el documento.',
  openInNewTab: 'Abrir en otra pestaña',
  open: 'Abrir',
  pdfOnMobile: 'En el teléfono el PDF se lee mejor a pantalla completa.',
  frameTitle: (name: string) => `Vista previa de ${name}`,
  openError: 'No pudimos abrir el documento en otra pestaña.',
};

interface DocumentViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  document: PatientDocument;
}

/**
 * Visor de un documento (DX-151). Pide una URL firmada `inline` de vida corta
 * (queda auditada como consulta) y pinta la imagen en `<img>` o el PDF en un
 * `<iframe>` sin referrer. En pantallas estrechas
 * (< 640 px) solo las imágenes se ven dentro: el PDF se abre en otra pestaña,
 * donde el visor del sistema sí es usable. El padre lo monta con `key`.
 */
export function DocumentViewerDialog({ open, onOpenChange, token, document }: DocumentViewerDialogProps) {
  const wide = useMediaQuery('(min-width: 640px)');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const image = isImageDocument(document);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setUrl(null);
      setError(null);
      try {
        const res = await getPatientDocumentUrl(token, document.patientId, document.id, 'inline');
        if (!cancelled) setUrl(res.url);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, token, document.patientId, document.id, reloadKey]);

  /**
   * La URL firmada caduca a los pocos minutos: «Abrir»/«Abrir en otra pestaña»
   * piden una nueva en cada clic. La pestaña se abre YA (dentro del gesto, para
   * que el bloqueador de ventanas no la frene) y se lleva a la URL al llegar.
   * Clic con modificador o central: el navegador usa el `href` actual.
   */
  function openFresh(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void openInNewTab();
  }

  async function openInNewTab() {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const fresh = await getPatientDocumentUrl(token, document.patientId, document.id, 'inline');
      if (tab) tab.location.replace(fresh.url);
      else window.open(fresh.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      tab?.close();
      notifyError(apiErrorMessage(err, copy.openError), { onRetry: () => void openInNewTab() });
    }
  }

  let body: React.ReactNode;
  if (error) {
    body = <SectionError description={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  } else if (!url) {
    body = (
      <div role="status" aria-label={copy.loading}>
        <Skeleton className="h-[50dvh] w-full" />
      </div>
    );
  } else if (image) {
    body = (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada de otro origen y de vida corta: next/image no aporta nada aquí.
      <img
        src={url}
        alt={document.originalName}
        referrerPolicy="no-referrer"
        className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-lg border border-border bg-bg object-contain"
      />
    );
  } else if (wide) {
    body = (
      // SIN `sandbox` a propósito (DX-151, decisión del controlador): Chromium
      // bloquea su visor de PDF dentro de cualquier marco aislado y el PDF sale
      // en blanco. Controles compensatorios: la API solo firma tipos de la lista
      // blanca y los sirve con `nosniff`, y las imágenes van en `<img>`.
      <iframe
        src={url}
        referrerPolicy="no-referrer"
        title={copy.frameTitle(document.originalName)}
        className="h-[70dvh] w-full rounded-lg border border-border bg-bg"
      />
    );
  } else {
    body = (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-bg p-4">
        <p className="text-sm text-muted">{copy.pdfOnMobile}</p>
        <Button asChild className="min-h-11 w-full">
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={openFresh}>
            <ExternalLink aria-hidden />
            {copy.open}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="break-words [overflow-wrap:anywhere]">{document.originalName}</DialogTitle>
          <DialogDescription>{PATIENT_DOCUMENT_CATEGORY_LABELS[document.category]}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0">{body}</div>
        {url && (image || wide) ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={openFresh}
            className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ExternalLink className="size-4" aria-hidden />
            {copy.openInNewTab}
          </a>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
