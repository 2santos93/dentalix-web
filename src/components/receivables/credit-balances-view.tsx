'use client';
import * as React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { ResultCount } from '@/components/shared/list-toolbar';
import { RateCountNotice } from '@/components/payments/rate-count-notice';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import type { CreditBalanceRow } from '@/lib/receivables/credit-balances-api';
import { carteraNavFor, carteraPanelProps, type CarteraViewTabs } from './cartera-tabs';
import { debtorCopy, statementHref } from './debtor-parts';
import { ScopeMarker } from './scope-marker';
import { creditRowKey, useCreditBalances } from './use-credit-balances';

export const creditBalancesCopy = {
  title: 'Cartera',
  description:
    'Pacientes con dinero a favor en cada sede: lo abonado de más o en un plan cancelado, ya descontados traspasos y devoluciones. Abre su estado de cuenta para aplicarlo a otro plan o devolverlo.',
  listLabel: 'Pacientes con saldo a favor',
  countNoun: 'saldo a favor',
  countNounPlural: 'saldos a favor',
  colPatient: 'Paciente',
  colLocation: 'Sede',
  colCredit: 'A favor',
  colSince: 'Antigüedad',
  noDate: 'Sin fecha',
  since: (date: string) => `Desde el ${date}`,
  today: 'hoy',
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  emptyTitle: 'Ningún paciente con saldo a favor',
  emptyHint:
    'Cuando un paciente abone de más o cancele un plan con abonos, aparecerá aquí para aplicarle ese dinero o devolvérselo.',
  forbiddenTitle: 'Tu rol no tiene acceso a la cartera.',
  forbiddenHint: 'La cartera es para administración y recepción. Pídele acceso a quien administra la clínica.',
  asOf: (day: string) => `Antigüedad contada al ${day}, en días del calendario de la sede.`,
  loadMore: 'Cargar más',
  loadingMore: 'Cargando…',
  shown: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
  added: (n: number) => (n === 1 ? 'Se añadió 1 saldo a la lista.' : `Se añadieron ${n} saldos a la lista.`),
  providerDetail: (n: number) =>
    n === 1
      ? 'La lista todavía no cuenta 1 abono en otra moneda: el saldo a favor puede ser mayor.'
      : `La lista todavía no cuenta ${n} abonos en otra moneda: el saldo a favor puede ser mayor.`,
  withoutRateBody:
    'La lista todavía no los cuenta: falta la tasa de cambio de su día, y el saldo a favor puede ser mayor. El estado de cuenta de cada paciente dice cuáles son.',
};

/** Días desde el abono, en palabras de calendario («hoy», «1 día», «15 días»). */
function ageText(days: number | null): string | null {
  if (days === null) return null;
  return days === 0 ? creditBalancesCopy.today : debtorCopy.days(days);
}

/**
 * Cartera › Saldo a favor (DX-430): a quién le debe dinero la clínica. Una
 * fila por paciente y moneda, de mayor a menor importe; cada importe y fecha
 * con el formato de SU sede (`row.location`, DX-354b), y toda la fila abre el
 * estado de cuenta, donde se traspasa o se devuelve (DX-253). «Cargar más»
 * añade páginas (DX-181).
 */
export function CreditBalancesView({ token, tabs }: { token: string; tabs?: CarteraViewTabs }) {
  const state = useCreditBalances(token);
  const { rows, head, loading, error, forbidden, reload, hasMore, loadMore, loadingMore, lastBatch } = state;
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.location?.id),
  );
  const location = head?.scope.location ?? null;

  const columns: DataListColumn<CreditBalanceRow>[] = [
    {
      id: 'patient',
      header: creditBalancesCopy.colPatient,
      mobile: 'primary',
      cell: (r) => <span className="block min-w-[9rem]">{r.patient.fullName}</span>,
      mobileCell: (r) => r.patient.fullName,
    },
    {
      id: 'location',
      header: creditBalancesCopy.colLocation,
      cell: (r) => r.location?.name ?? <span className="text-muted">—</span>,
      mobileCell: (r) => r.location?.name ?? null,
    },
    {
      id: 'since',
      header: creditBalancesCopy.colSince,
      cell: (r) => {
        const date = r.since ? stamp.civilDate(r.since, r.location?.id) : null;
        if (!date) return <span className="text-muted">{creditBalancesCopy.noDate}</span>;
        return (
          <span className="whitespace-nowrap">
            <span className="tabular-nums">{date}</span>
            <span className="text-muted tabular-nums"> · {ageText(r.ageDays)}</span>
          </span>
        );
      },
      mobileCell: (r) => {
        const date = r.since ? stamp.maybe.civilDate(r.since, r.location?.id) : null;
        return date ? `${creditBalancesCopy.since(date)} · ${ageText(r.ageDays)}` : null;
      },
    },
    {
      id: 'credit',
      header: creditBalancesCopy.colCredit,
      numeric: true,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => <span className="font-medium text-ink">{stamp.money(r.amount, r.currency, r.location?.id)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={creditBalancesCopy.title}
        description={creditBalancesCopy.description}
        meta={head ? <ScopeMarker location={location} /> : null}
      />
      {/* Sin acceso (403) no hay otra vista que ofrecer: solo el aviso. */}
      {!forbidden ? carteraNavFor(token, tabs) : null}

      <div className="flex flex-col gap-3" {...carteraPanelProps(tabs)}>
        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={creditBalancesCopy.forbiddenTitle}
            description={creditBalancesCopy.forbiddenHint}
          />
        ) : (
          <>
            <SedeStampNote stamp={stamp} />
            {head && !loading ? (
              <RateCountNotice
                paymentsCount={head.paymentsWithoutRateCount}
                timedOut={head.rateProviderTimedOut}
                onRetry={reload}
                providerDetail={creditBalancesCopy.providerDetail(head.paymentsWithoutRateCount)}
                withoutRateBody={creditBalancesCopy.withoutRateBody}
              />
            ) : null}

            <AsyncSection
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={rows.length === 0}
              emptyTitle={creditBalancesCopy.emptyTitle}
              emptyDescription={creditBalancesCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              <ResultCount
                total={state.total}
                noun={creditBalancesCopy.countNoun}
                nounPlural={creditBalancesCopy.countNounPlural}
              />

              <DataList
                label={creditBalancesCopy.listLabel}
                rows={rows}
                columns={columns}
                getRowKey={creditRowKey}
                getRowHref={(r) => statementHref(r.patient.id)}
                getRowLabel={(r) => r.patient.fullName}
              />

              {hasMore ? (
                <p className="text-xs tabular-nums text-muted">{creditBalancesCopy.shown(rows.length, state.total)}</p>
              ) : null}
              {hasMore ? (
                <Button
                  type="button"
                  variant="secondary"
                  aria-disabled={loadingMore}
                  className="self-start aria-disabled:pointer-events-none aria-disabled:opacity-60"
                  onClick={() => {
                    if (!loadingMore) loadMore();
                  }}
                >
                  {loadingMore ? creditBalancesCopy.loadingMore : creditBalancesCopy.loadMore}
                </Button>
              ) : null}
              <p role="status" aria-live="polite" className="sr-only">
                {lastBatch ? creditBalancesCopy.added(lastBatch.count) : ''}
              </p>

              {head ? (
                <p className="text-xs text-muted tabular-nums">{creditBalancesCopy.asOf(stamp.civilDate(head.asOf))}</p>
              ) : null}
            </AsyncSection>
          </>
        )}
      </div>
    </>
  );
}
