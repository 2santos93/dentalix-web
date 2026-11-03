'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { useSedeStamp, type SedeStamp } from '@/lib/locations/sede-stamp';

/** Hay un dueño de página que ya muestra el aviso de la pantalla (E4: una vez por pantalla). */
const SedeNoticeOwnerContext = createContext(false);

interface SedeStampNoteProps {
  /** El pintor de la pantalla: su `notice` es el aviso de la sede que no tiene formato. */
  stamp: Pick<SedeStamp, 'notice'>;
  className?: string;
}

/**
 * El aviso de UNA sede sin formato para una pantalla con fechas, horas o
 * importes (DX-354b, E4/E7.2): una vez por pantalla, no por fila, con Reintentar
 * y «Configurar sede» solo para ADMIN. La región `role="status"` está montada
 * siempre y vacía; el aviso se rellena después, y así los lectores de pantalla
 * lo anuncian (un `role="status"` que nace relleno no se anuncia de forma fiable).
 */
export function SedeStampNote({ stamp, className }: SedeStampNoteProps) {
  const { notice } = stamp;
  const ownedByPage = useContext(SedeNoticeOwnerContext);
  // El fallo de la pantalla lo muestra el dueño de la página; el de una fila, su sección.
  const visible = notice && !(ownedByPage && notice.scope === 'screen') ? notice : null;
  return (
    <div role="status">
      {visible ? (
        <SedeConfigError
          kind={visible!.kind}
          variant="note"
          live={false}
          description={visible!.message}
          locationId={visible!.locationId}
          onRetry={visible!.retry}
          className={className}
        />
      ) : null}
    </div>
  );
}

/**
 * Dueño del aviso de una página con varias secciones (la ficha del paciente):
 * muestra UNA vez el fallo de la sede de la pantalla; los `SedeStampNote` de
 * dentro callan ese fallo y siguen mostrando el de sus filas.
 */
export function SedeNoticeOwner({ token, className, children }: { token: string; className?: string; children: ReactNode }) {
  const stamp = useSedeStamp(token);
  return (
    <>
      <SedeStampNote stamp={stamp} className={className} />
      <SedeNoticeOwnerContext.Provider value>{children}</SedeNoticeOwnerContext.Provider>
    </>
  );
}
