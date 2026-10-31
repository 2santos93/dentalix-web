'use client';
import { useEffect, useState } from 'react';
import { Download, FileCheck2, LinkIcon } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { startDownload } from '@/lib/patient-documents/download';
import {
  SIGNED_PDF_COPY_LINK_USED,
  downloadPublicSignedPdfCopy,
  getPublicSignedPdfCopy,
  type PublicSignedPdfCopy,
} from '@/lib/signature-requests/signature-requests-api';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready, es-first).
export const publicSignedCopyCopy = {
  loading: 'Cargando tu copia…',
  loadError: 'No pudimos cargar tu copia. Revisa tu conexión.',
  onceHint:
    'El enlace solo sirve una vez: al descargar, guarda el PDF en tu teléfono o en tu computador.',
  download: 'Descargar PDF',
  downloadError: 'No pudimos descargar tu copia. Revisa tu conexión e intenta de nuevo.',
  downloadedTitle: 'Descarga iniciada',
  downloadedMessage:
    'Guarda el PDF: este enlace ya no sirve otra vez. Si necesitas otra copia, pídesela a la clínica.',
  usedTitle: 'Este enlace ya se usó',
  usedMessage: 'Si necesitas otra copia del documento firmado, pídesela a la clínica.',
  invalidTitle: 'Enlace no válido',
  invalidMessage:
    'No encontramos este enlace o ya caducó. Revisa que esté completo o pide a la clínica que te envíe la copia de nuevo.',
  fallbackClinic: 'Tu clínica',
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicSignedPdfCopy }
  | { kind: 'downloaded'; data: PublicSignedPdfCopy };

function isLinkUsed(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 410 || err.code === SIGNED_PDF_COPY_LINK_USED);
}

/**
 * Página pública `/copia/[token]` (DX-443): el paciente (o su responsable)
 * descarga su copia del PDF firmado con un SEGUNDO clic. Abrir el enlace solo
 * lee (los previsualizadores del correo lo abren solos); descargar lo gasta.
 * Nada clínico en pantalla: ni el título del documento. Móvil primero: una
 * columna y el botón de 48 px a todo el ancho.
 */
export function PublicSignedCopyView({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicSignedPdfCopy(token)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { kind: 'invalid' } : { kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function handleDownload(data: PublicSignedPdfCopy) {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { url } = await downloadPublicSignedPdfCopy(token);
      startDownload(url);
      setState({ kind: 'downloaded', data });
    } catch (err) {
      if (isLinkUsed(err)) setState({ kind: 'ready', data: { ...data, state: 'USED' } });
      else if (err instanceof ApiError && err.status === 404) setState({ kind: 'invalid' });
      else setDownloadError(publicSignedCopyCopy.downloadError);
    } finally {
      setDownloading(false);
    }
  }

  const data = state.kind === 'ready' || state.kind === 'downloaded' ? state.data : null;
  const clinic = data?.clinic ?? null;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{publicSignedCopyCopy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            description={publicSignedCopyCopy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'invalid' && (
          <Notice
            icon={LinkIcon}
            title={publicSignedCopyCopy.invalidTitle}
            message={publicSignedCopyCopy.invalidMessage}
          />
        )}

        {data && (
          <>
            <header className="flex items-center gap-3">
              {clinic?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- logo de la clínica en un host arbitrario; next/image exigiría whitelistear cada dominio
                <img
                  src={clinic.logoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-lg object-contain"
                />
              )}
              <h1 className="t-title min-w-0 break-words text-ink">
                {clinic?.name ?? publicSignedCopyCopy.fallbackClinic}
              </h1>
            </header>

            {state.kind === 'downloaded' && (
              <div role="status" data-testid="public-signed-copy-downloaded">
                <Notice
                  icon={FileCheck2}
                  title={publicSignedCopyCopy.downloadedTitle}
                  message={publicSignedCopyCopy.downloadedMessage}
                />
              </div>
            )}

            {state.kind === 'ready' && data.state === 'USED' && (
              <div role="status" data-testid="public-signed-copy-used">
                <Notice
                  icon={LinkIcon}
                  title={publicSignedCopyCopy.usedTitle}
                  message={publicSignedCopyCopy.usedMessage}
                />
              </div>
            )}

            {state.kind === 'ready' && data.state === 'AVAILABLE' && (
              <section aria-labelledby="signed-copy-lead" className="flex flex-col gap-5">
                <div className="rounded-xl border border-border bg-surface px-4 py-4">
                  <p id="signed-copy-lead" className="t-title text-ink">
                    {data.message}
                  </p>
                  <p className="mt-1 text-sm text-muted">{publicSignedCopyCopy.onceHint}</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full"
                    loading={downloading}
                    disabled={downloading}
                    onClick={() => void handleDownload(data)}
                  >
                    <Download aria-hidden /> {publicSignedCopyCopy.download}
                  </Button>
                  {downloadError && <InlineError>{downloadError}</InlineError>}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
