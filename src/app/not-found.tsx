import Link from 'next/link';
import { LinkIcon } from 'lucide-react';
import { PublicNotice } from '@/components/shared/public-page';
import { buttonVariants } from '@/components/ui/button';

/**
 * DX-116: una URL que no existe. Un grupo de rutas no atrapa estas URL, por eso
 * vive en la raíz. «/» ya lleva donde toca: al login en el host de una clínica y
 * a la portada en el dominio principal. Texto genérico: no confirma si el
 * recurso existe en otra clínica.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8">
      <PublicNotice
        headingLevel={1}
        icon={LinkIcon}
        title="Página no encontrada"
        message="No encontramos esta página. Revise el enlace o contacte con su clínica."
      />
      <Link href="/" className={buttonVariants({ className: 'self-center' })}>
        Ir al inicio
      </Link>
    </main>
  );
}
