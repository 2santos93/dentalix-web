import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Status chip (DESIGN.md → Chips / Badges). Tinted background + same-hue text,
 * never the tenant accent: a red or orange clinic color must not make
 * "Confirmada" read as an alarm. `dot` adds the leading dot so color is never
 * the only cue. For domain statuses use `StatusBadge` (src/lib/status/tones),
 * which picks the tone from the one status→tone map.
 *
 * `primary` exists for brand/selection markers (e.g. "Actual", "Tú"), never
 * for a status. `default` / `secondary` / `muted` are v1 names kept as
 * neutral aliases while screens migrate.
 */
const badgeVariants = cva(
  'inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-4',
  {
    variants: {
      variant: {
        neutral: 'border-transparent bg-surface-active text-ink',
        info: 'border-transparent bg-info-subtle text-info-text',
        success: 'border-transparent bg-success-subtle text-success-text',
        warning: 'border-transparent bg-warning-subtle text-warning-text',
        danger: 'border-transparent bg-danger-subtle text-danger-text',
        primary: 'border-transparent bg-primary-subtle text-primary-subtle-text',
        outline: 'border-border bg-transparent text-muted',
        // v1 aliases
        default: 'border-transparent bg-surface-active text-ink',
        secondary: 'border-transparent bg-surface-active text-ink',
        muted: 'border-transparent bg-surface-sunken text-muted',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

const dotColor: Record<string, string> = {
  neutral: 'bg-muted',
  default: 'bg-muted',
  secondary: 'bg-muted',
  muted: 'bg-faint',
  outline: 'bg-faint',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  primary: 'bg-primary',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Leading status dot — use it whenever the chip carries a status. */
  dot?: boolean;
}

export function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dotColor[variant ?? 'neutral'])} />
      ) : null}
      {children}
    </span>
  );
}

export { badgeVariants };
