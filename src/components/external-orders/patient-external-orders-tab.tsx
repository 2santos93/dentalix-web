'use client';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, FileText, Link2, Link2Off, Plus, Printer, Send, Ban, ClipboardList } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import {
  canIssueExternalOrders,
  canSeeClinicalNote,
  canSendExternalOrderCopy,
  canUnlinkExternalOrderResult,
  canVoidExternalOrder,
  EXTERNAL_ORDER_KIND_LABELS,
  listPatientExternalOrders,
  PENDING_EXTERNAL_ORDERS_HREF,
  unlinkExternalOrderResult,
  type ExternalOrder,
} from '@/lib/external-orders/external-orders-api';
import { externalOrderAgeDays, externalOrderAgeLabel } from '@/lib/external-orders/order-age';
import { openExternalOrderPdf } from '@/lib/external-orders/open-external-order-pdf';
import { getPatientDocumentUrl } from '@/lib/patient-documents/patient-documents-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection } from '@/components/shared/async-section';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

// Los diálogos llegan en su propio trozo de JS al abrirse (solo se montan abiertos).
const IssueExternalOrderModal = dynamic(
  () => import('./issue-external-order-modal').then((m) => m.IssueExternalOrderModal),
  { ssr: false },
);
const VoidExternalOrderModal = dynamic(
  () => import('./void-external-order-modal').then((m) => m.VoidExternalOrderModal),
  { ssr: false },
);
const SendExternalOrderCopyModal = dynamic(
  () => import('./send-external-order-copy-modal').then((m) => m.SendExternalOrderCopyModal),
  { ssr: false },
);
const LinkExternalOrderResultModal = dynamic(
  () => import('./link-external-order-result-modal').then((m) => m.LinkExternalOrderResultModal),
  { ssr: false },
);

export const patientExternalOrdersCopy = {
  heading: 'Órdenes',
  support:
    'Órdenes de estudios y referencias a especialistas externos. Una emitida no se edita: solo se anula con motivo. Al llegar el resultado, se liga a la orden.',
  issue: 'Nueva orden',
  pendingLink: 'Órdenes sin resultado',
  empty: 'Este paciente no tiene órdenes.',
  emptyHintIssuer: 'Emite una orden de estudios o una referencia con «Nueva orden»; su PDF queda en «Documentos».',
  emptyHint: 'Las emite odontología o administración; aquí se imprimen, se envían al paciente y se liga su resultado.',
  loadError: 'No pudimos cargar las órdenes.',
  loading: 'Cargando órdenes',
  tableLabel: 'Órdenes del paciente',
  colNumber: 'Orden',
  colIssued: 'Emitida',
  colRecipient: 'Destinatario',
  colStatus: 'Estado',
  colAge: 'Antigüedad',
  colDocument: 'Documento',
  number: (n: string) => `nº ${n}`,
  issuedBy: (who: string) => `por ${who}`,
  unknownUser: 'un usuario',
  teeth: (list: string) => `Dientes ${list}`,
  note: (text: string) => `Nota clínica: ${text}`,
  hasNote: 'Lleva nota clínica',
  resultLinked: (when: string, who: string) => `Ligado el ${when} por ${who}`,
  viewResult: 'Ver resultado',
  viewResultError: 'No pudimos abrir el resultado.',
  voidedDetail: (when: string, who: string, reason: string) => `Anulada el ${when} por ${who}. Motivo: ${reason}`,
  print: 'Ver e imprimir',
  printWithNote: 'Con la nota clínica',
  printWithoutNote: 'Sin la nota clínica',
  printHint: (number: string) => `orden nº ${number} (se abre en otra pestaña)`,
  printError: 'No pudimos abrir el PDF de la orden.',
  send: 'Enviar al paciente',
  link: 'Ligar resultado',
  unlink: 'Desligar resultado',
  unlinkError: 'No pudimos desligar el resultado.',
  void: 'Anular',
  rowLabel: (kind: string, number: string) => `${kind} · orden nº ${number}`,
};

