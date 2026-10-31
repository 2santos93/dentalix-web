import * as React from 'react';
import { cn } from '@/lib/utils';
import { controlHeight, fieldClass } from '@/lib/ui/field-class';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(fieldClass, controlHeight, 'file:border-0 file:bg-transparent file:text-sm file:font-medium', className)}
    {...props}
  />
));
Input.displayName = 'Input';
