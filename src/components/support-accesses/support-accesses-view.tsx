'use client';
import { useEffect, useState } from 'react';
import { LifeBuoy, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  listSupportAccesses,
  type SupportAccess,
  type SupportAccessesPage,
} from '@/lib/support-accesses/support-accesses-api';
import { formatDateTime } from '@/lib/format/date';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { CursorPagination } from '@/components/audit/cursor-pagination';
import { OriginCell, originText } from '@/components/audit/origin-cell';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  tableLabel: 'Accesos de soporte a la clínica',
  colWho: 'Quién',
  colWhen: 'Cuándo',
  colReason: 'Por qué',
  colUntil: 'Hasta cuándo',
  colOrigin: 'Origen',
  until: (when: string) => `Hasta ${when}`,
  // Sin "Intenta de nuevo.": alimenta AsyncSection -> SectionError, que trae su botón.
  loadError: 'No pudimos cargar los accesos de soporte.',
  forbiddenTitle: 'Solo la administración de la clínica puede ver los accesos de soporte.',
  forbiddenHint: 'Pídele a quien administra la clínica que lo revise contigo.',
  empty: 'Nadie de Dentalix ha entrado a la clínica.',
  emptyHint:
    'Si alguna vez el equipo de soporte necesita entrar, aquí verás quién, cuándo y por qué.',
};

const PAGE_SIZE = 20;

/** Cabeceras en tipo frase (DESIGN.md → Caption: nunca en mayúsculas). */
const headerClassName = 'normal-case tracking-normal';

/**
 * Tabla en tablet y escritorio; en el teléfono, tarjeta: quién y cuándo en la
 * línea 1; por qué, hasta cuándo y el origen debajo.
 */
const columns: DataListColumn<SupportAccess>[] = [
  {
    id: 'who',
    header: copy.colWho,
    mobile: 'primary',
    headerClassName,
    cell: (a) => (
      <span className="flex min-w-0 flex-col">
        <span>{a.userFullName}</span>
        <span className="t-caption break-all">{a.userEmail}</span>
      </span>
    ),
    mobileCell: (a) => a.userFullName,
  },
  {
    id: 'when',
    header: copy.colWhen,
    mobile: 'trailing',
    headerClassName,
    cellClassName: 't-data whitespace-nowrap',
    cell: (a) => formatDateTime(a.createdAt),
  },
  {
    id: 'reason',
    header: copy.colReason,
    headerClassName,
    cell: (a) => <span className="block max-w-md whitespace-pre-line break-words">{a.reason}</span>,
    mobileCell: (a) => a.reason,
  },
  {
    id: 'until',
    header: copy.colUntil,
    headerClassName,
    cellClassName: 't-data whitespace-nowrap',
    cell: (a) => formatDateTime(a.expiresAt),
    mobileCell: (a) => copy.until(formatDateTime(a.expiresAt)),
  },
  {
    id: 'origin',
    header: copy.colOrigin,
    headerClassName,
    cell: (a) => <OriginCell ip={a.ip} userAgent={a.userAgent} />,
    mobileCell: (a) => (
      <>
        <span>{a.userEmail}</span>
        <span aria-hidden> · </span>
        <span>{originText(a.ip, a.userAgent)}</span>
      </>
    ),
  },
];

/**
 * El vacío enseña la forma del registro: las columnas que tendrá, en fantasma,
 * sobre el aviso de que aún no hay nada (critique-settings, accesos de soporte).
 */
function EmptyLog() {
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden
        className="t-caption grid h-10 grid-cols-4 items-center gap-3 rounded-lg bg-surface-sunken px-4"
      >
        <span>{copy.colWho}</span>
        <span>{copy.colWhen}</span>
        <span>{copy.colReason}</span>
        <span>{copy.colUntil}</span>
      </div>
      <EmptyState
        role="status"
        icon={<LifeBuoy aria-hidden />}
        title={copy.empty}
        description={copy.emptyHint}
      />
    </div>
  );
}

/**
 * Accesos de soporte (SEC-008): cada vez que un superadmin de Dentalix entró a
 * la clínica sin ser miembro (con verificación en dos pasos y un motivo). Solo
 * ADMIN; la API responde 403 a los demás. El registro no se puede editar ni
 * borrar: lista de solo lectura, sin acciones. Paginado por cursor
 * (Anterior/Siguiente con una pila de cursores), como la auditoría.
 */
export function SupportAccessesView({ token }: { token: string }) {
  // Pila de cursores: el último es la página que se ve; `null` = la primera.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [data, setData] = useState<SupportAccessesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listSupportAccesses(token, { limit: PAGE_SIZE, cursor });
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(copy.loadError);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, cursor, reloadKey]);

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={4} />}
      >
        <DataList
          label={copy.tableLabel}
          rows={items}
          columns={columns}
          getRowKey={(a) => a.id}
          empty={<EmptyLog />}
        />
      </AsyncSection>

      {!loadError && (cursors.length > 1 || data?.nextCursor) ? (
        <CursorPagination
          page={cursors.length}
          hasNext={Boolean(data?.nextCursor)}
          disabled={loading}
          onPrev={() => setCursors((stack) => stack.slice(0, -1))}
          onNext={() => {
            const next = data?.nextCursor;
            if (next) setCursors((stack) => [...stack, next]);
          }}
        />
      ) : null}
    </div>
  );
}
