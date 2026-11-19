'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Download, Lock, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { saveCsv } from '@/lib/files/save-csv';
import {
  downloadReceivablesAgingSummaryCsv,
  getReceivablesAgingSummary,
  RECEIVABLES_HREF,
  type ReceivablesSummary,
} from '@/lib/reports/professional-reports-api';
import { notifyError } from '@/components/errors/notify';
import { RateCountNotice } from '@/components/payments/rate-count-notice';
import { AgingSummary } from '@/components/receivables/aging-summary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';

export const agingReportCopy = {
  scopeLocation: (name: string) => `Sede ${name} · importes por moneda, sin convertir`,
  scopeClinic: 'Toda la clínica · importes por moneda, sin convertir',
  asOf: (day: string) =>
    `Foto al ${day}: lo que se debe hoy, por antigüedad (el período no aplica). La sede es la activa en el menú, como en la cartera.`,
  openList: 'Ver la cartera con los pacientes',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exported: 'Reporte exportado.',
  exportError: 'No pudimos exportar la cartera.',
  loadError: 'No pudimos cargar la cartera por antigüedad.',
  forbiddenTitle: 'Tu rol no tiene acceso a la cartera.',
  forbiddenHint: 'La ven la administración y recepción.',
  empty: 'Nadie debe',
  emptyHint: 'Cuando un paciente tenga saldo pendiente, aparecerá aquí por tramo de antigüedad.',
  loading: 'Cargando la cartera',
};

/**
 * «Cartera» (DX-304), pestaña de Reportes: los totales por tramo (por vencer,
 * 0–30, 31–60, 61–90, >90 días) de cada moneda, sin mezclarlas. REUTILIZA la
 * API de la cartera (DX-145, `GET /receivables/aging/summary`, sin pacientes)
 * y su resumen (`AgingSummary`); la lista con los pacientes sigue en su
 * pantalla, a la que se enlaza. Es una foto a hoy de la sede activa: el
 * período de las demás pestañas no aplica. CSV de los totales, solo ADMIN.
 */
export function ReceivablesAgingReportView({ token, isAdmin = false }: { token: string; isAdmin?: boolean }) {
  const stamp = useSedeStamp(token);
  const [data, setData] = useState<ReceivablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getReceivablesAgingSummary(token);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(apiErrorMessage(err, { fallback: agingReportCopy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      const text = await downloadReceivablesAgingSummaryCsv(token);
      saveCsv(text, `cartera-por-tramos-${data?.asOf ?? 'hoy'}.csv`, { bom: true });
      setNotice(agingReportCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: agingReportCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  const c = agingReportCopy;
  if (forbidden) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={c.forbiddenTitle} description={c.forbiddenHint} />;
  }
  const location = data?.scope.location;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="aging-report-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span>{location ? c.scopeLocation(location.name) : c.scopeClinic}</span>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary">
          <Link href={RECEIVABLES_HREF}>
            <Wallet aria-hidden />
            {c.openList}
          </Link>
        </Button>
        {isAdmin ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void exportCsv()}
            disabled={exporting || loading || Boolean(loadError)}
          >
            <Download aria-hidden />
            {exporting ? c.exporting : c.export}
          </Button>
        ) : null}
      </div>
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      {data && !loading && !loadError ? (
        <p className="max-w-[80ch] text-sm text-muted">{c.asOf(stamp.civilDate(data.asOf))}</p>
      ) : null}
      <AsyncSection
        loading={loading && !data}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={data?.totals.length === 0}
        emptyTitle={c.empty}
        emptyDescription={c.emptyHint}
        skeleton={<Skeleton role="status" aria-label={c.loading} className="h-40 w-full rounded-xl" />}
      >
        {data ? (
          <div className="flex min-w-0 flex-col gap-3" data-testid="aging-report">
            <AgingSummary totals={data.totals} stamp={stamp} />
            <RateCountNotice
              paymentsCount={data.paymentsWithoutRateCount}
              timedOut={data.rateProviderTimedOut}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>
        ) : null}
      </AsyncSection>
    </div>
  );
}
