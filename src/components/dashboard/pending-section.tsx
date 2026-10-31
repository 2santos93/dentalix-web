'use client';
import Link from 'next/link';
import { ChevronRight, RotateCw } from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { ANAMNESIS_HREF } from '@/components/layouts/nav-config';
import { getAnamnesisInboxSummary } from '@/lib/anamnesis/anamnesis-api';
import { listWaitlist } from '@/lib/appointments/waitlist-api';
import { getCurrentCashSession, type CurrentCashSession } from '@/lib/cash-sessions/cash-sessions-api';
import { listInventoryItems } from '@/lib/inventory/inventory-api';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  getClosingQueueCount,
  getFollowUpCount,
  getReceivablesSummary,
  getUnscheduledCount,
  overdueOf,
  type ReceivablesSummary,
} from './inicio-api';
import { canSeeBlock, type InicioBlock } from './inicio-roles';
import { useLoad, type LoadState } from './use-load';

export const pendingCopy = {
  heading: 'Pendientes',
  description: 'Lo que espera una acción. Cada fila abre donde se resuelve.',
  listLabel: 'Pendientes',
  upToDate: 'Al día',
  rowError: 'No se pudo cargar',
  retry: (label: string) => `Volver a cargar «${label}»`,
  loading: (label: string) => `Cargando «${label}»…`,
  closing: { label: 'Pendiente de cerrar', hint: 'Citas pasadas sin desenlace, evoluciones o tratamientos sin marcar' },
  closingMine: { label: 'Pendiente de cerrar', hint: 'Tus evoluciones y tratamientos sin marcar' },
  anamnesis: { label: 'Anamnesis por revisar', hint: 'Enviadas por los pacientes desde su enlace' },
  followUp: { label: 'Presupuestos por seguir', hint: 'Presentados hace más de 7 días, sin respuesta ni cita' },
  unscheduled: { label: 'Aceptados sin agendar', hint: 'Planes aceptados con visitas por agendar' },
  waitlist: { label: 'Pendientes por agendar', hint: 'Lista de espera: cancelaron o no vinieron' },
  receivables: { label: 'Cartera con saldo', hint: 'Pacientes que deben; lo vencido, por moneda' },
  receivablesOverdue: (parts: string[]) => `Vencido: ${parts.join(' · ')}`,
  receivablesNone: 'Nadie debe',
  patients: (n: string, one: boolean) => (one ? `${n} paciente` : `${n} pacientes`),
  cash: { label: 'Tu caja', hint: 'La caja del mostrador en la sede activa' },
  cashOpen: (time: string) => `Abierta desde ${time}`,
  cashClosed: 'Sin abrir',
  cashNeedsSede: 'Elige una sede',
  cashPayments: (n: string, one: boolean) => (one ? `${n} cobro` : `${n} cobros`),
  lowStock: { label: 'Bajo stock', hint: 'Insumos en su mínimo o por debajo' },
};
const copy = pendingCopy;

interface RowValue {
  /** Lo que se lee a la derecha: un número o un estado corto. */
  value: string;
  /** Hay algo que hacer: tinta; si no, `muted` («Al día»). */
  pending: boolean;
  tone?: 'warning';
  /** Sustituye a la línea de apoyo cuando el dato la concreta. */
  hint?: string;
}

interface Row {
  block: InicioBlock;
  id: string;
  label: string;
  hint: string;
  href: string;
  load: () => Promise<RowValue>;
  /** Clave de recarga además de la sede. */
  key?: string;
  /** No se puede pedir (p. ej. la caja sin sede): se pinta este valor sin llamar. */
  fixed?: RowValue;
}

function count(n: number, fmt: RegionalFormat | null): RowValue {
  return n > 0 ? { value: fmt ? fmt.number(n) : String(n), pending: true } : { value: copy.upToDate, pending: false };
}

export function receivablesValue(summary: ReceivablesSummary, fmt: RegionalFormat | null): RowValue {
  const patients = summary.totals.reduce((sum, t) => Math.max(sum, t.patients), 0);
  // Las monedas no se suman: un paciente puede deber en dos, así que el número
  // de la derecha es el mayor de cada moneda (nunca una suma que lo cuente dos veces).
  const overdue = summary.totals
    .map((t) => ({ currency: t.currency, amount: overdueOf(t) }))
    .filter((t) => t.amount > 0)
    .map((t) => (fmt ? moneyWithCode(t.amount, t.currency, fmt) : `${t.currency} ${t.amount}`));
  if (patients === 0) return { value: copy.upToDate, pending: false, hint: copy.receivablesNone };
  const n = fmt ? fmt.number(patients) : String(patients);
  return {
    value: copy.patients(n, patients === 1),
    pending: true,
    hint: overdue.length > 0 ? copy.receivablesOverdue(overdue) : undefined,
  };
}

