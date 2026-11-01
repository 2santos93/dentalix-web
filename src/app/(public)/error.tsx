'use client';

import { PublicNotice } from '@/components/shared/public-page';
import { Button } from '@/components/ui/button';
import { CloudOff } from 'lucide-react';

/** Public segment boundary. Never expose the thrown value or token in the UI. */
export default function PublicError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8">
      <PublicNotice
        headingLevel={1}
        icon={CloudOff}
        title="Algo salió mal"
        message="No pudimos mostrar esta página. Intente de nuevo."
      />
      <Button type="button" onClick={retry} className="self-center">Reintentar</Button>
    </main>
  );
}
