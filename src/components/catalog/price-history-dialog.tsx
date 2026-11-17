'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listCatalogPriceHistory, type CatalogPriceHistoryEntry } from '@/lib/catalog/price-changes-api';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const priceHistoryCopy = {
  title: (name: string) => `Historial de precios · ${name}`,
  description: 'Cada cambio del precio por defecto, con quién lo hizo y cuándo. El historial no se edita ni se borra.',
  loading: 'Cargando el historial…',
  loadError: 'No pudimos cargar el historial de precios.',
  emptyTitle: 'Sin cambios de precio',
  emptyDescription: 'Cuando alguien cambie el precio de este ítem, aparecerá aquí.',
  listLabel: 'Cambios de precio',
  colDate: 'Fecha',
  colChange: 'Cambio',
  colAuthor: 'Autor',
  colSource: 'Origen',
  noPrice: 'Sin precio',
  change: (before: string, after: string) => `${before} → ${after}`,
  batch: 'Actualización en bloque',
  manual: 'Edición',
};

interface PriceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  item: { id: string; labelEs: string } | null;
  currency: string | null;
  stamp: SedePainters;
}

/**
 * «Historial de precios» de un ítem del catálogo (DX-205, solo ADMIN): cada
 * cambio del precio por defecto (edición suelta o «Actualizar precios»), del
 * más reciente al más antiguo. Lo pide al abrir; cada apertura vuelve a pedir.
 */
export function PriceHistoryDialog({ open, onOpenChange, token, item, currency, stamp }: PriceHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && item ? (
        <DialogContent className="sm:max-w-2xl" fullScreenOnMobile>
          <DialogHeader>
            <DialogTitle>{priceHistoryCopy.title(item.labelEs)}</DialogTitle>
            <DialogDescription>{priceHistoryCopy.description}</DialogDescription>
          </DialogHeader>
          <PriceHistoryBody token={token} itemId={item.id} currency={currency} stamp={stamp} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function PriceHistoryBody({
  token,
  itemId,
  currency,
  stamp,
}: {
  token: string;
  itemId: string;
  currency: string | null;
  stamp: SedePainters;
}) {
  const [entries, setEntries] = useState<CatalogPriceHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listCatalogPriceHistory(token, itemId)
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, priceHistoryCopy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, itemId, reloadKey]);

  const price = (amount: number | null | undefined) => {
    if (amount == null) return priceHistoryCopy.noPrice;
    if (currency) return stamp.money(amount, currency);
    return stamp.fmt ? stamp.fmt.number(amount, { min: 2, max: 2 }) : '—';
  };

  if (error) {
    return (
      <SectionError
        description={error}
        onRetry={() => {
          setError(null);
          setEntries(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (entries === null) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{priceHistoryCopy.loading}</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (entries.length === 0) {
    return <EmptyState title={priceHistoryCopy.emptyTitle} description={priceHistoryCopy.emptyDescription} />;
  }

  const columns: DataListColumn<CatalogPriceHistoryEntry>[] = [
    {
      id: 'change',
      header: priceHistoryCopy.colChange,
      mobile: 'primary',
      cell: (row) => (
        <span className="tabular-nums">{priceHistoryCopy.change(price(row.previousPrice), price(row.newPrice))}</span>
      ),
    },
    {
      id: 'date',
      header: priceHistoryCopy.colDate,
      cell: (row) => <span className="tabular-nums">{stamp.dateTime(row.createdAt)}</span>,
    },
    {
      id: 'author',
      header: priceHistoryCopy.colAuthor,
      cell: (row) => row.actorName,
    },
    {
      id: 'source',
      header: priceHistoryCopy.colSource,
      mobile: 'trailing',
      cell: (row) => (
        <Badge variant="neutral">{row.batchId ? priceHistoryCopy.batch : priceHistoryCopy.manual}</Badge>
      ),
    },
  ];

  return (
    <DataList label={priceHistoryCopy.listLabel} rows={entries} columns={columns} getRowKey={(row) => row.id} />
  );
}