const copy = patientExternalOrdersCopy;

interface PatientExternalOrdersTabProps {
  token: string;
  patientId: string;
}

function TabSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

function fileNameOf(order: ExternalOrder): string {
  return `orden-${order.numberLabel}.pdf`;
}

/**
 * Pestaña «Órdenes» de la ficha (DX-572), los cuatro roles. Lista las órdenes de
 * estudios y las referencias (las anuladas, con quién, cuándo y por qué), con la
 * fecha y la antigüedad en días civiles de SU sede. «Nueva orden» solo DENTIST y
 * ADMIN. Por orden: «Ver e imprimir» (los roles clínicos eligen con o sin la
 * nota; recepción, sin), «Enviar al paciente», «Ligar resultado», «Desligar
 * resultado», «Ver resultado» y «Anular» (ADMIN o quien la emitió). Recepción
 * nunca ve la nota: solo el aviso «Lleva nota clínica».
 */
export function PatientExternalOrdersTab({ token, patientId }: PatientExternalOrdersTabProps) {
  const role = getTokenRole(token);
  const userId = getTokenUserId(token);
  const clinical = canSeeClinicalNote(role);
  const canIssue = canIssueExternalOrders(role);
  const [orders, setOrders] = useState<ExternalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [issueKey, setIssueKey] = useState<number | null>(null);
  const [voiding, setVoiding] = useState<ExternalOrder | null>(null);
  const [sending, setSending] = useState<ExternalOrder | null>(null);
  const [linking, setLinking] = useState<ExternalOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const stamp = useSedeStamp(
    token,
    orders.map((o) => o.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientExternalOrders(token, patientId);
        if (cancelled) return;
        setOrders(data);
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

  function replace(updated: ExternalOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  async function print(order: ExternalOrder, withNote: boolean) {
    setBusyId(order.id);
    try {
      await openExternalOrderPdf(token, order.id, withNote, fileNameOf(order));
    } catch (err) {
      // Escalón 3: la lista sigue correcta; el reintento repite ESTA impresión.
      notifyError(apiErrorMessage(err, copy.printError), { onRetry: () => void print(order, withNote) });
    } finally {
      setBusyId(null);
    }
  }

  async function unlink(order: ExternalOrder) {
    setBusyId(order.id);
    try {
      replace(await unlinkExternalOrderResult(token, order.id));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.unlinkError), { onRetry: () => void unlink(order) });
    } finally {
      setBusyId(null);
    }
  }

  async function viewResult(order: ExternalOrder) {
    const documentId = order.resultDocumentId;
    if (!documentId) return;
    // La pestaña se abre dentro del clic; la URL firmada llega después.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      let url: string;
      try {
        url = (await getPatientDocumentUrl(token, patientId, documentId, 'inline')).url;
      } catch (err) {
        // DOCX, DICOM o HEIC no se ven en el navegador (400): se descargan.
        if (!(err instanceof ApiError && err.status === 400)) throw err;
        url = (await getPatientDocumentUrl(token, patientId, documentId, 'attachment')).url;
      }
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      notifyError(apiErrorMessage(err, copy.viewResultError), { onRetry: () => void viewResult(order) });
    }
  }

  function numberCell(order: ExternalOrder) {
    return (
      <span className={cn('flex flex-col', order.status === 'VOIDED' && 'text-muted line-through')}>
        <span className="font-medium">{EXTERNAL_ORDER_KIND_LABELS[order.kind]}</span>
        <span className="t-id t-caption text-muted">{copy.number(order.numberLabel)}</span>
      </span>
    );
  }

  function issuedCell(order: ExternalOrder) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="t-data">{stamp.date(order.issuedAt, order.locationId)}</span>
        <span className="t-caption text-muted">{copy.issuedBy(order.issuedByName ?? copy.unknownUser)}</span>
      </div>
    );
  }

  function recipientCell(order: ExternalOrder) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-ink [overflow-wrap:anywhere]">{order.recipient}</span>
        <span className="t-caption text-muted [overflow-wrap:anywhere]">{order.items.join(' · ')}</span>
        {order.toothNumbers.length > 0 ? (
          <span className="t-caption t-data text-muted">{copy.teeth(order.toothNumbers.join(', '))}</span>
        ) : null}
        {order.clinicalNote ? (
          <span className="t-caption text-ink [overflow-wrap:anywhere]">{copy.note(order.clinicalNote)}</span>
        ) : order.hasClinicalNote && !clinical ? (
          <Badge variant="neutral" className="self-start">
            {copy.hasNote}
          </Badge>
        ) : null}
      </div>
    );
  }

  function statusCell(order: ExternalOrder) {
    return (
      <div data-status={order.status} className="flex min-w-0 flex-col gap-1">
        <StatusBadge kind="externalOrder" status={order.status} />
        {order.status === 'RESULT_RECEIVED' && order.resultLinkedAt ? (
          <p className="t-caption text-muted">
            {copy.resultLinked(
              stamp.date(order.resultLinkedAt, order.locationId),
              order.resultLinkedByName ?? copy.unknownUser,
            )}
          </p>
        ) : null}
        {order.status === 'VOIDED' && order.voidedAt ? (
          <p className="t-caption text-ink [overflow-wrap:anywhere]">
            {copy.voidedDetail(
              stamp.dateTime(order.voidedAt, order.locationId),
              order.voidedByName ?? copy.unknownUser,
              order.voidReason ?? '',
            )}
          </p>
        ) : null}
      </div>
    );
  }

  function ageOf(order: ExternalOrder): string | null {
    if (order.status !== 'ISSUED') return null;
    const days = externalOrderAgeDays(order.issuedAt, stamp.clock?.of(order.locationId)?.timeZone ?? null);
    return days === null ? null : externalOrderAgeLabel(days);
  }

  function documentCell(order: ExternalOrder) {
    const busy = busyId === order.id;
    const hint = <span className="sr-only"> · {copy.printHint(order.numberLabel)}</span>;
    const printButton =
      clinical && order.hasClinicalNote ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="max-sm:min-h-11"
              disabled={busy}
              aria-busy={busy || undefined}
            >
              <Printer aria-hidden />
              {copy.print}
              {hint}
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void print(order, true)}>{copy.printWithNote}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void print(order, false)}>{copy.printWithoutNote}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="max-sm:min-h-11"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => void print(order, false)}
        >
          <Printer aria-hidden />
          {copy.print}
          {hint}
        </Button>
      );
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {printButton}
        {order.status === 'RESULT_RECEIVED' && order.resultDocumentId ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="max-sm:min-h-11"
            onClick={() => void viewResult(order)}
          >
            <FileText aria-hidden />
            {copy.viewResult}
            <span className="sr-only"> · {copy.number(order.numberLabel)}</span>
          </Button>
        ) : null}
      </div>
    );
  }

  function rowActions(order: ExternalOrder): RowAction[] {
    const actor = { role, userId };
    const actions: RowAction[] = [];
    if (canSendExternalOrderCopy(order)) {
      actions.push({ label: copy.send, icon: <Send aria-hidden />, onSelect: () => setSending(order) });
    }
    if (order.status === 'ISSUED') {
      actions.push({ label: copy.link, icon: <Link2 aria-hidden />, onSelect: () => setLinking(order) });
    }
    if (canUnlinkExternalOrderResult(order, actor)) {
      actions.push({ label: copy.unlink, icon: <Link2Off aria-hidden />, onSelect: () => void unlink(order) });
    }
    if (canVoidExternalOrder(order, actor)) {
      actions.push({
        label: copy.void,
        icon: <Ban aria-hidden />,
        onSelect: () => setVoiding(order),
        destructive: true,
        separatorBefore: actions.length > 0,
      });
    }
    return actions;
  }

  const columns: DataListColumn<ExternalOrder>[] = [
    { id: 'number', header: copy.colNumber, mobile: 'primary', cell: numberCell, cellClassName: 'align-top' },
    {
      id: 'issued',
      header: copy.colIssued,
      cell: issuedCell,
      mobileCell: (order) => stamp.maybe.date(order.issuedAt, order.locationId),
      cellClassName: 'align-top',
    },
    {
      id: 'recipient',
      header: copy.colRecipient,
      cell: recipientCell,
      mobileCell: (order) => <span className="block">{recipientCell(order)}</span>,
      cellClassName: 'align-top',
    },
    { id: 'status', header: copy.colStatus, mobile: 'trailing', cell: statusCell, cellClassName: 'align-top' },
    {
      id: 'age',
      header: copy.colAge,
      numeric: true,
      cell: (order) => ageOf(order) ?? '—',
      mobileCell: (order) => ageOf(order),
      cellClassName: 'align-top',
      showFrom: 'lg',
    },
    {
      id: 'document',
      header: <span className="sr-only">{copy.colDocument}</span>,
      cell: documentCell,
      mobileCell: (order) => <div className="mt-2">{documentCell(order)}</div>,
      align: 'end',
      cellClassName: 'align-top',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={copy.heading}
        description={<span className="block max-w-[68ch]">{copy.support}</span>}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href={PENDING_EXTERNAL_ORDERS_HREF}>
                <ClipboardList aria-hidden />
                {copy.pendingLink}
              </Link>
            </Button>
            {canIssue ? (
              <Button type="button" onClick={() => setIssueKey((k) => (k ?? 0) + 1)} className="w-full sm:w-auto">
                <Plus aria-hidden />
                {copy.issue}
              </Button>
            ) : null}
          </div>
        }
      />

      <SedeStampNote stamp={stamp} />

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={orders.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={canIssue ? copy.emptyHintIssuer : copy.emptyHint}
        emptyIcon={<ClipboardList aria-hidden />}
        skeleton={<TabSkeleton />}
      >
        {/* Sin «Editar» ni «Borrar»: la orden emitida es inmutable; solo se anula. */}
        <DataList
          label={copy.tableLabel}
          rows={orders}
          columns={columns}
          getRowKey={(order) => order.id}
          getRowLabel={(order) => copy.rowLabel(EXTERNAL_ORDER_KIND_LABELS[order.kind], order.numberLabel)}
          rowActions={rowActions}
        />
      </AsyncSection>

      {issueKey !== null ? (
        <IssueExternalOrderModal
          key={issueKey}
          open
          onOpenChange={(open) => {
            if (!open) setIssueKey(null);
          }}
          token={token}
          patientId={patientId}
          onIssued={(order) => setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)])}
        />
      ) : null}
      {sending ? (
        <SendExternalOrderCopyModal
          key={sending.id}
          open
          onOpenChange={(open) => {
            if (!open) setSending(null);
          }}
          token={token}
          orderId={sending.id}
          numberLabel={sending.numberLabel}
          formatDate={(iso) => stamp.date(iso, sending.locationId)}
        />
      ) : null}
      {linking ? (
        <LinkExternalOrderResultModal
          key={linking.id}
          open
          onOpenChange={(open) => {
            if (!open) setLinking(null);
          }}
          token={token}
          patientId={patientId}
          order={linking}
          onLinked={replace}
        />
      ) : null}
      {voiding ? (
        <VoidExternalOrderModal
          key={voiding.id}
          open
          onOpenChange={(open) => {
            if (!open) setVoiding(null);
          }}
          token={token}
          order={voiding}
          onVoided={replace}
        />
      ) : null}
    </div>
  );
}
