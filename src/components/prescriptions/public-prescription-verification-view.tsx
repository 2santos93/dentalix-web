'use client';
import { useEffect, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileX, SearchX, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  formatVerificationCode,
  getPublicPrescriptionVerification,
  verificationDate,
  type PublicPrescriptionVerification,
} from '@/lib/prescriptions/prescription-verification';
import { NO_DOCUMENT_FORMAT } from '@/lib/format/document-format';
import { PublicNotice } from '@/components/shared/public-page';
import { SectionError } from '@/components/errors/section-error';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready, es-first).
export const publicPrescriptionVerificationCopy = {
  loading: 'Comprobando la receta…',
  validTitle: 'Receta válida',
  validMessage:
    'La emitió esta clínica y no está anulada. Compruebe que los datos coinciden con la receta en papel.',
  issuedOn: 'Fecha de emisión',
  professional: 'Profesional',
  license: 'Registro profesional',
  clinic: 'Clínica',
  patient: 'Paciente',
  voidedTitle: (date: string | null) => (date ? `Receta anulada el ${date}` : 'Receta anulada'),
  voidedMessage: 'No es válida para dispensar.',
  unverifiableTitle: 'No se puede verificar',
  unverifiableMessage: 'No se puede verificar; contacte con la clínica que emitió la receta.',
  notFoundTitle: 'No encontramos esta receta',
  notFoundMessage:
    'Revise que el código esté completo o contacte con la clínica que emitió la receta.',
  loadError: 'No pudimos comprobar la receta. Revise su conexión.',
  tooManyTitle: 'Demasiadas consultas',
  tooManyMessage: 'Espere un minuto antes de volver a comprobar.',
  code: 'Código de verificación',
};

const copy = publicPrescriptionVerificationCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; tooMany: boolean }
  | { kind: 'notFound' }
  | { kind: 'ready'; data: PublicPrescriptionVerification };

/** El código tal como se imprime (agrupado), sea cual sea su forma en la URL. */
function displayCode(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Una URL con un `%` suelto: se muestra tal cual.
  }
  return formatVerificationCode(decoded.replace(/[\s-]/g, '').toUpperCase());
}

/**
 * El día de la anulación, o `null` si la sede no da formato: la frase pierde
 * la fecha en lugar de acabar en «—» (DESIGN.md › Dates and times).
 */
function voidedDate(data: PublicPrescriptionVerification): string | null {
  const date = verificationDate(data.voidedOn, data);
  return date === NO_DOCUMENT_FORMAT ? null : date;
}

const TONE = {
  success: 'bg-success-subtle text-success-text',
  neutral: 'bg-surface-sunken text-muted',
  warning: 'bg-warning-subtle text-warning-text',
} as const;

function Verdict({
  icon: Icon,
  tone,
  title,
  message,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONE;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="rx-verdict-title"
      data-testid="rx-verification"
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex items-start gap-3 px-4 py-5 sm:px-6">
        <span
          aria-hidden
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', TONE[tone])}
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="rx-verdict-title" className="t-title break-words text-ink">
            {title}
          </h1>
          <p className="text-sm text-muted">{message}</p>
        </div>
      </div>
      {children ? <div className="border-t border-border px-4 py-4 sm:px-6">{children}</div> : null}
    </section>
  );
}

/**
 * Página pública `/receta/[codigo]` (DX-467): dice si una receta impresa es
 * válida, está anulada o no se puede verificar (hash alterado). Lo mínimo
 * para una farmacia: fecha, profesional y su registro, clínica e iniciales del
 * paciente; nunca medicamentos, diagnóstico ni documento. Un código que no
 * existe (o de otra clínica) muestra la misma página genérica. Móvil primero:
 * una columna; las fechas, con el locale de la sede de la receta.
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
        else setState({ kind: 'error', tooMany: err instanceof ApiError && err.status === 429 });
      });
    return () => {
      cancelled = true;
    };
  }, [code, reloadKey]);

  const data = state.kind === 'ready' ? state.data : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
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

        {data?.status === 'VALID' && (
          <Verdict icon={ShieldCheck} tone="success" title={copy.validTitle} message={copy.validMessage}>
            <DescriptionList columns={1} layout="inline">
              <DescriptionItem label={copy.issuedOn} numeric>
                {verificationDate(data.issuedOn, data)}
              </DescriptionItem>
              <DescriptionItem label={copy.professional}>{data.professionalName}</DescriptionItem>
              <DescriptionItem label={copy.license} numeric>
                {data.professionalLicense}
              </DescriptionItem>
              <DescriptionItem label={copy.clinic}>{data.clinicName}</DescriptionItem>
              <DescriptionItem label={copy.patient}>{data.patientInitials}</DescriptionItem>
            </DescriptionList>
          </Verdict>
        )}

        {data?.status === 'VOIDED' && (
          <Verdict
            icon={FileX}
            tone="neutral"
            title={copy.voidedTitle(voidedDate(data))}
            message={copy.voidedMessage}
          />
        )}

        {data?.status === 'UNVERIFIABLE' && (
          <Verdict
            icon={ShieldAlert}
            tone="warning"
            title={copy.unverifiableTitle}
            message={copy.unverifiableMessage}
          />
        )}

        {data && (
          <p className="text-center text-xs text-muted">
            {copy.code}: <span className="t-data font-mono text-ink">{displayCode(code)}</span>
          </p>
        )}
      </main>
    </div>
  );
}
