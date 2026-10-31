'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { hasUnsavedChanges, requestNavigation } from '@/components/settings/unsaved-changes';
import { CalendarPlus, CornerDownLeft, Search, UserPlus, UserRound } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { visibleSettingsSections } from '@/components/settings/settings-sections';
import type { ClinicRole } from '@/lib/me/me-api';
import { cn } from '@/lib/utils';
import { NEW_APPOINTMENT_EVENT, NEW_APPOINTMENT_PARAM } from '@/lib/ui/new-appointment';
import { canSee, ALL_NAV_ITEMS } from './nav-config';
import { useCloseOnBack } from './use-shell-media';


const copy = {
  title: 'Buscar',
  description: 'Pacientes, secciones y acciones. Flechas para moverse, Enter para abrir.',
  placeholder: 'Buscar pacientes, secciones o acciones…',
  patients: 'Pacientes',
  goTo: 'Ir a',
  actions: 'Acciones',
  searching: 'Buscando pacientes…',
  searchFailed: 'No se pudo buscar pacientes. Revisa la conexión e inténtalo de nuevo.',
  minChars: 'Escribe al menos 2 letras para buscar pacientes.',
  noResults: (q: string) => `Nada coincide con «${q}».`,
  newAppointment: 'Nueva cita',
  newPatient: 'Nuevo paciente',
  noDocument: 'Sin documento',
  settingsHint: 'Ajustes',
};

const PATIENT_LIMIT = 6;
const DEBOUNCE_MS = 200;

