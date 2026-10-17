'use client';
import { useEffect, useState } from 'react';
import { BellOff, LinkIcon } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { formatDate } from '@/lib/format/date';
import {
  confirmPublicReminderOptOut,
  getPublicReminderOptOut,
  type PublicReminderOptOut,
} from '@/lib/reminders/opt-out-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { PublicNotice, publicBrandStyle } from '@/components/shared/public-page';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy.
const copy = {
  loading: 'Cargando…',
  // Sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  loadError: 'No pudimos abrir el enlace. Revisa tu conexión.',
  question: (name: string | null) =>
    `${name ? `Hola ${name}, ¿quieres` : '¿Quieres'} dejar de recibir los recordatorios de tus citas?`,
  explanation:
    'Tus citas siguen igual: solo dejaremos de enviarte avisos automáticos antes de cada una. Si cambias de opinión, pídeselo a la clínica.',
  confirm: 'Dejar de recibir recordatorios',
  confirmError: 'No pudimos registrar tu baja. Revisa tu conexión e intenta de nuevo.',
  doneTitle: 'Listo: ya no recibirás recordatorios',
  doneSince: (at: string) =>
    `Desde el ${at} no te enviamos avisos automáticos de tus citas. Si quieres volver a recibirlos, pídeselo a la clínica.`,
  invalidTitle: 'Enlace no válido',
  invalidMessage:
    'No encontramos este enlace. Revisa que esté completo o comunícate con la clínica para dejar de recibir recordatorios.',
  fallbackClinic: 'Tu clínica',
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicReminderOptOut };

/**
 * Página pública `/baja/[token]` (DX-128): el paciente deja de recibir los
 * recordatorios automáticos desde el enlace del email. Abrir el enlace solo
 * pregunta (los antivirus y previsualizadores de correo abren los enlaces
 * solos); la baja exige el botón. Repetirla es inofensivo. Móvil primero.
 */
export function PublicReminderOptOutView({ optOutToken }: { optOutToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicReminderOptOut(optOutToken)
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
  }, [optOutToken, reloadKey]);

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(false);
    try {
      setState({ kind: 'ready', data: await confirmPublicReminderOptOut(optOutToken) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: 'invalid' });
      else setConfirmError(true);
    } finally {
      setConfirming(false);
    }
  }

  const clinic = state.kind === 'ready' ? state.data.clinic : null;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-bg">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
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
          <PublicNotice icon={LinkIcon} title={copy.invalidTitle} message={copy.invalidMessage} />
        )}

        {state.kind === 'ready' && (
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
              <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-ink">
                {clinic?.name ?? copy.fallbackClinic}
              </h1>
            </header>

            {state.data.status === 'OPTED_OUT' ? (
              <div role="status">
                <PublicNotice
                  icon={BellOff}
                  title={copy.doneTitle}
                  message={copy.doneSince(formatDate(state.data.optedOutAt))}
                />
              </div>
            ) : (
              <section aria-labelledby="opt-out-question" className="flex flex-col gap-5">
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-4">
                  <p id="opt-out-question" className="text-base font-semibold text-ink">
                    {copy.question(state.data.patientFirstName)}
                  </p>
                  <p className="text-sm text-muted">{copy.explanation}</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full"
                    loading={confirming}
                    disabled={confirming}
                    onClick={() => void handleConfirm()}
                  >
                    <BellOff aria-hidden /> {copy.confirm}
                  </Button>
                  {confirmError && <InlineError>{copy.confirmError}</InlineError>}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
