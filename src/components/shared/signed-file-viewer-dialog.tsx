'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { InlineError } from '@/components/errors/inline-error';
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
  // Dentro del visor, sin toast (quedaría debajo del modal) ni botón propio:
  // el enlace es el reintento.
  openError: 'No pudimos abrir el documento en otra pestaña. Intenta de nuevo.',
};

interface SignedFileViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nombre del fichero: título del diálogo y texto alternativo de la imagen. */
  name: string;
  /** Una línea bajo el título (la categoría del documento, el gasto…). */
  description: string;
  /** JPG o PNG se pintan en `<img>`; lo demás (PDF) en un `<iframe>`. */
  image: boolean;
  /**
   * Pide una URL firmada `inline` nueva. Se llama al abrir, al reintentar y en
   * cada «Abrir en otra pestaña». Debe ser estable (`useCallback`): el visor
   * vuelve a pedirla cuando cambia.
   */
  loadUrl: () => Promise<{ url: string }>;
  /** A dónde va el foco al cerrar si el botón que abrió el visor ya no está. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Visor de un fichero guardado en el almacén (DX-151, también el soporte de un
 * gasto en DX-274). Pide una URL firmada `inline` de vida corta (queda
 * auditada como consulta) y pinta la imagen en `<img>` o el PDF en un
 * `<iframe>` sin referrer. En pantallas estrechas (< 640 px) solo las imágenes
 * se ven dentro: el PDF se abre en otra pestaña, donde el visor del sistema sí
 * es usable. El padre lo monta con `key`.
 */
export function SignedFileViewerDialog({
  open,
  onOpenChange,
  name,
  description,
  image,
  loadUrl,
  onCloseAutoFocus,
}: SignedFileViewerDialogProps) {
  const wide = useMediaQuery('(min-width: 640px)');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setUrl(null);
      setError(null);
      try {
        const res = await loadUrl();
        if (!cancelled) setUrl(res.url);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, loadUrl, reloadKey]);

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
    setOpenError(null);
    try {
      const fresh = await loadUrl();
      if (tab) tab.location.replace(fresh.url);
      else window.open(fresh.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      tab?.close();
      setOpenError(apiErrorMessage(err, copy.openError));
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
        alt={name}
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
        title={copy.frameTitle(name)}
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
      <DialogContent className="max-w-4xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="break-words [overflow-wrap:anywhere]">{name}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {openError ? <InlineError variant="summary">{openError}</InlineError> : null}
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
