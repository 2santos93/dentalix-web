'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LifeBuoy, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  listSupportAccesses,
  type SupportAccess,
  type SupportAccessesPage,
} from '@/lib/support-accesses/support-accesses-api';
import { formatDateTime } from '@/lib/format/date';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  tableLabel: 'Accesos de soporte a la clínica',
  colWhen: 'Fecha y hora',
  colWho: 'Soporte de Dentalix',
  colReason: 'Motivo',
  colUntil: 'Válido hasta',
  colOrigin: 'Origen',
  noIp: 'Sin IP',
  // Sin "Intenta de nuevo.": alimenta AsyncSection -> SectionError, que trae su botón.
  loadError: 'No pudimos cargar los accesos de soporte.',
  forbiddenTitle: 'Solo la administración de la clínica puede ver los accesos de soporte.',
  forbiddenHint: 'Pídele a quien administra la clínica que lo revise contigo.',
  empty: 'Nadie de Dentalix ha entrado a la clínica.',
  emptyHint:
    'Si alguna vez el equipo de soporte necesita entrar, aquí verás quién, cuándo y por qué.',
  pagination: 'Paginación',
  prev: 'Anterior',
  next: 'Siguiente',
  page: (n: number) => `Página ${n}`,
};

const PAGE_SIZE = 20;

/**
 * Accesos de soporte (SEC-008): cada vez que un superadmin de Dentalix entró a
 * la clínica sin ser miembro (con verificación en dos pasos y un motivo). Solo
 * ADMIN; la API responde 403 a los demás. El registro no se puede editar ni
 * borrar. Paginado por cursor (Anterior/Siguiente con una pila de cursores),
 * como la auditoría.
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
        isEmpty={items.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<LifeBuoy aria-hidden />}
        skeleton={<TableSkeleton rows={4} />}
      >
        <Card className="overflow-hidden p-0">
          <Table aria-label={copy.tableLabel}>
            <caption className="sr-only">{copy.tableLabel}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">{copy.colWhen}</TableHead>
                <TableHead scope="col">{copy.colWho}</TableHead>
                <TableHead scope="col">{copy.colReason}</TableHead>
                <TableHead scope="col">{copy.colUntil}</TableHead>
                <TableHead scope="col">{copy.colOrigin}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((access) => (
                <SupportAccessRow key={access.id} access={access} />
              ))}
            </TableBody>
          </Table>
        </Card>
      </AsyncSection>

      {!loadError && (cursors.length > 1 || data?.nextCursor) ? (
        <nav
          aria-label={copy.pagination}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
        >
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {copy.page(cursors.length)}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || cursors.length <= 1}
              onClick={() => setCursors((stack) => stack.slice(0, -1))}
            >
              <ChevronLeft /> {copy.prev}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || !data?.nextCursor}
              onClick={() => {
                const next = data?.nextCursor;
                if (next) setCursors((stack) => [...stack, next]);
              }}
            >
              {copy.next} <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function SupportAccessRow({ access }: { access: SupportAccess }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums" data-label={copy.colWhen}>
        {formatDateTime(access.createdAt)}
      </TableCell>
      <TableCell data-label={copy.colWho}>
        <span className="block font-medium text-ink">{access.userFullName}</span>
        <span className="block break-all text-xs text-muted">{access.userEmail}</span>
      </TableCell>
      <TableCell data-label={copy.colReason} className="min-w-0">
        <span className="block max-w-md whitespace-pre-line break-words text-ink">
          {access.reason}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums" data-label={copy.colUntil}>
        {formatDateTime(access.expiresAt)}
      </TableCell>
      <TableCell data-label={copy.colOrigin}>
        <span className="block tabular-nums text-ink">{access.ip ?? copy.noIp}</span>
        {access.userAgent ? (
          <span className="block max-w-56 truncate text-xs text-muted" title={access.userAgent}>
            {access.userAgent}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