export function cashValue(current: CurrentCashSession, timeZone: string, fmt: RegionalFormat | null): RowValue {
  const session = current.session;
  if (!session) return { value: copy.cashClosed, pending: true, tone: 'warning' };
  const time = fmt ? fmt.time(new Date(session.openedAt), timeZone) : '';
  const payments = session.expected?.reduce((sum, line) => sum + line.paymentsCount, 0) ?? null;
  return {
    value: copy.cashOpen(time),
    pending: false,
    hint:
      payments === null
        ? undefined
        : copy.cashPayments(fmt ? fmt.number(payments) : String(payments), payments === 1),
  };
}

export function PendingSection({
  token,
  role,
  activeLocationId,
  timeZone,
  fmt,
}: {
  token: string;
  role: ClinicRole;
  activeLocationId: string | null;
  timeZone: string;
  fmt: RegionalFormat | null;
}) {
  const rows: Row[] = [
    {
      block: 'closingQueue',
      id: 'closing',
      ...(role === 'DENTIST' ? copy.closingMine : copy.closing),
      href: '/agenda/pendiente-de-cerrar',
      load: async () => count((await getClosingQueueCount(token)).total, fmt),
    },
    {
      block: 'cash',
      id: 'cash',
      ...copy.cash,
      href: '/caja',
      load: async () => cashValue(await getCurrentCashSession(token), timeZone, fmt),
      fixed: activeLocationId ? undefined : { value: copy.cashNeedsSede, pending: false },
    },
    {
      block: 'anamnesis',
      id: 'anamnesis',
      ...copy.anamnesis,
      href: ANAMNESIS_HREF,
      load: async () => count((await getAnamnesisInboxSummary(token)).submitted, fmt),
    },
    {
      block: 'followUp',
      id: 'follow-up',
      ...copy.followUp,
      href: '/presupuestos',
      load: async () => count((await getFollowUpCount(token)).total, fmt),
    },
    {
      block: 'unscheduled',
      id: 'unscheduled',
      ...copy.unscheduled,
      href: '/presupuestos',
      load: async () => count((await getUnscheduledCount(token)).total, fmt),
    },
    {
      block: 'waitlist',
      id: 'waitlist',
      ...copy.waitlist,
      href: '/agenda',
      load: async () => count((await listWaitlist(token, { pageSize: 1 })).total, fmt),
    },
    {
      block: 'receivables',
      id: 'receivables',
      ...copy.receivables,
      href: '/caja/cartera',
      load: async () => receivablesValue(await getReceivablesSummary(token), fmt),
    },
    {
      block: 'lowStock',
      id: 'low-stock',
      ...copy.lowStock,
      href: '/inventory',
      load: async () => count((await listInventoryItems(token, { lowStockOnly: true, pageSize: 1 })).total, fmt),
    },
  ].filter((row) => canSeeBlock(row.block as InicioBlock, role)) as Row[];

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="inicio-pending-title" className="flex flex-col gap-3">
      <SectionHeader titleId="inicio-pending-title" title={copy.heading} description={copy.description} />
      <ul aria-label={copy.listLabel} className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface">
        {rows.map((row) => (
          <PendingRow key={row.id} row={row} scopeKey={`${activeLocationId ?? 'all'}|${fmt ? 'fmt' : 'raw'}`} />
        ))}
      </ul>
    </section>
  );
}

function PendingRow({ row, scopeKey }: { row: Row; scopeKey: string }) {
  const load = useLoad(row.load, `${row.id}|${scopeKey}|${row.key ?? ''}`, !row.fixed, copy.rowError);
  const state: LoadState<RowValue> = row.fixed ? { status: 'ready', data: row.fixed } : load;
  const ready = state.status === 'ready' ? state.data : null;
  const hint = ready?.hint ?? row.hint;

  return (
    <li className="relative flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-canvas sm:px-5" data-testid={`pending-${row.id}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={row.href}
          className="w-fit text-sm font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary-text"
        >
          {row.label}
        </Link>
        <span className="text-pretty text-xs text-muted">{hint}</span>
      </div>
      {state.status === 'error' ? (
        <span className="relative z-[1] flex shrink-0 items-center gap-1 text-xs text-danger-text">
          <span role="status">{copy.rowError}</span>
          <button
            type="button"
            onClick={load.reload}
            aria-label={copy.retry(row.label)}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-primary max-md:size-11"
          >
            <RotateCw aria-hidden className="size-4" />
          </button>
        </span>
      ) : ready ? (
        <span
          className={cn(
            't-data shrink-0 whitespace-nowrap text-right text-sm',
            ready.pending ? 'font-semibold text-ink' : 'text-muted',
            ready.tone === 'warning' && 'text-warning-text',
          )}
          data-testid={`pending-${row.id}-value`}
        >
          {ready.value}
        </span>
      ) : (
        <Skeleton className="h-4 w-10 shrink-0" aria-label={copy.loading(row.label)} />
      )}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
    </li>
  );
}
