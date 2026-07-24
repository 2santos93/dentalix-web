import type { ReactNode } from 'react';
import { AppShell } from '@/components/templates/app-shell';

// Shared chrome for every authenticated screen (patients, agenda, detail).
// Individual pages keep their own auth-redirect guard; this only supplies the
// sidebar + top bar so the layout is consistent and DRY.
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
