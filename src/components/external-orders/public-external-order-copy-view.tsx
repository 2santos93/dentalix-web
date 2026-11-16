'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download, FileCheck2, LinkIcon, SearchX } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  downloadPublicExternalOrderCopy,
  EXTERNAL_ORDER_COPY_LINK_USED,
  EXTERNAL_ORDER_KIND_LABELS,
  getPublicExternalOrderCopy,
  type ExternalOrderKind,
  type PublicExternalOrderCopy,
} from '@/lib/external-orders/external-orders-api';
import { saveBlob } from '@/lib/files/save-blob';
import { documentFormat, NO_DOCUMENT_FORMAT, type DocumentFormat } from '@/lib/format/document-format';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { PublicNotice, publicBrandStyle } from '@/components/shared/public-page';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Skeleton } from '@/components/ui/skeleton';

/** Título de la copia por tipo, como lo lee el paciente. */
const PUBLIC_KIND_TITLES: Record<ExternalOrderKind, string> = {
  IMAGING: 'Orden de estudios de imagen',
  LAB: 'Orden de laboratorio clínico',
  SPECIALIST: 'Referencia a especialista',
  OTHER: 'Orden externa',
};

// Copy as constants (i18n-ready, es-first).
export const publicExternalOrderCopyCopy = {
  loading: 'Abriendo tu orden…',
  title: (kind: ExternalOrderKind, number: string) => `${PUBLIC_KIND_TITLES[kind]} nº ${number}`,
  kind: 'Tipo',
  issued: 'Emitida el',
  expires: 'El enlace caduca el',
  onceHint:
    'El enlace solo sirve una vez: al descargar, guarda el PDF en tu teléfono o en tu computador y llévalo al centro.',
  download: 'Descargar PDF',
  downloadError: 'No pudimos descargar tu orden. Revisa tu conexión e intenta de nuevo.',
  downloadedTitle: 'Descarga iniciada',
  downloadedMessage: 'Guarda el PDF: este enlace ya no sirve otra vez. Si necesitas otra copia, pídesela a la clínica.',
  usedTitle: 'Este enlace ya se usó',
  usedMessage: 'Este enlace ya se usó; pide a la clínica que te lo reenvíe.',
  notFoundTitle: 'Este enlace no es válido',
  notFoundMessage:
    'Puede que haya caducado, que la clínica te haya enviado otro más reciente o que el enlace esté incompleto. Si necesitas la orden, pídesela a la clínica.',
  loadError: 'No pudimos abrir tu orden. Revisa tu conexión.',
  tooManyTitle: 'Demasiados intentos',
  tooManyMessage: 'Espera un minuto antes de volver a abrirla.',
  fileName: (number: string) => `orden-${number}.pdf`,
};

const copy = publicExternalOrderCopyCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; tooMany: boolean }
  | { kind: 'notFound' }
  | { kind: 'ready'; data: PublicExternalOrderCopy }
  | { kind: 'downloaded'; data: PublicExternalOrderCopy };

function isLinkUsed(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 410 || err.code === EXTERNAL_ORDER_COPY_LINK_USED);
}

/** Fecha con el formato de la sede de la orden; sin él, «—» (nunca el del navegador). */
function dateOf(format: DocumentFormat | null, iso: string): string {
  return format ? format.fmt.date(new Date(iso), format.timeZone) : NO_DOCUMENT_FORMAT;
}

/**
 * Página pública `/orden/copia/[token]` (DX-572): el paciente (o su
 * responsable) descarga UNA vez el PDF de su orden de estudios o referencia,
 * con la nota clínica, para llevarlo al centro. Abrir el enlace solo lee (los
 * previsualizadores del correo lo abren solos); «Descargar» es un POST que lo
 * gasta. Ya usado: «Este enlace ya se usó». Inválido o caducado: el aviso
 * genérico. Sin red o 429, escalón 1 con reintento. Móvil primero.
 */
export function PublicExternalOrderCopyView({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicExternalOrderCopy(token)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: 'notFound' });
        else setState({ kind: 'error', tooMany: err instanceof ApiError && err.status === 429 });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const data = state.kind === 'ready' || state.kind === 'downloaded' ? state.data : null;
  const format = useMemo(() => (data ? documentFormat(data.format) : null), [data]);

  async function handleDownload(current: PublicExternalOrderCopy) {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, fileName } = await downloadPublicExternalOrderCopy(token);
      const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
      saveBlob(pdf, fileName ?? copy.fileName(current.numberLabel));
      setState({ kind: 'downloaded', data: current });
    } catch (err) {
      if (isLinkUsed(err)) setState({ kind: 'ready', data: { ...current, status: 'USED' } });
      else if (err instanceof ApiError && err.status === 404) setState({ kind: 'notFound' });
      else setDownloadError(copy.downloadError);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas" style={publicBrandStyle(data?.clinic)}>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            title={state.tooMany ? copy.tooManyTitle : undefined}
            description={state.tooMany ? copy.tooManyMessage : copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'notFound' && (
          <PublicNotice headingLevel={1} icon={SearchX} title={copy.notFoundTitle} message={copy.notFoundMessage} />
        )}

        {data ? (
          <>
            {data.clinic ? <ClinicBrand name={data.clinic.name} logoUrl={data.clinic.logoUrl} variant="public" as="p" /> : null}

            {state.kind === 'ready' && data.status === 'USED' ? (
              <div role="status" data-testid="public-external-order-copy-used">
                <PublicNotice headingLevel={1} icon={LinkIcon} title={copy.usedTitle} message={copy.usedMessage} />
              </div>
            ) : (
              <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-6">
                <h1 className="t-display break-words">{copy.title(data.kind, data.numberLabel)}</h1>
                <DescriptionList columns={1}>
                  <DescriptionItem label={copy.kind}>{EXTERNAL_ORDER_KIND_LABELS[data.kind]}</DescriptionItem>
                  <DescriptionItem label={copy.issued} numeric>
                    {dateOf(format, data.issuedAt)}
                  </DescriptionItem>
                  <DescriptionItem label={copy.expires} numeric>
                    {dateOf(format, data.expiresAt)}
                  </DescriptionItem>
                </DescriptionList>

                {state.kind === 'downloaded' ? (
                  <div role="status" data-testid="public-external-order-copy-downloaded">
                    <PublicNotice icon={FileCheck2} title={copy.downloadedTitle} message={copy.downloadedMessage} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted">{copy.onceHint}</p>
                    <Button
                      type="button"
                      size="lg"
                      className="h-12 w-full"
                      loading={downloading}
                      disabled={downloading}
                      onClick={() => void handleDownload(data)}
                    >
                      <Download aria-hidden /> {copy.download}
                    </Button>
                    {downloadError ? <InlineError>{downloadError}</InlineError> : null}
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
