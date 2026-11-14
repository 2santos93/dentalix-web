import type { ReactNode } from 'react';
import { AppShell } from '@/components/layouts/app-shell';
import { RequireSession } from '@/components/layouts/require-session';
import { UnsavedChangesGuard } from '@/components/settings/unsaved-changes';

// Shared chrome for every authenticated screen (patients, agenda, detail).
// `RequireSession` es la ÚNICA guarda de sesión de `(app)` (FE-020, DX-117):
// va dentro del shell para que, mientras se verifica, solo el contenido sea el
// esqueleto. Las páginas no redirigen a /login por su cuenta (guarda en
// `src/architecture/require-session-guard.test.ts`); sus avisos por rol siguen
// en cada una. `UnsavedChangesGuard` asks before leaving a screen with an
// unsaved draft (useSettingsDraft).
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>
        <RequireSession>{children}</RequireSession>
      </AppShell>
      <UnsavedChangesGuard />
    </>
  );
}
