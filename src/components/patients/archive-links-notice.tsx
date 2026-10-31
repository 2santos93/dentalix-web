'use client';
import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { getPatientLivePublicLinks, type LivePublicLinks } from '@/lib/patients/patients-api';
import { FieldError } from '@/components/errors/field-error';
import { Skeleton } from '@/components/ui/skeleton';

type Kind = Exclude<keyof LivePublicLinks, 'total'>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Copy as constants (i18n-ready, es-first).
export const archiveLinksCopy = {
  loading: 'Comprobando los enlaces enviados…',
  error: 'No pudimos contar enlaces',
  none: 'No tiene enlaces enviados vigentes.',
  title: (n: number) =>
    n === 1 ? 'Se anulará 1 enlace enviado' : `Se anularán ${n} enlaces enviados`,
  explanation: 'El paciente ya no podrá usarlos, aunque después se desarchive.',
  listLabel: 'Enlaces que se anularán',
  kinds: {
    slotOffers: (n: number) => plural(n, 'oferta de hueco', 'ofertas de hueco'),
    consentSignatures: (n: number) =>
      plural(n, 'consentimiento por firmar', 'consentimientos por firmar'),
    budgetSignatures: (n: number) => plural(n, 'presupuesto por aceptar', 'presupuestos por aceptar'),
    signedPdfCopies: (n: number) =>
      plural(n, 'copia de un documento firmado', 'copias de documentos firmados'),
    anamnesis: (n: number) => plural(n, 'cuestionario de salud', 'cuestionarios de salud'),
  } satisfies Record<Kind, (n: number) => string>,
};

const KINDS = Object.keys(archiveLinksCopy.kinds) as Kind[];

type State =
  | { key: string; kind: 'loading' }
  | { key: string; kind: 'error' }
  | { key: string; kind: 'ready'; links: LivePublicLinks };

interface ArchiveLinksNoticeProps {
  token: string;
  patientId: string;
}

/**
 * DX-461: dentro del diálogo de archivar, cuántos enlaces enviados al
 * paciente (oferta de hueco, firma y presupuesto a distancia, copia del PDF,
 * cuestionario de salud) dejarán de servir. Se cuenta al abrir; si falla, el
 * aviso se sustituye en su sitio por un error con reintento (escalón 2): el
 * diálogo sigue sirviendo y la API anula igual al archivar.
 */
export function ArchiveLinksNotice({ token, patientId }: ArchiveLinksNoticeProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${token}:${patientId}:${reloadKey}`;
  const [state, setState] = useState<State>({ key, kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getPatientLivePublicLinks(token, patientId)
      .then((links) => {
        if (!cancelled) setState({ key, kind: 'ready', links });
      })
      .catch(() => {
        if (!cancelled) setState({ key, kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, key]);

  // Un estado de otra clave (otro paciente o un reintento) aún es «cargando».
  const current: State = state.key === key ? state : { key, kind: 'loading' };

  if (current.kind === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{archiveLinksCopy.loading}</span>
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-4 w-40 max-w-full" />
      </div>
    );
  }

  if (current.kind === 'error') {
    return (
      <FieldError
        label={archiveLinksCopy.error}
        className="w-full"
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  const { links } = current;
  if (links.total === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {archiveLinksCopy.none}
      </p>
    );
  }

  return (
    <div
      role="status"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-ink">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span className="tnum">{archiveLinksCopy.title(links.total)}</span>
      </p>
      <ul aria-label={archiveLinksCopy.listLabel} className="flex flex-col gap-1 pl-6 text-sm text-ink">
        {KINDS.filter((kind) => links[kind] > 0).map((kind) => (
          <li key={kind} className="tnum list-disc">
            {archiveLinksCopy.kinds[kind](links[kind])}
          </li>
        ))}
      </ul>
      <p className="pl-6 text-sm text-muted">{archiveLinksCopy.explanation}</p>
    </div>
  );
}
