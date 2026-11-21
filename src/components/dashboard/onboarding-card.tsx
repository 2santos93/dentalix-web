'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Circle } from 'lucide-react';
import {
  canSeeOnboarding,
  dismissOnboarding,
  getOnboardingStatus,
  readDismissedHint,
  writeDismissedHint,
  type OnboardingStatus,
  type OnboardingStep,
  type OnboardingStepKey,
} from '@/lib/onboarding/onboarding-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { apiErrorMessage } from '@/lib/api/error-message';
import { notifyError } from '@/components/errors/notify';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useLoad } from './use-load';

interface StepCopy {
  title: string;
  description: string;
  href: string;
}

export const onboardingCardCopy = {
  heading: 'Pon en marcha tu clínica',
  description: 'Cinco pasos para empezar a trabajar. Cada uno se marca solo cuando lo haces.',
  progress: (done: number, total: number) => `${done} de ${total} hechos`,
  progressLabel: 'Avance de la puesta en marcha',
  listLabel: 'Pasos de la puesta en marcha',
  optionalHeading: 'Opcional',
  done: 'Hecho',
  pending: 'Pendiente',
  dismiss: 'No mostrar más',
  loading: 'Cargando la puesta en marcha…',
  error: 'No se pudo cargar la puesta en marcha de la clínica.',
  dismissError: 'No se pudo ocultar la puesta en marcha.',
  readyTitle: 'Tu clínica está lista',
  readyDescription: 'Hiciste los cinco pasos de la puesta en marcha. Puedes cambiar cualquiera de ellos en Ajustes.',
  readyImport: 'Si traes pacientes de otro sistema, impórtalos',
  readyClose: 'Cerrar',
  steps: {
    BUSINESS_HOURS: {
      title: 'Revisa el horario de la sede',
      description: 'Los días y las horas en que atiende la clínica; la agenda se ajusta a ellos.',
      href: '/settings/horarios',
    },
    APPOINTMENT_TYPES: {
      title: 'Crea los tipos de cita',
      description: 'Limpieza, control, urgencia…: cada uno con su duración y su color.',
      href: '/settings/tipos-de-cita',
    },
    CATALOG_PRICES: {
      title: 'Pon los precios del catálogo',
      description: 'El catálogo llega sin precios; con ellos se arman los presupuestos.',
      href: '/catalog',
    },
    STAFF: {
      title: 'Invita a tu equipo',
      description: 'Odontólogos, asistentes y recepción, cada uno con su rol.',
      href: '/staff',
    },
    FIRST_APPOINTMENT: {
      title: 'Agenda la primera cita',
      description: 'Elige un paciente y un hueco en la agenda.',
      href: '/agenda',
    },
    PATIENT_IMPORT: {
      title: 'Importa tus pacientes',
      description: 'Si vienes de otro sistema o de una hoja de cálculo, súbelos de una vez.',
      href: '/settings/importar-pacientes',
    },
  } satisfies Record<OnboardingStepKey, StepCopy>,
};
const copy = onboardingCardCopy;

/**
 * «Pon en marcha tu clínica» (DX-020): los cinco pasos que dejan lista una
 * clínica nueva, y uno opcional (importar pacientes), arriba de Inicio y solo
 * para ADMIN. Nada se marca a mano: la API calcula cada paso con los datos
 * (`GET /onboarding/status`), así que al volver de crear un tipo de cita el
 * paso ya sale hecho. Cada fila abre la pantalla donde se hace.
 *
 * Con los cinco hechos, la tarjeta cambia a «Tu clínica está lista» (con el
 * opcional, si falta) hasta que el ADMIN la cierra: un cierre visible dice que
 * terminó, en vez de desaparecer sin explicación. «No mostrar más» y «Cerrar»
 * la descartan para toda la clínica (`POST /onboarding/dismiss`).
 *
 * Tiene su propio ciclo de carga: si falla, su escalón 1 con Reintentar y el
 * resto de Inicio sigue. Si falla el descarte, la tarjeta sigue (escalón 3).
 */
