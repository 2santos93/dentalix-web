'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ClipboardList, Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listPatientPostOpDeliveries,
  postOpPrintHref,
  type PostOpChannel,
  type PostOpDeliverySummary,
} from '@/lib/postop/postop-api';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { Skeleton } from '@/components/ui/skeleton';

const copy = {
  empty: 'Todavía no se han entregado indicaciones',
  emptyHint: 'Se entregan desde la cita, en el panel «Indicaciones»: impresas, por email o por WhatsApp.',
  loadError: 'No pudimos cargar las indicaciones entregadas.',
  loading: 'Cargando indicaciones entregadas',
  tableLabel: 'Indicaciones entregadas',
  colDate: 'Fecha',
  colInstructions: 'Indicaciones',
  colChannel: 'Canal',
  colBy: 'Entregó',
  colDocument: 'Documento',
  version: (code: string, version: number) => `${code} · v${version}`,
  channel: {
    PRINT: 'Impresa',
    EMAIL: 'Email',
    WHATSAPP_LINK: 'WhatsApp',
  } satisfies Record<PostOpChannel, string>,
  opened: 'Abierto',
  openedAt: (when: string) => `El paciente abrió el enlace el ${when}`,
  print: 'Ver e imprimir',
  printHint: (title: string) => `${title} (se abre en otra pestaña)`,
};

interface PatientPostOpDeliveriesProps {
  token: string;
  patientId: string;
}

function ListSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

function OpenedBadge({ at }: { at: string | null }) {
  if (!at) return null;
  return (
    <Badge variant="success" title={copy.openedAt(formatDateTime(at))}>
      {copy.opened}
    </Badge>
  );
}

/**
 * «Indicaciones entregadas» en la historia clínica (DX-222): cada entrega al
 * paciente, de la más reciente a la más antigua (orden de la API), con la
 * plantilla y su versión, el canal, quién la entregó y si el paciente abrió
 * el enlace. Cada fila abre la vista imprimible en otra pestaña.
 */
export function PatientPostOpDeliveries({ token, patientId }: PatientPostOpDeliveriesProps) {
  const [deliveries, setDeliveries] = useState<PostOpDeliverySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientPostOpDeliveries(token, patientId);
        if (cancelled) return;
        setDeliveries(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  function printLink(delivery: PostOpDeliverySummary) {
    return (
      <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
        <a href={postOpPrintHref(patientId, delivery.id)} target="_blank" rel="noopener">
          <Printer aria-hidden />
          {copy.print}
          <span className="sr-only"> · {copy.printHint(delivery.templateTitle)}</span>
        </a>
      </Button>
    );
  }

  const version = (d: PostOpDeliverySummary) => copy.version(d.templateCode, d.templateVersion);

  const columns: DataListColumn<PostOpDeliverySummary>[] = [
    {
      id: 'date',
      header: copy.colDate,
      mobile: 'trailing',
      cell: (d) => <span className="t-data">{formatDate(d.deliveredAt)}</span>,
    },
    {
      id: 'instructions',
      header: copy.colInstructions,
      mobile: 'primary',
      cell: (d) => (
        <span className="flex min-w-0 flex-col">
          <span className="break-words font-medium">{d.templateTitle}</span>
          <span className="t-caption t-data text-muted">{version(d)}</span>
        </span>
      ),
      mobileCell: (d) => d.templateTitle,
    },
    {
      id: 'channel',
      header: copy.colChannel,
      cell: (d) => (
        <span className="flex flex-wrap items-center gap-2">
          <span>{copy.channel[d.channel]}</span>
          <OpenedBadge at={d.firstOpenedAt} />
        </span>
      ),
      // En la tarjeta, la versión va con el canal (en la tabla, bajo el título).
      mobileCell: (d) => (
        <>
          <span>{version(d)}</span> · {copy.channel[d.channel]} <OpenedBadge at={d.firstOpenedAt} />
        </>
      ),
    },
    {
      id: 'by',
      header: copy.colBy,
      cell: (d) => <span className="text-muted">{d.deliveredByName}</span>,
      mobileCell: (d) => d.deliveredByName,
    },
    {
      id: 'document',
      header: <span className="sr-only">{copy.colDocument}</span>,
      align: 'end',
      cell: printLink,
      mobileCell: (d) => <span className="mt-2 block">{printLink(d)}</span>,
    },
  ];

  return (
    <AsyncSection
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<ListSkeleton />}
    >
      {/* Vacío compacto: es un bloque dentro de la historia clínica, no la página. */}
      <DataList
        label={copy.tableLabel}
        rows={deliveries}
        columns={columns}
        getRowKey={(d) => d.id}
        empty={
          <EmptyState
            size="inline"
            title={copy.empty}
            description={copy.emptyHint}
            icon={<ClipboardList aria-hidden />}
          />
        }
      />
    </AsyncSection>
  );
}
