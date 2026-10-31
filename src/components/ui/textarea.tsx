'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from '@/lib/ui/field-class';
import { composeRefs } from '@/lib/ui/compose-refs';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Grow with the text instead of scrolling (notes, reasons). Cap it with a
   * `max-h-*` class; past the cap it scrolls.
   */
  autoGrow?: boolean;
}

/** Fit the textarea to its content. `min-h` from the class still applies. */
function fit(node: HTMLTextAreaElement) {
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}

/**
 * Multi-line field on `fieldClass`: 80px minimum, resizable vertically (or
 * auto-growing). Plugs into `FormField` like `Input`: pass `id`,
 * `aria-invalid` and `aria-describedby={fieldErrorId(id)}`.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoGrow = false, onInput, value, ...props }, ref) => {
    const own = React.useRef<HTMLTextAreaElement | null>(null);

    // Controlled value changes (a reset, a template) must refit too.
    React.useLayoutEffect(() => {
      if (autoGrow && own.current) fit(own.current);
    }, [autoGrow, value]);

    return (
      <textarea
        ref={composeRefs(ref, own)}
        value={value}
        onInput={(event) => {
          if (autoGrow) fit(event.currentTarget);
          onInput?.(event);
        }}
        className={cn(
          fieldClass,
          'min-h-20',
          autoGrow ? 'resize-none overflow-y-auto' : 'resize-y',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
