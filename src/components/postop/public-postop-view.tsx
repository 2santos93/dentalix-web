'use client';
import { useEffect, useRef, useState } from 'react';
import { LinkIcon, Phone, TimerOff } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { getPublicPostOp, markPublicPostOpOpened, type PublicPostOp } from '@/lib/postop/postop-api';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { ClinicBrand } from '@/components/brand/clinic-brand';

const copy = {
  loading: 'Cargando tus indicaciones…',
  // Sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  loadError: 'No pudimos cargar las indicaciones. Revisa tu conexión.',
  invalidTitle: 'Enlace no válido',
  invalidMessage:
    'No encontramos este enlace. Revisa que esté completo o pide a la clínica que te lo envíe de nuevo.',
  expiredTitle: 'Este enlace ya no es válido',
  expiredMessage: 'Caducó a los 30 días. Si necesitas las indicaciones, llama a la clínica.',
  callLead: '¿Tienes dudas? Llama a la clínica:',
  footer: (code: string, version: number) => `${code} · v${version}`,
  fallbackClinic: 'Tu clínica',
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'ready'; data: PublicPostOp };

/** `tel:` solo admite dígitos y el `+` inicial. */
function telHref(phone: string): string {
  const trimmed = phone.trim();
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
}

/**
 * Página pública `/indicaciones/[token]` (DX-222): el paciente lee las
 * indicaciones que le entregó la clínica. Solo muestra la marca de la clínica,
 * el título, el texto y el teléfono de la sede: nada más del paciente ni de la
 * cita. Al pintarlas marca la primera apertura (una vez; si falla, no pasa
 * nada para el paciente). Móvil primero: una columna.
 */
export function PublicPostOpView({ linkToken }: { linkToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const markedOpened = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPublicPostOp(linkToken)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: 'invalid' });
        else if (err instanceof ApiError && err.status === 410) setState({ kind: 'expired' });
        else setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, reloadKey]);

  useEffect(() => {
    if (state.kind !== 'ready' || markedOpened.current) return;
    markedOpened.current = true;
    // Solo estadística para la clínica: un fallo no se le muestra al paciente.
    markPublicPostOpOpened(linkToken).catch(() => undefined);
  }, [state.kind, linkToken]);

  const clinic = state.kind === 'ready' ? state.data.clinic : null;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            description={copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'invalid' && (
          <Notice icon={LinkIcon} title={copy.invalidTitle} message={copy.invalidMessage} />
        )}

        {state.kind === 'expired' && (
          <Notice icon={TimerOff} title={copy.expiredTitle} message={copy.expiredMessage} />
        )}

        {state.kind === 'ready' && (
          <>
            <ClinicBrand variant="public" name={clinic?.name ?? copy.fallbackClinic} logoUrl={clinic?.logoUrl} />

            <article
              aria-labelledby="postop-title"
              className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-5"
            >
              <h2 id="postop-title" className="break-words text-lg font-semibold text-ink">
                {state.data.title}
              </h2>
              <div className="whitespace-pre-line break-words text-base leading-relaxed text-ink">
                {state.data.renderedText}
              </div>
            </article>

            {state.data.locationPhone && (
              <p className="flex flex-col gap-1 text-sm text-muted">
                {copy.callLead}
                <a
                  href={telHref(state.data.locationPhone)}
                  className="inline-flex min-h-11 items-center gap-2 self-start text-base font-semibold text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                >
                  <Phone aria-hidden className="size-5" />
                  <span className="tabular-nums">{state.data.locationPhone}</span>
                </a>
              </p>
            )}

            <footer className="mt-auto text-xs text-muted tabular-nums">
              {copy.footer(state.data.code, state.data.version)}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
