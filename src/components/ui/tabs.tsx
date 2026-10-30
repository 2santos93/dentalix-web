'use client';
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/**
 * Pestañas (DESIGN.md → Tabs) sobre `@radix-ui/react-tabs`: patrón ARIA real
 * (roving tabindex, flechas, Inicio/Fin), estilo subrayado, y una franja que se
 * desplaza de lado cuando no caben, con bordes que se desvanecen para que una
 * pestaña cortada nunca parezca la última, y la activa siempre a la vista.
 *
 * `activationMode="manual"` (por defecto aquí): las flechas mueven el foco y
 * Enter/Espacio o el clic eligen. Casi todos los paneles cargan datos al
 * montarse; recorrer la franja con flechas no debe disparar peticiones.
 */
export function Tabs({
  activationMode = 'manual',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root activationMode={activationMode} {...props} />;
}

/** Franja de pestañas con desbordamiento visible (máscaras en los bordes) y auto-desplazamiento a la activa. */
export function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const measure = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 });
  }, []);

  // La activa a la vista (p. ej. al abrir `?tab=documents` en 390px), sin
  // mover la página en vertical: se ajusta solo el scroll horizontal.
  const revealActive = React.useCallback(() => {
    const el = scroller.current;
    const active = el?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!el || !active) return;
    const left = active.offsetLeft - el.offsetLeft;
    const right = left + active.offsetWidth;
    const pad = 24;
    if (left < el.scrollLeft + pad) el.scrollLeft = Math.max(0, left - pad);
    else if (right > el.scrollLeft + el.clientWidth - pad) el.scrollLeft = right - el.clientWidth + pad;
    measure();
  }, [measure]);

  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    revealActive();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    // Cambios de pestaña activa: Radix actualiza `data-state` en los triggers.
    const mutations =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(revealActive);
    mutations?.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
    };
  }, [measure, revealActive]);

  const mask =
    edges.start && edges.end
      ? '[mask-image:linear-gradient(to_right,transparent,#000_2rem,#000_calc(100%-2rem),transparent)]'
      : edges.start
        ? '[mask-image:linear-gradient(to_right,transparent,#000_2rem)]'
        : edges.end
          ? '[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]'
          : '';

  return (
    <div className={cn('relative border-b border-border', className)} data-overflow-start={edges.start || undefined} data-overflow-end={edges.end || undefined}>
      <div
        ref={scroller}
        onScroll={measure}
        className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', mask)}
      >
        <TabsPrimitive.List className="flex w-max min-w-full gap-1" {...props}>
          {children}
        </TabsPrimitive.List>
      </div>
    </div>
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'focus-ring -mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-ink sm:px-4',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('focus-ring pt-6', className)} {...props} />;
}

export interface TabBarItem<V extends string> {
  value: V;
  label: React.ReactNode;
  /** `id` del botón (los paneles de la página lo citan en `aria-labelledby`). */
  id?: string;
  /** `id` del panel que controla (vive fuera de la franja). */
  controls?: string;
  disabled?: boolean;
}

export interface TabBarProps<V extends string> {
  value: V;
  onValueChange: (value: V) => void;
  items: readonly TabBarItem<V>[];
  'aria-label': string;
  className?: string;
}

/**
 * Franja de pestañas cuyos paneles pinta la página (pestañas sincronizadas con
 * la URL: caja, gastos, reportes, horarios, ficha del paciente). Mismo
 * componente y teclado que `Tabs`, pero el panel no se monta aquí: cada
 * pestaña lleva `id`/`controls` estables y la página pone `role="tabpanel"`.
 */
export function TabBar<V extends string>({
  value,
  onValueChange,
  items,
  className,
  'aria-label': ariaLabel,
}: TabBarProps<V>) {
  // Radix elige en `mousedown`; el `click` también elige para quien solo
  // dispara clic (lectores de pantalla, pruebas). Se emite una vez por cambio.
  const lastEmitted = React.useRef<V | null>(null);
  React.useEffect(() => {
    lastEmitted.current = null;
  }, [value]);
  const emit = (next: string) => {
    if (next === value || next === lastEmitted.current) return;
    lastEmitted.current = next as V;
    onValueChange(next as V);
  };

  return (
    <Tabs value={value} onValueChange={emit} className={className}>
      <TabsList aria-label={ariaLabel}>
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            onClick={() => emit(item.value)}
            {...(item.id ? { id: item.id } : {})}
            {...(item.controls ? { 'aria-controls': item.controls } : {})}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
