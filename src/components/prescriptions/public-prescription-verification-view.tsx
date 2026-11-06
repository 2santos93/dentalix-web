'use client';
import { useEffect, useState } from 'react';
import { Ban, CircleCheck, FileQuestion, ShieldAlert, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { documentFormat, documentTexts } from '@/lib/format/document-format';
import {
  getPublicPrescriptionVerification,
  groupVerificationCode,
  type PublicPrescriptionVerification,
} from '@/lib/prescriptions/prescription-verification';
import { PublicNotice } from '@/components/shared/public-page';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const copy = {
  eyebrow: 'Verificación de receta',
  loading: 'Comprobando la receta…',
  // Sin «Intente de nuevo.»: `SectionError` trae su botón.
  loadError: 'No pudimos comprobar la receta. Revise su conexión.',
  loadErrorTitle: 'No pudimos comprobar la receta.',
  notFoundTitle: 'Receta no encontrada',
  notFoundMessage:
    'No encontramos ninguna receta con este código. Revise que el código esté completo o contacte con la clínica.',
  throttledTitle: 'Espere un momento',
  throttledMessage: 'Demasiadas comprobaciones seguidas desde esta conexión. Vuelva a abrir el enlace en un minuto.',
  valid: 'Receta válida',
  validHint: 'La receta es auténtica y no está anulada.',
  voided: (date: string) => `Receta anulada el ${date}`,
  voidedHint: 'No es válida para dispensar.',
  unverifiable: 'No se puede verificar; contacte con la clínica',
  unverifiableHint: 'La receta guardada no coincide con su huella: no la dispense sin hablar con la clínica.',
  issuedAt: 'Fecha de emisión',
  professional: 'Profesional',
  license: 'Nº de registro profesional',
  clinic: 'Clínica',
  patient: 'Paciente',
  code: 'Código',
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'notFound' }
  | { kind: 'throttled' }
  | { kind: 'ready'; data: PublicPrescriptionVerification };

const TONES = {
  success: 'bg-success-subtle text-success-text',
  neutral: 'bg-surface-sunken text-muted',
  danger: 'bg-danger-subtle text-danger-text',
} as const;

function Verdict({
  icon: Icon,
  tone,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <article
      aria-labelledby="rx-verdict"
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface px-4 py-6 sm:px-6"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', TONES[tone])}>
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="rx-verdict" className="text-xl font-semibold tracking-tight text-ink tabular-nums">
            {title}
          </h1>
          <p className="text-sm text-muted">{hint}</p>
        </div>
      </div>
      {children}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-border-subtle pt-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-base font-medium text-ink tabular-nums wrap-anywhere sm:text-right">{value}</dd>
    </div>
  );
}

function Result({ data }: { data: PublicPrescriptionVerification }) {
  // La fecha con el formato de la sede de la receta (DX-354), nunca el del
  // navegador; sin formato, «—» (la fecha es el sujeto de la frase).
  const texts = documentTexts(documentFormat(data.regional));
  switch (data.state) {
    case 'VALID':
      return (
        <Verdict icon={CircleCheck} tone="success" title={copy.valid} hint={copy.validHint}>
          <dl className="flex flex-col gap-3">
            <Field label={copy.issuedAt} value={texts.date(data.issuedAt)} />
            <Field label={copy.professional} value={data.professionalName ?? '—'} />
            <Field label={copy.license} value={data.professionalLicense ?? '—'} />
            <Field label={copy.clinic} value={data.clinicName ?? '—'} />
            <Field label={copy.patient} value={data.patientInitials ?? '—'} />
          </dl>
        </Verdict>
      );
    case 'VOIDED':
      return <Verdict icon={Ban} tone="neutral" title={copy.voided(texts.date(data.voidedAt))} hint={copy.voidedHint} />;
    case 'UNVERIFIABLE':
      return <Verdict icon={ShieldAlert} tone="danger" title={copy.unverifiable} hint={copy.unverifiableHint} />;
  }
}

/**
 * Página pública `/receta/[código]` (DX-467): quien tiene la receta (la
 * farmacia) la comprueba con el código o el QR impreso. La clínica sale del
 * host. Solo dice si es válida (con fecha, profesional y su registro, clínica
 * e iniciales del paciente), si está anulada (y cuándo) o si no se puede
 * verificar; nunca lo prescrito. Móvil primero: una columna.
 */
export function PublicPrescriptionVerificationView({ code }: { code: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicPrescriptionVerification(code)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: 'notFound' });
        else if (err instanceof ApiError && err.status === 429) setState({ kind: 'throttled' });
        else setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [code, reloadKey]);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8 sm:max-w-lg">
        <p className="text-sm font-medium text-muted">{copy.eyebrow}</p>

        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            title={copy.loadErrorTitle}
            description={copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'notFound' && (
          <PublicNotice headingLevel={1} icon={FileQuestion} title={copy.notFoundTitle} message={copy.notFoundMessage} />
        )}

        {state.kind === 'throttled' && (
          <PublicNotice headingLevel={1} icon={Timer} title={copy.throttledTitle} message={copy.throttledMessage} />
        )}

        {state.kind === 'ready' && <Result data={state.data} />}

        <p className="text-xs text-muted">
          {copy.code}: <span className="font-mono tracking-wider text-ink">{groupVerificationCode(code)}</span>
        </p>
      </main>
    </div>
  );
}
