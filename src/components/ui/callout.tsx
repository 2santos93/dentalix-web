import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusTone } from '@/lib/status/tones';

const TONE: Record<StatusTone, { box: string; icon: string; Icon: LucideIcon | null }> = {
  neutral: { box: 'border-border bg-surface-sunken', icon: 'text-muted', Icon: Info },
  info: { box: 'border-info/30 bg-info-subtle', icon: 'text-info-text', Icon: Info },
  success: { box: 'border-success/30 bg-success-subtle', icon: 'text-success-text', Icon: CheckCircle2 },
  warning: { box: 'border-warning/40 bg-warning-subtle', icon: 'text-warning-text', Icon: AlertTriangle },
  danger: { box: 'border-danger/30 bg-danger-subtle', icon: 'text-danger-text', Icon: OctagonAlert },
};

export interface CalloutProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: StatusTone;
  title?: React.ReactNode;
  /** Icono propio; `null` lo quita. Por defecto, el del tono. */
  icon?: LucideIcon | null;
  /** Acción a la derecha (en móvil, debajo): un `Button` pequeño o un enlace. */
  action?: React.ReactNode;
  /** Etiqueta de título (`p` por defecto); usa `h3` cuando el aviso abre una sección. */
  titleAs?: 'p' | 'h2' | 'h3' | 'h4';
}

/**
 * Aviso en línea (DESIGN.md → Callout): algo que el usuario debe saber o hacer
 * en ESTA pantalla — anamnesis por revisar, tarifa sin tasa, política de
 * cancelación. Tinte del tono + texto en tinta + icono del tono, nunca el
 * acento. No es la escalera de errores (`components/errors`): un fallo de
 * carga o de guardado usa esos componentes.
 *
 * Rol: `warning`/`danger` anuncian (`role="alert"` solo si aparece tras una
 * acción; por defecto `status` para no interrumpir); pasa `role` para cambiarlo.
 */
export function Callout({
  tone = 'info',
  title,
  icon,
  action,
  titleAs: TitleTag = 'p',
  className,
  children,
  role,
  ...props
}: CalloutProps) {
  const t = TONE[tone];
  const Icon = icon === undefined ? t.Icon : icon;
  return (
    <div
      role={role ?? (tone === 'warning' || tone === 'danger' ? 'status' : undefined)}
      data-tone={tone}
      className={cn(
        'flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm text-ink sm:flex-row sm:items-start',
        t.box,
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        {Icon ? <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', t.icon)} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {title ? <TitleTag className="font-semibold text-ink">{title}</TitleTag> : null}
          {children ? <div className="min-w-0 text-ink [&_a]:underline">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 sm:self-center">{action}</div> : null}
    </div>
  );
}
