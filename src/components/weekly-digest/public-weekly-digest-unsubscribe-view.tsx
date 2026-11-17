'use client';
import { useEffect, useState } from 'react';
import { LinkIcon, MailX } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  confirmWeeklyDigestUnsubscribe,
  getWeeklyDigestUnsubscribe,
  type PublicWeeklyDigestUnsubscribe,
} from '@/lib/public/weekly-digest-unsubscribe-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { PublicNotice } from '@/components/shared/public-page';
import { ClinicBrand } from '@/components/brand/clinic-brand';

export const publicWeeklyDigestUnsubscribeCopy = {
  loading: 'Cargando…',
  // Sin «Intenta de nuevo»: `SectionError` trae su propio botón.
  loadError: 'No pudimos abrir el enlace. Revisa tu conexión.',
  question: '¿Quieres dejar de recibir el resumen semanal por email?',
  explanation:
    'Es el correo con las cifras de la semana de cada sede frente a la anterior. Solo dejará de llegarte a ti: el resto de destinatarios lo sigue recibiendo.',
  confirm: 'Dejar de recibir el resumen',
  confirmError: 'No pudimos registrar tu baja. Revisa tu conexión e intenta de nuevo.',
  doneTitle: 'Ya no recibes este resumen',
  // Vale para quien se dio de baja y para quien ya no es administrador (la API
  // responde `ALREADY_OUT` en los dos casos).
  doneMessage:
    'No te enviaremos más el resumen semanal de esta clínica. Si quieres volver a recibirlo, pide a un administrador que te añada en Ajustes › Resumen semanal.',
  invalidTitle: 'El enlace no existe o caducó',
  invalidMessage:
    'Los enlaces para dejar de recibir el resumen valen 60 días. Usa el del último resumen que te llegó, o pide a un administrador que te quite en Ajustes › Resumen semanal.',
};

const copy = publicWeeklyDigestUnsubscribeCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicWeeklyDigestUnsubscribe };

/**
 * Página pública `/resumen/baja/[token]` (DX-568): un miembro del personal deja
 * de recibir el resumen semanal desde el enlace del email. Abrir el enlace
 * solo pregunta (los antivirus y previsualizadores de correo abren los enlaces
 * solos); la baja exige el botón. Repetirla es inofensivo (`ALREADY_OUT`, que
 * llega también si la persona ya no es administradora).
 * Móvil primero, como `/baja/[token]`.
 */
export function PublicWeeklyDigestUnsubscribeView({ unsubscribeToken }: { unsubscribeToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWeeklyDigestUnsubscribe(unsubscribeToken)
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
  }, [unsubscribeToken, reloadKey]);

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(false);
    try {
      setState({ kind: 'ready', data: await confirmWeeklyDigestUnsubscribe(unsubscribeToken) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: 'invalid' });
      else setConfirmError(true);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
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
          <PublicNotice headingLevel={1} icon={LinkIcon} title={copy.invalidTitle} message={copy.invalidMessage} />
        )}

        {state.kind === 'ready' && (
          <>
            <ClinicBrand variant="public" name={state.data.clinicName} logoUrl={null} />

            {state.data.status === 'ALREADY_OUT' ? (
              <div role="status">
                <PublicNotice icon={MailX} title={copy.doneTitle} message={copy.doneMessage} />
              </div>
            ) : (
              <section aria-labelledby="digest-unsubscribe-question" className="flex flex-col gap-5">
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-4">
                  <p id="digest-unsubscribe-question" className="t-title text-ink">
                    {copy.question}
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
                    <MailX aria-hidden /> {copy.confirm}
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