interface Option {
  id: string;
  group: 'patients' | 'goto' | 'actions';
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

/** Minúsculas y sin tildes: «auditoria» encuentra «Auditoría». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Paleta de comandos (⌘K / Ctrl+K, y la lupa de la barra superior en móvil):
 * pacientes por nombre o documento (`GET /patients?query=`, con 200 ms de
 * espera), «Ir a» (las secciones que el rol puede abrir y las pantallas de
 * Ajustes) y «Acciones» (Nueva cita, Nuevo paciente).
 *
 * Patrón combobox + listbox de ARIA: el foco se queda en el campo y la opción
 * activa se anuncia con `aria-activedescendant`. Flechas, Inicio/Fin y Enter.
 * En el teléfono ocupa la pantalla entera (el teclado se come media).
 */
export function CommandPalette({
  open,
  onOpenChange,
  token,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  role: ClinicRole | null;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [patientState, setPatientState] = React.useState<'idle' | 'loading' | 'error'>('idle');
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const { skipBack } = useCloseOnBack(open, close);

  // Al cerrar se limpia: la próxima apertura empieza en blanco.
  React.useEffect(() => {
    if (open) return;
    const reset = () => {
      setQuery('');
      setPatients([]);
      setPatientState('idle');
      setActive(0);
    };
    reset();
  }, [open]);

  const searchable = debounced.length >= 2;
  React.useEffect(() => {
    if (!open || !token || !searchable) return;
    let cancelled = false;
    async function search() {
      setPatientState('loading');
      try {
        const res = await listPatients(token!, { query: debounced, pageSize: PATIENT_LIMIT });
        if (cancelled) return;
        setPatients(res.items.slice(0, PATIENT_LIMIT));
        setPatientState('idle');
      } catch {
        if (!cancelled) {
          setPatients([]);
          setPatientState('error');
        }
      }
    }
    void search();
    return () => {
      cancelled = true;
    };
  }, [open, token, debounced, searchable]);

  const go = React.useCallback(
    (href: string) => {
      // Con cambios sin guardar, la paleta se cierra como con Esc (retira su
      // entrada del historial) y la guarda pregunta antes de navegar.
      if (hasUnsavedChanges() && requestNavigation(href)) {
        onOpenChange(false);
        return;
      }
      skipBack();
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router, skipBack],
  );

  const options = React.useMemo<Option[]>(() => {
    const q = fold(query.trim());
    const matches = (...texts: (string | undefined)[]) => !q || texts.some((t) => t && fold(t).includes(q));
    const result: Option[] = [];
    if (searchable && query.trim().length >= 2) {
      for (const p of patients) {
        const doc = documentText(dtoDocTypeName(p), p.docNumber);
        result.push({
          id: `patient-${p.id}`,
          group: 'patients',
          label: `${p.firstName} ${p.lastName}`.trim(),
          hint: doc ?? copy.noDocument,
          icon: UserRound,
          run: () => go(`/patients/${p.id}`),
        });
      }
    }
    for (const item of ALL_NAV_ITEMS) {
      if (!canSee(item, role)) continue;
      const label = item.fullLabel ?? item.label;
      if (!matches(label, item.tabLabel)) continue;
      result.push({ id: `nav-${item.href}`, group: 'goto', label, icon: item.icon, run: () => go(item.href) });
    }
    // Las pantallas de Ajustes solo al escribir: sin texto, la lista es corta.
    if (q) {
      for (const section of visibleSettingsSections(role)) {
        for (const entry of section.entries) {
          if (!matches(entry.label, section.title)) continue;
          result.push({
            id: `settings-${entry.href}`,
            group: 'goto',
            label: entry.label,
            hint: `${copy.settingsHint} · ${section.title}`,
            icon: entry.icon,
            run: () => go(entry.href),
          });
        }
      }
    }
    const actions: Option[] = [
      {
        id: 'action-new-appointment',
        group: 'actions',
        label: copy.newAppointment,
        icon: CalendarPlus,
        run: () => {
          if (typeof window !== 'undefined' && window.location.pathname === '/agenda') {
            skipBack();
            onOpenChange(false);
            window.dispatchEvent(new Event(NEW_APPOINTMENT_EVENT));
          } else {
            go(`/agenda?${NEW_APPOINTMENT_PARAM}=cita`);
          }
        },
      },
      { id: 'action-new-patient', group: 'actions', label: copy.newPatient, icon: UserPlus, run: () => go('/patients/new') },
    ];
    for (const a of actions) if (matches(a.label)) result.push(a);
    return result;
  }, [query, searchable, patients, role, go, onOpenChange, skipBack]);

  const activeIndex = options.length === 0 ? -1 : Math.min(active, options.length - 1);
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;
  const optionDomId = (o: Option) => `${listId}-${o.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  React.useEffect(() => {
    if (!activeOption) return;
    const el = document.getElementById(optionDomId(activeOption));
    el?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOption?.id]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // El campo es un combobox expandido, y `DialogContent` no se cierra con
    // Esc mientras uno lo está (`keepOpenWhileComboboxExpanded`, pensado para
    // los desplegables dentro de un formulario). Aquí la lista ES el diálogo:
    // Esc lo cierra.
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((activeIndex + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((activeIndex - 1 + options.length) % options.length);
    } else if (event.key === 'Home' && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && event.ctrlKey) {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activeOption?.run();
    }
  }

  const groups: { id: Option['group']; label: string }[] = [
    { id: 'patients', label: copy.patients },
    { id: 'goto', label: copy.goTo },
    { id: 'actions', label: copy.actions },
  ];
  const trimmed = query.trim();
  let status: string | null = null;
  if (trimmed.length === 1) status = copy.minChars;
  else if (trimmed.length >= 2 && patientState === 'loading') status = copy.searching;
  else if (trimmed.length >= 2 && patientState === 'error') status = copy.searchFailed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="command-palette"
        className={cn(
          'flex max-w-xl flex-col gap-0 overflow-hidden p-0',
          'md:top-[12dvh] md:max-h-[min(36rem,76dvh)] md:translate-y-0',
          // Teléfono: pantalla completa (el teclado ocupa la mitad de abajo).
          'max-md:inset-0 max-md:h-[100dvh] max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0',
        )}
      >
        <DialogTitle className="sr-only">{copy.title}</DialogTitle>
        <DialogDescription className="sr-only">{copy.description}</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4 pt-[env(safe-area-inset-top)] pr-12">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? optionDomId(activeOption) : undefined}
            aria-label={copy.title}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint md:text-sm"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {status && (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              {status}
            </p>
          )}
          <ul id={listId} ref={listRef} role="listbox" aria-label={copy.title} className="flex flex-col">
            {groups.map((g) => {
              const items = options.filter((o) => o.group === g.id);
              if (items.length === 0) return null;
              const headingId = `${listId}-${g.id}`;
              return (
                <li key={g.id} role="presentation" className="flex flex-col">
                  <p id={headingId} aria-hidden className="t-overline px-3 pb-1 pt-3">
                    {g.label}
                  </p>
                  <ul role="group" aria-labelledby={headingId} className="flex flex-col">
                    {items.map((o) => {
                      const selected = o === activeOption;
                      const Icon = o.icon;
                      return (
                        <li
                          key={o.id}
                          id={optionDomId(o)}
                          role="option"
                          aria-selected={selected}
                          onMouseMove={() => setActive(options.indexOf(o))}
                          onClick={() => o.run()}
                          className={cn(
                            'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                            selected ? 'bg-primary-subtle text-primary-subtle-text' : 'text-ink',
                          )}
                        >
                          <Icon className={cn('size-4 shrink-0', selected ? '' : 'text-muted')} />
                          <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                          {o.hint && (
                            <span className={cn('t-data min-w-0 max-w-[50%] truncate text-xs', selected ? '' : 'text-muted')}>
                              {o.hint}
                            </span>
                          )}
                          {selected && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 max-md:hidden" />}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          {options.length === 0 && !status && (
            <p role="status" className="px-3 py-6 text-center text-sm text-muted">
              {copy.noResults(trimmed)}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Pequeña insignia del atajo: ⌘K en Mac, Ctrl K en el resto. */
export function ShortcutHint({ className }: { className?: string }) {
  const [mac, setMac] = React.useState(false);
  React.useEffect(() => {
    const detect = () => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    detect();
  }, []);
  return (
    <kbd
      className={cn(
        'inline-flex h-5 items-center rounded border border-border bg-surface-sunken px-1.5 font-sans text-[0.6875rem] font-medium text-muted',
        className,
      )}
    >
      {mac ? '⌘K' : 'Ctrl K'}
    </kbd>
  );
}
