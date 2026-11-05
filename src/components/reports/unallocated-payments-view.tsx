'use client';
import * as React from 'react';
import { useState } from 'react';
import { Building2, Download, Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { moneyWithCode } from '@/lib/format/sede-number';
import { saveCsv } from '@/lib/files/save-csv';
import {
  isWithinMonths,
  PERIOD_PRESETS,
  periodFor,
  PRODUCTION_MAX_PERIOD_MONTHS,
  type PeriodPresetKey,
} from '@/lib/reports/period-presets';
import {
  downloadUnallocatedPaymentsCsv,
  type UnallocatedPaymentRow,
  type UnallocatedPaymentsFilters,
} from '@/lib/reports/unallocated-payments-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { RateCountNotice } from '@/components/payments/rate-count-notice';
import { statementHref } from '@/components/receivables/debtor-parts';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DatePicker } from '@/components/ui/date-picker';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { NativeSelect } from '@/components/ui/native-select';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { ResultCount } from '@/components/shared/list-toolbar';
import { unallocatedRowKey, useUnallocatedPayments } from './use-unallocated-payments';

export const unallocatedCopy = {
  scope:
    'Abonos con algo sin imputar a ítems del plan, descontado lo que ya se devolvió o traspasó de su saldo a favor (de los abonos más recientes primero) · importes en la moneda del plan (el abono convertido con la tasa de su día); los totales no se suman entre monedas. El saldo a favor recibido por un traspaso no es un abono: está en Cartera › Saldo a favor',
  period: 'Período',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede del abono',
  locationAll: 'Todas tus sedes',
  inactive: '(desactivada)',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exported: 'Reporte exportado.',
  exportError: 'No pudimos exportar el reporte.',
  periodLine: (from: string, to: string) => `Abonos del ${from} al ${to}`,
  listLabel: 'Abonos con importe sin imputar',
  countNoun: 'abono',
  countNounPlural: 'abonos',
  totalsLabel: 'Total sin imputar por moneda',
  totalFor: (currency: string, count: number) => `${currency} · ${count} ${count === 1 ? 'abono' : 'abonos'}`,
  colPatient: 'Paciente',
  colLocation: 'Sede',
  colDate: 'Fecha del abono',
  colPayment: 'Importe del abono',
  colAllocated: 'Imputado',
  colUnallocated: 'Sin imputar',
  mobileUnallocated: (amount: string) => `Sin imputar ${amount}`,
  mobilePayment: (amount: string) => `Abono ${amount}`,
  mobileAllocated: (amount: string) => `Imputado ${amount}`,
  loadMore: 'Cargar más',
  loadingMore: 'Cargando…',
  shown: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
  added: (n: number) => (n === 1 ? 'Se añadió 1 abono a la lista.' : `Se añadieron ${n} abonos a la lista.`),
  withoutRateBody:
    'No están en la lista: es un abono en otra moneda que la del plan y falta la tasa de cambio de su día, así que todavía no se puede imputar. El estado de cuenta de cada paciente dice cuáles son.',
  providerDetail: (n: number) =>
    n === 1
      ? 'La lista todavía no cuenta 1 abono en otra moneda.'
      : `La lista todavía no cuenta ${n} abonos en otra moneda.`,
  emptyTitle: 'No hay cobros sin imputar en este período',
  emptyHint: 'Cada abono del período ya cubre ítems del plan. Prueba con otro período o con otra sede.',
  forbiddenTitle: 'Tu rol no tiene acceso a lo cobrado sin imputar.',
  forbiddenHint: 'Es para administración y recepción. Pídele acceso a quien administra la clínica.',
  badPeriod: 'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 24 meses.',
};

