import { LinkIcon } from 'lucide-react';
import { PublicNotice } from '@/components/shared/public-page';

export default function PublicNotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <PublicNotice
        headingLevel={1}
        icon={LinkIcon}
        title="Página no encontrada"
        message="No encontramos esta página. Revise el enlace o contacte con su clínica."
      />
    </main>
  );
}
