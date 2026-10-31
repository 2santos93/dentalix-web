// The one class string for text-like form controls (input, select, textarea).
// `Input`, `NativeSelect` and `Textarea` are built on it; a screen that still
// renders a raw control must use it too, so every field in the product looks
// and behaves the same (DESIGN.md → Inputs / Fields).
//
// - Boundary: `border-input` (≥3:1 against surface and canvas, WCAG 1.4.11).
// - Focus: the border turns accent-text and a soft accent halo appears; no
//   offset ring, so fields inside dense tables don't collide.
// - Invalid (`aria-invalid`): danger border + danger halo on focus.
// - Touch (`pointer: coarse`): 44px and 16px text, so iOS never zooms.
// Height is NOT set here — textareas grow; `controlHeight` sizes single-line
// controls.
export const fieldClass =
  'flex w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm text-ink transition-[border-color,box-shadow] placeholder:text-faint hover:border-muted focus-visible:border-primary-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20 pointer-coarse:text-base';

// Single-line controls: 40px desktop, 44px on touch.
export const controlHeight = 'h-10 pointer-coarse:h-11';