/** Una fila del informe: el abono, su sede y lo imputado, cada importe con el formato de SU sede. */
function useColumns(stamp: ReturnType<typeof useSedeStamp>): DataListColumn<UnallocatedPaymentRow>[] {
  return [
    {
      id: 'patient',
      header: unallocatedCopy.colPatient,
      mobile: 'primary',
      cell: (r) => <span className="block min-w-[9rem]">{r.patient.fullName}</span>,
      mobileCell: (r) => r.patient.fullName,
    },
    {
      id: 'location',
      header: unallocatedCopy.colLocation,
      cell: (r) => r.location.name,
      mobileCell: (r) => r.location.name,
    },
    {
      id: 'date',
      header: unallocatedCopy.colDate,
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{stamp.civilDate(r.paidOn, r.location.id)}</span>,
      mobileCell: (r) => stamp.maybe.civilDate(r.paidOn, r.location.id),
    },
    {
      id: 'payment',
      header: unallocatedCopy.colPayment,
      numeric: true,
      headerClassName: 'whitespace-nowrap',
      cell: (r) => <span className="whitespace-nowrap">{stamp.money(r.paymentAmount, r.paymentCurrency, r.location.id)}</span>,
      mobileCell: (r) => {
        const fmt = stamp.fmtOf(r.location.id);
        return fmt ? unallocatedCopy.mobilePayment(moneyWithCode(r.paymentAmount, r.paymentCurrency, fmt)) : null;
      },
    },
    {
      id: 'allocated',
      header: unallocatedCopy.colAllocated,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{stamp.money(r.allocated, r.planCurrency, r.location.id)}</span>,
      mobileCell: (r) => {
        const fmt = stamp.fmtOf(r.location.id);
        return fmt ? unallocatedCopy.mobileAllocated(moneyWithCode(r.allocated, r.planCurrency, fmt)) : null;
      },
    },
    {
      id: 'unallocated',
      header: unallocatedCopy.colUnallocated,
      numeric: true,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => (
        <span className="whitespace-nowrap font-medium text-ink">
          {stamp.money(r.unallocated, r.planCurrency, r.location.id)}
        </span>
      ),
      // En la tarjeta de 390 px la cifra clave dice qué es.
      mobileCell: (r) => {
        const fmt = stamp.fmtOf(r.location.id);
        return fmt ? unallocatedCopy.mobileUnallocated(moneyWithCode(r.unallocated, r.planCurrency, fmt)) : null;
      },
    },
  ];
}

/**
 * «Cobrado sin imputar / a cuenta» (DX-399), pestaña de Reportes para
 * administración y recepción: los abonos del período (días civiles de la sede
 * del abono) que todavía no cubren, o cubren solo en parte, ítems del plan.
 * Una fila por abono, con su sede, importe, lo imputado y lo que queda «a
 * cuenta»; cada importe y fecha con el formato de SU sede (DX-354b) y la fila
 * abre el estado de cuenta del paciente, donde está «Ver imputación». «Cargar
 * más» añade páginas; el CSV lleva las mismas filas, todas.
 */
