'use client';
import { brandColorReport, STATUS_HUES } from '@/lib/color/brand-color';
import type { AccentTokens } from '@/lib/color/accent';
import { Callout } from '@/components/ui/callout';

export const brandColorPreviewCopy = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  button: 'Guardar',
  link: 'Ver ficha',
  selected: 'Seleccionado',
  invalid: 'Escribe un color válido para ver cómo queda.',
  contrastTitle: 'Este color no llega al contraste AA con texto blanco',
  contrastAdjusted: (ratio: string) =>
    `Con texto blanco da ${ratio}:1 y el mínimo es 4,5:1. Los botones usarán un tono más oscuro de la misma tonalidad, como ves aquí.`,
  contrastInk: (ratio: string) =>
    `Con texto blanco da ${ratio}:1 y el mínimo es 4,5:1. Los botones lo conservan y escriben encima en oscuro, como ves aquí.`,
  statusTitle: 'Se parece al color de un estado',
  statusBody: (label: string) =>
    `Su tono está cerca del de ${label}. El color de la marca podría leerse como un estado; si puedes, elige otro tono.`,
};

const copy = brandColorPreviewCopy;

/** Superficies de cada tema (tokens.css): la muestra se pinta sobre ellas. */
const SURFACES = {
  light: { surface: '#FFFFFF', ink: '#151C26', muted: '#5B6472', border: '#D8DFE6' },
  dark: { surface: '#13171F', ink: '#EEF0F4', muted: '#A2AAB6', border: '#292F39' },
} as const;

function Sample({ theme, tokens }: { theme: 'light' | 'dark'; tokens: AccentTokens }) {
  const s = SURFACES[theme];
  return (
    <figure
      data-testid={`accent-preview-${theme}`}
      // Muestra de la familia derivada: los colores SON el dato que se enseña.
      style={{ background: s.surface, borderColor: s.border, color: s.ink }}
      className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border p-3"
    >
      <figcaption style={{ color: s.muted }} className="text-xs font-medium">
        {theme === 'light' ? copy.light : copy.dark}
      </figcaption>
      <div className="flex flex-wrap items-center gap-3">
        <span
          style={{ background: tokens.primary, color: tokens.primaryFg }}
          className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
        >
          {copy.button}
        </span>
        <span style={{ color: tokens.primaryText }} className="text-sm font-medium underline underline-offset-4">
          {copy.link}
        </span>
        <span
          style={{ background: tokens.primarySubtle, color: tokens.primarySubtleText, borderColor: tokens.primaryBorder }}
          className="inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium"
        >
          {copy.selected}
        </span>
      </div>
    </figure>
  );
}

const fmtRatio = (r: number) => (Math.floor(r * 10) / 10).toFixed(1).replace('.', ',');

/**
 * DX-019: la familia del acento que Dentalix deriva del color elegido
 * (`accent.ts`, AA garantizado), en claro y en oscuro, y los avisos: sin
 * contraste AA con texto blanco, o con un tono cercano al de un estado fijo
 * (DESIGN.md → Colors, «The Status Rule»).
 */
export function BrandColorPreview({ color }: { color: string | null }) {
  const report = color ? brandColorReport(color) : null;
  if (!report) return <p className="text-sm text-muted">{copy.invalid}</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="accent-preview">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Sample theme="light" tokens={report.family.light} />
        <Sample theme="dark" tokens={report.family.dark} />
      </div>
      {report.lowContrast ? (
        <Callout tone="warning" title={copy.contrastTitle} data-testid="accent-contrast-warning">
          {report.adjusted ? copy.contrastAdjusted(fmtRatio(report.whiteRatio)) : copy.contrastInk(fmtRatio(report.whiteRatio))}
        </Callout>
      ) : null}
      {report.statusHue ? (
        <Callout tone="warning" title={copy.statusTitle} data-testid="accent-status-warning">
          {copy.statusBody(STATUS_HUES[report.statusHue].label)}
        </Callout>
      ) : null}
    </div>
  );
}
