import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SETTINGS_BACK } from './settings-sections';

/**
 * Plantilla de las pantallas de Ajustes (UX System v2, B6). DESIGN.md →
 * «Settings pages» es el contrato; aquí, las piezas:
 *
 * - `SettingsPage` — cabecera (← Ajustes solo por debajo de `xl`, donde no hay
 *   sub-navegación; título Display; una línea de apoyo; línea de alcance) y la
 *   columna de contenido: 720 px alineada a la izquierda, o `wide` para tablas
 *   reales y registros. Nunca centrada.
 * - `SettingsSection` — un bloque titulado dentro de la página (40 px entre
 *   bloques, los pone `SettingsPage`).
 * - `SettingRows` + `SettingRow` — la fila de política: etiqueta + ayuda a la
 *   izquierda; a la derecha el control (Switch, campo corto) o el valor actual
 *   en tipo dato con «Cambiar» (diálogo). Una sola tarjeta con filetes.
 * - `SaveBar` + `useSettingsDraft` (save-bar.tsx) — el único modelo de guardado
 *   de un formulario de ajustes: barra pegajosa que solo aparece con cambios.
 */

export type SettingsScope = 'clinic' | 'sede';

const scopeCopy: Record<SettingsScope, string> = {
  clinic: 'Aplica a toda la clínica',
  sede: 'Por sede',
};

export interface SettingsPageProps {
  title: string;
  /** Una línea (≤ 68ch, ≤ 2 líneas): para qué sirve la pantalla. */
  description?: string;
  /**
   * Alcance: «Aplica a toda la clínica» o «Por sede». Un nodo para un alcance
   * concreto («Editando: Sede Norte»). Sustituye las frases sueltas tipo «en
   * todas las sedes de la clínica» dentro de la descripción.
   */
  scope?: SettingsScope | React.ReactNode;
  /**
   * `form` (por defecto): 720 px — formularios, políticas, listas cortas
   * (≤ 4 columnas). `wide`: todo el ancho — tablas de ≥ 5 columnas, registros.
   */
  width?: 'form' | 'wide';
  /** Acción primaria de una FICHA (no de una lista: esa va en su barra). */
  actions?: React.ReactNode;
  /** Vuelta distinta de «Ajustes» (la ficha de una sede vuelve a «Sedes»). */
  back?: { href: string; label: string };
  children: React.ReactNode;
}

export function SettingsPage({
  title,
  description,
  scope,
  width = 'form',
  actions,
  back = SETTINGS_BACK,
  children,
}: SettingsPageProps) {
  // La vuelta a «Ajustes» la hace la sub-navegación en `xl`; una vuelta a otra
  // pantalla (Sedes) se queda siempre: la sub-navegación no la sustituye.
  const backIsIndex = back.href === SETTINGS_BACK.href;
  const scopeNode: React.ReactNode =
    scope === 'clinic' ? scopeCopy.clinic : scope === 'sede' ? scopeCopy.sede : (scope ?? null);
  return (
    <div className={cn('flex w-full min-w-0 flex-col', width === 'form' && 'max-w-[720px]')}>
      <Link
        href={back.href}
        className={cn(
          'mb-2 inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-md:mb-0 max-md:min-h-11',
          backIsIndex && 'xl:hidden',
        )}
      >
        <ChevronLeft aria-hidden className="size-4" />
        {back.label}
      </Link>
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        meta={
          scopeNode ? (
            <p className="t-caption mt-2 text-muted" data-testid="settings-scope">
              {scopeNode}
            </p>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-10">{children}</div>
    </div>
  );
}

export interface SettingsSectionProps {
  title: string;
  /** Una línea de ayuda, ≤ 68ch. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** `h2` en una página; `h3` dentro de una pestaña. */
  as?: 'h2' | 'h3';
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export function SettingsSection({
  title,
  description,
  actions,
  as = 'h2',
  id,
  className,
  children,
}: SettingsSectionProps) {
  const autoId = React.useId();
  const headingId = id ?? `settings-section-${autoId}`;
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', className)}>
      <SectionHeader
        as={as}
        titleId={headingId}
        title={title}
        description={description ? <span className="block max-w-[68ch]">{description}</span> : undefined}
        actions={actions}
      />
      {children}
    </section>
  );
}

/** Una tarjeta, filas separadas por filetes (sin tarjetas anidadas). */
export function SettingRows({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SettingRowProps {
  label: React.ReactNode;
  /** Ayuda muda, ≤ 2 líneas. */
  description?: React.ReactNode;
  /** Valor actual de solo lectura (tipo dato). */
  value?: React.ReactNode;
  /** Acción del valor («Cambiar», que abre un diálogo). */
  action?: React.ReactNode;
  /** El control en sitio (Switch, campo corto). Sustituye a `value`. */
  children?: React.ReactNode;
  /** El valor es el de fábrica: chip neutro «Por defecto». */
  isDefault?: boolean;
  /**
   * El control se queda a la derecha también en el teléfono (un Switch). Por
   * defecto, en el teléfono el control baja debajo del texto.
   */
  inline?: boolean;
  /** id de la etiqueta, para nombrar el control con `aria-labelledby`. */
  labelId?: string;
  className?: string;
}

export function SettingRow({
  label,
  description,
  value,
  action,
  children,
  isDefault = false,
  inline = false,
  labelId,
  className,
}: SettingRowProps) {
  const control = children ?? (
    <>
      {value !== undefined ? <span className="t-data text-ink">{value}</span> : null}
      {action ?? null}
    </>
  );
  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 sm:px-6 sm:py-4',
        inline ? 'items-center justify-between' : 'flex-col sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span id={labelId} className="font-medium text-ink">
            {label}
          </span>
          {isDefault ? <Badge variant="neutral">Por defecto</Badge> : null}
        </div>
        {description ? <p className="max-w-[60ch] text-sm text-muted">{description}</p> : null}
      </div>
      <div className={cn('flex shrink-0 flex-wrap items-center gap-3', !inline && 'max-sm:w-full')}>{control}</div>
    </div>
  );
}