export function OnboardingCard({ token }: { token: string }) {
  const enabled = canSeeOnboarding(getTokenRole(token));
  const [hintDismissed] = useState(() => enabled && readDismissedHint());
  const load = useLoad(() => getOnboardingStatus(token), 'onboarding', enabled, copy.error);
  const [dismissed, setDismissed] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const remoteDismissed = load.status === 'ready' && load.data.dismissedAt !== null;

  // Descartada desde otro dispositivo o por otro ADMIN: se recuerda aquí.
  useEffect(() => {
    if (remoteDismissed) writeDismissedHint(true);
  }, [remoteDismissed]);

  if (!enabled || dismissed) return null;

  async function dismiss() {
    setDismissing(true);
    try {
      await dismissOnboarding(token);
      writeDismissedHint(true);
      setDismissed(true);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.dismissError), { onRetry: () => void dismiss() });
    } finally {
      setDismissing(false);
    }
  }

  if (load.status === 'ready') {
    const status = load.data;
    if (status.dismissedAt !== null) return null;
    return status.allDone ? (
      <ReadyCard status={status} dismissing={dismissing} onDismiss={() => void dismiss()} />
    ) : (
      <StepsCard status={status} dismissing={dismissing} onDismiss={() => void dismiss()} />
    );
  }

  // Ya descartada en esta clínica: sin esqueleto, para que Inicio no salte.
  if (hintDismissed && load.status !== 'error') return null;

  return (
    <section aria-labelledby="inicio-onboarding-title" className={cardClass} data-testid="inicio-onboarding">
      <SectionHeader titleId="inicio-onboarding-title" title={copy.heading} description={copy.description} />
      {load.status === 'error' ? (
        <SectionError description={load.message} onRetry={load.reload} className="py-10" />
      ) : (
        <ol role="status" aria-label={copy.loading} aria-busy="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((n) => (
            <li key={n} className="flex items-center gap-3">
              <Skeleton className="size-5 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const readyLinkClass =
  'max-w-full self-start break-words rounded-sm text-sm font-medium text-primary-text hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center';

const cardClass = 'flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:px-6 sm:py-5';

interface CardProps {
  status: OnboardingStatus;
  dismissing: boolean;
  onDismiss: () => void;
}

function StepsCard({ status, dismissing, onDismiss }: CardProps) {
  const required = status.steps.filter((s) => !s.optional);
  const optional = status.steps.filter((s) => s.optional);
  const progress = copy.progress(status.completedCount, status.requiredCount);
  return (
    <section aria-labelledby="inicio-onboarding-title" className={cardClass} data-testid="inicio-onboarding">
      <SectionHeader
        titleId="inicio-onboarding-title"
        title={copy.heading}
        description={copy.description}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={dismissing}
            onClick={onDismiss}
            className="max-sm:min-h-11"
          >
            {copy.dismiss}
          </Button>
        }
      />
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={copy.progressLabel}
          aria-valuemin={0}
          aria-valuemax={status.requiredCount}
          aria-valuenow={status.completedCount}
          aria-valuetext={progress}
          className="h-1 flex-1 overflow-hidden rounded-full bg-surface-active"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${(status.completedCount / Math.max(status.requiredCount, 1)) * 100}%` }}
          />
        </div>
        <span className="t-data shrink-0 text-sm font-medium text-ink" data-testid="inicio-onboarding-progress">
          {progress}
        </span>
      </div>
      <ol aria-label={copy.listLabel} className="-mx-4 divide-y divide-border-subtle border-y border-border-subtle sm:-mx-6">
        {required.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ol>
      {optional.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="t-overline text-muted">{copy.optionalHeading}</p>
          <ul className="-mx-4 sm:-mx-6">
            {optional.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function StepRow({ step }: { step: OnboardingStep }) {
  const text = copy.steps[step.key];
  return (
    <li
      className="relative flex items-center gap-3 px-4 py-3 hover:bg-surface-sunken sm:px-6"
      data-testid={`inicio-onboarding-step-${step.key}`}
      data-done={step.done ? 'true' : 'false'}
    >
      {step.done ? (
        <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success-text" />
      ) : (
        <Circle aria-hidden className="size-5 shrink-0 text-faint" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={text.href}
          className={
            'min-w-0 break-words text-sm font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary-text ' +
            (step.done ? 'text-muted' : 'text-ink')
          }
        >
          {text.title}
          <span className="sr-only"> ({step.done ? copy.done : copy.pending})</span>
        </Link>
        <p className="break-words text-xs text-muted">{text.description}</p>
      </div>
      {step.done ? (
        <span aria-hidden className="shrink-0 text-xs font-medium text-success-text max-sm:hidden">
          {copy.done}
        </span>
      ) : null}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
    </li>
  );
}

function ReadyCard({ status, dismissing, onDismiss }: CardProps) {
  const importStep = status.steps.find((s) => s.key === 'PATIENT_IMPORT');
  return (
    <section
      aria-labelledby="inicio-onboarding-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6"
      data-testid="inicio-onboarding"
      data-state="ready"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-text"
        >
          <CheckCircle2 className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="inicio-onboarding-title" className="t-title text-ink">
            {copy.readyTitle}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.readyDescription}</p>
          {importStep && !importStep.done ? (
            // Envuelve (sin `whitespace-nowrap`): a 390 px la frase no cabe en una línea.
            <Link href={copy.steps.PATIENT_IMPORT.href} className={readyLinkClass}>
              {copy.readyImport}
            </Link>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={dismissing}
        onClick={onDismiss}
        className="shrink-0 self-start max-sm:min-h-11"
      >
        {copy.readyClose}
      </Button>
    </section>
  );
}