export function UnallocatedPaymentsView({ token }: { token: string }) {
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;
  const [preset, setPreset] = useState<PeriodPresetKey>('this_month');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [locationId, setLocationId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const baseId = React.useId();

  const presetPeriod = today ? periodFor(preset, today) : null;
  const period = preset === 'custom' ? (custom ?? (today ? periodFor('this_month', today) : null)) : presetPeriod;
  const invalidPeriod = preset === 'custom' && period !== null && !isWithinMonths(period, PRODUCTION_MAX_PERIOD_MONTHS);
  const filters: UnallocatedPaymentsFilters | null =
    period && !invalidPeriod ? { ...period, ...(locationId ? { locationId } : {}) } : null;

  const state = useUnallocatedPayments(token, filters);
  const { rows, head, loading, error, forbidden, reload, hasMore, loadMore, loadingMore, lastBatch } = state;
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.location.id),
  );
  const columns = useColumns(stamp);
  const totalsLocation = head?.filters.locationId ?? undefined;

  async function exportCsv() {
    if (!filters) return;
    setExporting(true);
    setNotice(null);
    try {
      const text = await downloadUnallocatedPaymentsCsv(token, filters);
      saveCsv(text, `cobrado-sin-imputar-${filters.from}-${filters.to}.csv`, { bom: true });
      setNotice(unallocatedCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: unallocatedCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  function choosePreset(next: PeriodPresetKey) {
    if (next === 'custom' && period) setCustom(period);
    setPreset(next);
  }

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={unallocatedCopy.forbiddenTitle}
        description={unallocatedCopy.forbiddenHint}
      />
    );
  }

  const showError = !invalidPeriod && Boolean(error);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span>{unallocatedCopy.scope}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${baseId}-period`} label={unallocatedCopy.period} className="col-span-2 sm:col-span-1 sm:w-44">
            <NativeSelect
              id={`${baseId}-period`}
              value={preset}
              onChange={(e) => choosePreset(e.target.value as PeriodPresetKey)}
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {preset === 'custom' && period ? (
            <>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span id={`${baseId}-from`} className="text-sm font-medium text-ink">
                  {unallocatedCopy.from}
                </span>
                <DatePicker
                  aria-labelledby={`${baseId}-from`}
                  value={period.from}
                  max={period.to}
                  onChange={(value) => {
                    if (value) setCustom({ from: value, to: period.to });
                  }}
                  className="sm:w-48"
                  isInvalid={invalidPeriod}
                  aria-describedby={invalidPeriod ? `${baseId}-bad` : undefined}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span id={`${baseId}-to`} className="text-sm font-medium text-ink">
                  {unallocatedCopy.to}
                </span>
                <DatePicker
                  aria-labelledby={`${baseId}-to`}
                  value={period.to}
                  min={period.from}
                  onChange={(value) => {
                    if (value) setCustom({ from: period.from, to: value });
                  }}
                  className="sm:w-48"
                  isInvalid={invalidPeriod}
                  aria-describedby={invalidPeriod ? `${baseId}-bad` : undefined}
                />
              </div>
            </>
          ) : null}
          <FormField htmlFor={`${baseId}-location`} label={unallocatedCopy.location} className="min-w-0 sm:w-48">
            <NativeSelect
              id={`${baseId}-location`}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={!head}
            >
              <option value="">{unallocatedCopy.locationAll}</option>
              {head?.options.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.isActive ? l.name : `${l.name} ${unallocatedCopy.inactive}`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void exportCsv()}
          disabled={exporting || !filters || loading || showError}
          className="shrink-0 self-start lg:self-auto"
        >
          <Download aria-hidden />
          {exporting ? unallocatedCopy.exporting : unallocatedCopy.export}
        </Button>
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={`${baseId}-bad`}>{unallocatedCopy.badPeriod}</InlineError> : null}

      {invalidPeriod ? null : zone.status === 'error' && !period ? (
        <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
      ) : (
        <>
          <SedeStampNote stamp={stamp} />
          {head && !loading && !error ? (
            <RateCountNotice
              paymentsCount={head.paymentsWithoutRateCount}
              timedOut={false}
              onRetry={reload}
              providerDetail={unallocatedCopy.providerDetail(head.paymentsWithoutRateCount)}
              withoutRateBody={unallocatedCopy.withoutRateBody}
            />
          ) : null}

          <AsyncSection
            loading={loading}
            error={error}
            onRetry={reload}
            isEmpty={rows.length === 0}
            emptyTitle={unallocatedCopy.emptyTitle}
            emptyDescription={unallocatedCopy.emptyHint}
            skeleton={<TableSkeleton rows={5} />}
          >
            {head && stamp.ready ? (
              <p className="text-sm text-muted tabular-nums">
                {unallocatedCopy.periodLine(stamp.civilDate(head.from), stamp.civilDate(head.to))}
              </p>
            ) : null}
            {head && head.totals.length > 0 ? (
              <DescriptionList layout="inline" aria-label={unallocatedCopy.totalsLabel} className="max-w-md">
                {head.totals.map((t) => (
                  <DescriptionItem
                    key={t.currency}
                    label={unallocatedCopy.totalFor(t.currency, t.count)}
                    numeric
                    valueClassName="font-semibold"
                  >
                    {stamp.money(t.unallocated, t.currency, totalsLocation)}
                  </DescriptionItem>
                ))}
              </DescriptionList>
            ) : null}
            <ResultCount total={state.total} noun={unallocatedCopy.countNoun} nounPlural={unallocatedCopy.countNounPlural} />

            <DataList
              label={unallocatedCopy.listLabel}
              rows={rows}
              columns={columns}
              getRowKey={unallocatedRowKey}
              getRowHref={(r) => statementHref(r.patient.id)}
              getRowLabel={(r) => r.patient.fullName}
            />

            {hasMore ? (
              <p className="text-xs tabular-nums text-muted">{unallocatedCopy.shown(rows.length, state.total)}</p>
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
                {loadingMore ? unallocatedCopy.loadingMore : unallocatedCopy.loadMore}
              </Button>
            ) : null}
            <p role="status" aria-live="polite" className="sr-only">
              {lastBatch ? unallocatedCopy.added(lastBatch.count) : ''}
            </p>
          </AsyncSection>
        </>
      )}
    </div>
  );
}
