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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  colActions: 'Acciones',
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
      <Button asChild variant="secondary" size="sm" className="min-h-11 w-full sm:w-auto md:min-h-0">
        <a href={postOpPrintHref(patientId, delivery.id)} target="_blank" rel="noopener">
          <Printer aria-hidden />
          {copy.print}
          <span className="sr-only"> · {copy.printHint(delivery.templateTitle)}</span>
        </a>
      </Button>
    );
  }

  return (
    <AsyncSection
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      isEmpty={deliveries.length === 0}
      emptyTitle={copy.empty}
      emptyDescription={copy.emptyHint}
      emptyIcon={<ClipboardList aria-hidden />}
      skeleton={<ListSkeleton />}
    >
      <table
        aria-label={copy.tableLabel}
        className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
      >
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left">
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colDate}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colInstructions}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colChannel}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colBy}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
              <span className="sr-only">{copy.colActions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id} className="border-b border-hairline last:border-0">
              <td className="px-4 py-3 tabular-nums">{formatDate(delivery.deliveredAt)}</td>
              <td className="px-4 py-3">
                <span className="font-medium">{delivery.templateTitle}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {copy.version(delivery.templateCode, delivery.templateVersion)}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{copy.channel[delivery.channel]}</span>
                  <OpenedBadge at={delivery.firstOpenedAt} />
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{delivery.deliveredByName}</td>
              <td className="px-4 py-3 text-right">{printLink(delivery)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
        {deliveries.map((delivery) => (
          <li
            key={delivery.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-medium">{delivery.templateTitle}</p>
                <p className="text-xs text-muted tabular-nums">
                  {copy.version(delivery.templateCode, delivery.templateVersion)}
                </p>
              </div>
              <OpenedBadge at={delivery.firstOpenedAt} />
            </div>
            <p className="text-muted">
              <span className="tabular-nums">{formatDate(delivery.deliveredAt)}</span> ·{' '}
              {copy.channel[delivery.channel]} · {delivery.deliveredByName}
            </p>
            {printLink(delivery)}
          </li>
        ))}
      </ul>
    </AsyncSection>
  );
}
