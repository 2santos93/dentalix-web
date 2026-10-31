import type { ReactNode } from 'react';
import { AppShell } from '@/components/layouts/app-shell';
import { UnsavedChangesGuard } from '@/components/settings/unsaved-changes';

// Shared chrome for every authenticated screen (patients, agenda, detail).
// Individual pages keep their own auth-redirect guard; this only supplies the
// sidebar + top bar so the layout is consistent and DRY. `UnsavedChangesGuard`
// asks before leaving a screen with an unsaved draft (useSettingsDraft).
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <UnsavedChangesGuard />
    </>
  );
}
