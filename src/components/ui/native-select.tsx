import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { controlHeight, fieldClass } from '@/lib/ui/field-class';

type NativeSelectSize = 'default' | 'sm';

export interface NativeSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /**
   * `default` 40px, `sm` 32px for dense toolbars. Both grow to 44px on touch
   * (`pointer: coarse`). The HTML `size` attribute (list-box mode) is not
   * offered: the product never shows a select as a list box.
   */
  size?: NativeSelectSize;
  /** Classes for the `<select>` itself (the `className` goes on the wrapper). */
  selectClassName?: string;
}

const sizeClass: Record<NativeSelectSize, string> = {
  default: controlHeight,
  sm: 'h-8 py-1 pointer-coarse:h-11',
};

/**
 * The product's select: a real `<select>`, kept native on purpose (the OS
 * picker on phones, `selectOption` in e2e), styled once on `fieldClass` with
 * the chevron drawn on top. `className` lays out the wrapper (width, grid
 * placement); everything else (`id`, `aria-invalid`, `aria-describedby`,
 * `value`, `onChange`, the ref) reaches the `<select>`.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, selectClassName, size = 'default', children, ...props }, ref) => (
    <div className={cn('relative w-full', className)}>
      <select
        ref={ref}
        className={cn(
          fieldClass,
          sizeClass[size],
          'cursor-pointer appearance-none truncate pr-9 disabled:cursor-not-allowed',
          selectClassName,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  ),
);
NativeSelect.displayName = 'NativeSelect';
