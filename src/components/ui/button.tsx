import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'border border-border bg-surface text-ink hover:border-border-input hover:bg-surface-sunken',
        outline: 'border border-border bg-transparent text-ink hover:bg-surface-sunken',
        ghost: 'text-ink hover:bg-surface-sunken',
        destructive: 'bg-danger text-danger-foreground hover:opacity-90',
        'destructive-ghost': 'text-danger-text hover:bg-danger-subtle',
        link: 'h-auto px-0 text-primary-text underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 pointer-coarse:h-11',
        sm: 'h-8 rounded-md px-3 text-[0.8125rem] pointer-coarse:h-10',
        lg: 'h-11 px-6 text-base',
        icon: 'size-10 pointer-coarse:size-11',
        'icon-sm': 'size-8 rounded-md pointer-coarse:size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and disables the button while an action is in flight. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    // With asChild, Radix Slot requires a single child — don't inject the
    // spinner (the consumer owns the markup). Loading only decorates a plain
    // button.
    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(buttonVariants({ variant, size }), className)}
          {...props}
        >
          {children}
        </Comp>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
