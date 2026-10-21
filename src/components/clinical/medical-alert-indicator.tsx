'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardClock, ClipboardX, Pill, TriangleAlert } from 'lucide-react';
import {
  MEDICAL_ALERTS_TITLE,
  PREMEDICATION_LABEL,
  anamnesisNote,
  medicalAlertLines,
  medicalAlertSeverity,
  medicalAlertSummary,
  type MedicalAlertFlags,
} from '@/lib/clinical/medical-alerts';
import { cn } from '@/lib/utils';

const copy = {
  label: (patient?: string) => (patient ? `${MEDICAL_ALERTS_TITLE} de ${patient}` : MEDICAL_ALERTS_TITLE),
  anamnesisTitle: 'Anamnesis',
};

/** Margen al borde de la ventana y separación con el icono (px). */
const EDGE = 8;
const GAP = 6;
const PANEL_MAX_WIDTH = 288;
/** Lo que tarda en cerrarse al sacar el ratón (deja pasar al panel). */
const HOVER_CLOSE_MS = 150;

interface MedicalAlertIndicatorProps {
  flags: MedicalAlertFlags | null | undefined;
  /** Para el nombre accesible («Alertas médicas de Ana Ruiz»). */
  patientName?: string;
  /** `compact`: 20 px visibles (tarjetas de 15 min); `default`: 28 px. Ambos con 44 px táctiles. */
  size?: 'compact' | 'default';
  className?: string;
}

/**
 * Icono de alerta médica (DX-247) para la tarjeta de la cita, el panel «En
 * clínica» y la cabecera de la ficha. Rojo con triángulo si hay alertas; ámbar
 * con carpeta si la anamnesis caducó o no existe; nada si está al día y sin
 * alertas. Nunca solo color: el icono cambia y el texto lo dice.
 *
 * Disclosure no modal: al pasar el ratón, enfocarlo con el teclado o tocarlo
 * abre (`aria-expanded`) un panel con las
 * alertas (las etiquetas del banner de la ficha). Escape lo cierra y el foco
 * sigue en el icono. El panel va en un portal: las tarjetas recortan lo que
 * sobresale. Su resumen está siempre en el árbol accesible (`aria-describedby`).
 */
export function MedicalAlertIndicator({
  flags,
  patientName,
  size = 'compact',
  className,
}: MedicalAlertIndicatorProps) {
  const severity = medicalAlertSeverity(flags);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  // Abierto por un clic o un toque: no se cierra al sacar el ratón.
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const panelId = useId();
  const summaryId = useId();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const close = useCallback(() => {
    cancelClose();
    setOpen(false);
    setPinned(false);
    setPosition(null);
  }, []);

  useEffect(() => cancelClose, []);

  // Coloca el panel bajo el icono (o encima si no cabe), dentro de la ventana.
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 2 * EDGE);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, EDGE),
      window.innerWidth - width - EDGE,
    );
    const height = panelRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + GAP;
    const top =
      below + height > window.innerHeight - EDGE && rect.top - GAP - height >= EDGE
        ? rect.top - GAP - height
        : below;
    setPosition({ top, left, width });
  }, [open]);

  // Mientras está abierto: Escape, un toque fuera o desplazar la agenda lo cierran.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  if (!flags || !severity) return null;

  const lines = medicalAlertLines(flags);
  const note = anamnesisNote(flags);
  // El icono de la nota de anamnesis va por su estado, no por la gravedad: con
  // alertas y anamnesis caducada, el botón lleva el triángulo y la nota, la
  // carpeta con reloj.
  const NoteIcon = flags.anamnesisStatus === 'MISSING' ? ClipboardX : ClipboardClock;
  const Icon = severity === 'critical' ? TriangleAlert : NoteIcon;

  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(close, HOVER_CLOSE_MS);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-no-drag
        data-testid="medical-alert-indicator"
        data-severity={severity}
        aria-label={copy.label(patientName)}
        aria-describedby={summaryId}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelClose();
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') scheduleClose();
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={(e) => {
          // La tarjeta de la cita no debe abrirse por debajo.
          e.stopPropagation();
          if (pinned) {
            close();
          } else {
            setPinned(true);
            setOpen(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            close();
          }
        }}
        className={cn(
          // El ::after amplía la zona táctil a 44 px sin mover nada. Su inset
          // cuenta desde dentro del borde de 1 px: 18 + 2·13 = 26 + 2·9 = 44.
          "relative inline-flex shrink-0 items-center justify-center rounded-full border after:absolute after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          size === 'compact' ? 'size-5 after:-inset-[13px]' : 'size-7 after:-inset-[9px]',
          severity === 'critical'
            ? 'border-danger/40 bg-surface text-danger'
            : 'border-warning/40 bg-surface text-warning',
          className,
        )}
      >
        <Icon aria-hidden className={size === 'compact' ? 'size-3.5' : 'size-4'} />
        <span id={summaryId} className="sr-only">
          {medicalAlertSummary(flags)}
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              // Disclosure no modal: el botón lo abre (aria-expanded +
              // aria-controls); el panel es un grupo con nombre, sin foco.
              role="group"
              aria-label={copy.label(patientName)}
              // El portal sigue en el árbol de React: sin esto, un toque en el
              // panel arrastraría la tarjeta o la abriría.
              data-no-drag
              onClick={(e) => e.stopPropagation()}
              data-testid="medical-alert-popover"
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
              style={
                position
                  ? { top: position.top, left: position.left, width: position.width }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              className="fixed z-50 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left text-sm text-ink shadow-overlay"
            >
              {flags.requiresPremedication ? (
                <p className="flex items-center gap-1.5 font-semibold text-danger">
                  <Pill aria-hidden className="size-4 shrink-0" />
                  {PREMEDICATION_LABEL}
                </p>
              ) : null}
              {lines.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 font-semibold text-danger">
                    <TriangleAlert aria-hidden className="size-4 shrink-0" />
                    {MEDICAL_ALERTS_TITLE}
                  </p>
                  <ul className="list-inside list-disc text-ink">
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {note ? (
                <p className="flex items-start gap-1.5 text-warning">
                  <NoteIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="sr-only">{copy.anamnesisTitle}: </span>
                    {note}
                  </span>
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
