import * as React from 'react';
import { chartLayoutForArch, isPrimaryFdi, positionOfTooth, type DentitionType } from '@/lib/odontogram/dentition';
import { toothHeight, toothWidth, type Arch } from '@/lib/odontogram/tooth-anatomy';
import { cn } from '@/lib/utils';

export const compactOdontogramCopy = {
  label: (teeth: readonly string[]) => `Dientes de esta visita: ${teeth.join(', ')}`,
};

/** Escala del dibujo frente a la carta interactiva (los anchos por clase de `tooth-anatomy`). */
const SCALE = 0.5;
const GAP = 1.5;
const MIDLINE = 5;
const ARCH_GAP = 4;

/**
 * Colores por tono: `app` con los tokens (claro y oscuro); `paper` en tinta
 * fija sobre papel blanco, como las páginas públicas y lo impreso.
 */
const TONES = {
  app: {
    marked: 'fill-primary stroke-primary',
    markedText: 'fill-primary-fg',
    idle: 'fill-surface stroke-border-input',
  },
  paper: {
    marked: 'fill-[#1f2937] stroke-[#1f2937]',
    markedText: 'fill-white',
    idle: 'fill-white stroke-[#9ca3af]',
  },
} as const;

interface Placed {
  fdi: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * La dentición de cada posición: temporal donde la visita marca un temporal
 * (todas si solo hay temporales), permanente en el resto.
 */
function dentitionFor(teeth: readonly string[]): (position: string) => DentitionType {
  const primaryPositions = new Set(teeth.filter(isPrimaryFdi).map(positionOfTooth));
  const allPrimary = teeth.length > 0 && teeth.every(isPrimaryFdi);
  return (position) => (allPrimary || primaryPositions.has(position) ? 'PRIMARY' : 'PERMANENT');
}

function placeArch(arch: Arch, dentitionOf: (position: string) => DentitionType, rowHeight: number, top: number) {
  const { columns } = chartLayoutForArch(arch, dentitionOf);
  const placed: Placed[] = [];
  let x = 0;
  columns.forEach((column, index) => {
    if (index === columns.length / 2) x += MIDLINE - GAP;
    const fdi = column.permanent ?? column.primary;
    if (!fdi) return; // Molar sin erupcionar en dentición temporal: no se dibuja.
    const width = toothWidth(fdi) * SCALE;
    const height = toothHeight(fdi) * SCALE;
    // Los dientes miran al plano oclusal: arriba se alinean por abajo, abajo por arriba.
    const y = arch === 'upper' ? top + rowHeight - height : top;
    placed.push({ fdi, x, y, width, height });
    x += width + GAP;
  });
  return { placed, width: x - GAP };
}

interface CompactOdontogramProps {
  /** Los dientes FDI que se marcan (los de la visita). */
  teeth: readonly string[];
  tone?: keyof typeof TONES;
  className?: string;
}

/**
 * DX-560 · Odontograma compacto DE SOLO LECTURA para presentar el plan: las
 * dos arcadas en miniatura, con los dientes de la visita marcados y su número.
 * Es una imagen (`role="img"` con la lista de dientes), sin botones ni foco.
 * Usa la geometría de la carta (`tooth-anatomy`, `dentition`): temporales si
 * la visita es de temporales.
 */
export function CompactOdontogram({ teeth, tone = 'app', className }: CompactOdontogramProps) {
  const colors = TONES[tone];
  const marked = new Set(teeth);
  const dentitionOf = dentitionFor(teeth);
  const rowHeight = toothHeight('11') * SCALE;
  const upper = placeArch('upper', dentitionOf, rowHeight, 0);
  const lower = placeArch('lower', dentitionOf, rowHeight, rowHeight + ARCH_GAP);
  const width = Math.max(upper.width, lower.width);
  const height = rowHeight * 2 + ARCH_GAP;
  // Centra la arcada más estrecha (la temporal) bajo la otra.
  const offset = (archWidth: number) => (width - archWidth) / 2;
  const teethLabel = compactOdontogramCopy.label(teeth);

  return (
    <svg
      role="img"
      aria-label={teethLabel}
      viewBox={`-1 -1 ${width + 2} ${height + 2}`}
      className={cn('h-auto w-full max-w-[22rem]', className)}
      data-testid="compact-odontogram"
    >
      {[
        { arch: upper, dx: offset(upper.width) },
        { arch: lower, dx: offset(lower.width) },
      ].map(({ arch, dx }) =>
        arch.placed.map((tooth) => {
          const on = marked.has(tooth.fdi);
          return (
            <g key={tooth.fdi} data-tooth={tooth.fdi} data-marked={on ? 'true' : undefined} aria-hidden>
              <rect
                x={tooth.x + dx}
                y={tooth.y}
                width={tooth.width}
                height={tooth.height}
                rx={2}
                strokeWidth={0.75}
                className={on ? colors.marked : colors.idle}
              />
              {on ? (
                <text
                  x={tooth.x + dx + tooth.width / 2}
                  y={tooth.y + tooth.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={7}
                  fontWeight={600}
                  className={colors.markedText}
                >
                  {tooth.fdi}
                </text>
              ) : null}
            </g>
          );
        }),
      )}
    </svg>
  );
}
