import * as React from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Template: the centered, single-card shell shared by login/register.
 * A soft branded backdrop + a small logo lockup keeps the "clínico limpio"
 * feel; the theme switch sits top-right.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12">
      {/* subtle brand wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-transparent"
      />
      <div className="mb-6 flex w-full max-w-sm items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted">
          <span aria-hidden>🦷</span> Dentalix
        </span>
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {children}
          {footer ? (
            <div className="text-center text-sm text-muted">{footer}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
