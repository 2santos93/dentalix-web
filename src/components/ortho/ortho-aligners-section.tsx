'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Layers, PackagePlus, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  ALIGNER_STATE_LABELS,
  getOrthoAligners,
  nextTrayToDeliver,
  ORTHO_ARCH_LABELS,
  trayLabel,
  type OrthoAligners,
  type OrthoAlignerSeries,
} from '@/lib/ortho/ortho-billing';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { SectionError } from '@/components/errors/section-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DeliveryVisitOption } from './ortho-aligner-dialogs';

// Los formularios llegan en su propio trozo, al abrirlos.
const OrthoAlignerSeriesDialog = dynamic(
  () => import('./ortho-aligner-dialogs').then((m) => m.OrthoAlignerSeriesDialog),
  { ssr: false },
);
const OrthoAlignerDeliveryDialog = dynamic(
  () => import('./ortho-aligner-dialogs').then((m) => m.OrthoAlignerDeliveryDialog),
  { ssr: false },
);

export const orthoAlignersCopy = {
  heading: 'Alineadores',
  loading: 'Cargando los alineadores',
  loadError: 'No pudimos cargar los alineadores.',
  empty: 'Este caso no tiene series de alineadores.',
  emptyHint: 'Abre la serie con la marca, las bandejas y los días por bandeja.',
  newSeries: 'Nueva serie',
  refine: 'Refinamiento',
  deliver: 'Registrar entrega',
  upper: 'Superior',
  lower: 'Inferior',
  noSeries: 'Sin serie',
  notStarted: 'Sin bandejas entregadas',
  needsDelivery: 'Sin bandejas: entregar',
  delivered: (last: number, total: number) => `Entregadas ${last} de ${total}`,
  nextChange: (date: string) => `Cambio de bandeja: ${date}`,
  end: (date: string) => `Fin previsto: ${date}`,
  series: (brand: string, n: number) => (n > 1 ? `${brand} · refinamiento ${n - 1}` : brand),
  meta: (arch: string, trays: number, days: number) => `${arch} · ${trays} bandejas · ${days} días por bandeja`,
  deliveries: 'Entregas',
  noDeliveries: 'Sin entregas todavía.',
  delivery: (from: number, to: number, date: string) =>
    from === to ? `Bandeja ${from} · ${date}` : `Bandejas ${from}–${to} · ${date}`,
  inVisit: 'en el control',
};
const copy = orthoAlignersCopy;

type Dialog = { kind: 'series'; refinementOf: OrthoAlignerSeries | null } | { kind: 'delivery'; series: OrthoAlignerSeries } | null;

function archStatus(series: OrthoAlignerSeries | undefined, stamp: SedePainters, locationId: string) {
  if (!series) return { text: copy.noSeries, detail: null, tone: 'neutral' as const };
  if (series.state === 'NEEDS_DELIVERY') {
    return {
      text: copy.needsDelivery,
      detail: trayLabel(series),
      tone: 'warning' as const,
    };
  }
  if (series.state === 'NOT_STARTED') return { text: copy.notStarted, detail: null, tone: 'neutral' as const };
  return {
    text: trayLabel(series) ?? ALIGNER_STATE_LABELS[series.state],
    detail:
      series.state === 'IN_PROGRESS' && series.nextChangeOn
        ? copy.nextChange(stamp.civilDate(series.nextChangeOn, locationId))
        : ALIGNER_STATE_LABELS[series.state],
    tone: series.state === 'FINISHED' ? ('success' as const) : ('info' as const),
  };
}

/**
 * Bloque «Alineadores» de la pestaña Ortodoncia (DX-285): la bandeja actual de
 * cada arcada (de su serie vigente), las series con sus entregas y
 * «Registrar entrega» (también desde un control). Escribir, solo odontología
 * y ADMIN.
 */
export function OrthoAlignersSection({
  token,
  patientId,
  caseId,
  locationId,
  canWrite,
  closed,
  visits,
  stamp,
}: {
  token: string;
  patientId: string;
  caseId: string;
  locationId: string;
  canWrite: boolean;
  closed: boolean;
  /** Controles del caso para «Entregada en el control». */
  visits: readonly DeliveryVisitOption[];
  stamp: SedePainters;
}) {
  const [view, setView] = useState<OrthoAligners | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    let cancelled = false;
    getOrthoAligners(token, patientId, caseId)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, caseId, reloadKey]);

  const writable = canWrite && !closed;
  const byId = new Map(view?.series.map((s) => [s.id, s]) ?? []);
  const upper = view?.upperSeriesId ? byId.get(view.upperSeriesId) : undefined;
  const lower = view?.lowerSeriesId ? byId.get(view.lowerSeriesId) : undefined;

  return (
    <section aria-labelledby="ortho-aligners" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="ortho-aligners" className="t-title flex items-center gap-2 text-ink">
          <Layers aria-hidden className="size-4 text-muted" />
          {copy.heading}
        </h4>
        {writable && view ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDialog({ kind: 'series', refinementOf: null })}
            className="w-full sm:w-auto"
          >
            <Plus aria-hidden />
            {copy.newSeries}
          </Button>
        ) : null}
      </div>
      {error ? (
        <SectionError title={copy.loadError} description={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : view === null ? (
        <div role="status" aria-label={copy.loading}>
          <Skeleton className="h-20 w-full" />
        </div>
      ) : view.series.length === 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-ink">{copy.empty}</p>
          {writable ? <p className="text-muted">{copy.emptyHint}</p> : null}
        </div>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            {(
              [
                [copy.upper, upper],
                [copy.lower, lower],
              ] as const
            ).map(([label, series]) => {
              const status = archStatus(series, stamp, locationId);
              return (
                <div key={label} className="flex min-w-0 flex-col gap-1 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
                  <dt className="t-label text-muted">{label}</dt>
                  <dd className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={status.tone} data-testid={`aligner-arch-${label}`}>
                        {status.text}
                      </Badge>
                    </span>
                    {status.detail ? <span className="t-caption text-muted">{status.detail}</span> : null}
                  </dd>
                </div>
              );
            })}
          </dl>
          <ul className="flex flex-col gap-3">
            {[...view.series].reverse().map((s) => {
              const next = nextTrayToDeliver(s);
              return (
                <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-border px-3 py-3 text-sm [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{copy.series(s.brand, s.sequence)}</span>
                      <span className="t-caption text-muted">
                        {copy.meta(ORTHO_ARCH_LABELS[s.arch], s.totalTrays, s.daysPerTray)}
                      </span>
                      <span className="t-caption text-muted">
                        {copy.delivered(s.lastDeliveredTray, s.totalTrays)}
                        {s.estimatedEndOn ? ` · ${copy.end(stamp.civilDate(s.estimatedEndOn, locationId))}` : ''}
                      </span>
                    </div>
                    {writable ? (
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        {next !== null ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setDialog({ kind: 'delivery', series: s })}
                            className="flex-1 sm:flex-none"
                          >
                            <PackagePlus aria-hidden />
                            {copy.deliver}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialog({ kind: 'series', refinementOf: s })}
                          className="flex-1 sm:flex-none"
                        >
                          {copy.refine}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {s.deliveries.length === 0 ? (
                    <p className="text-muted">{copy.noDeliveries}</p>
                  ) : (
                    <ol aria-label={copy.deliveries} className="flex flex-col gap-1">
                      {s.deliveries.map((d) => (
                        <li key={d.id} className="t-data text-ink">
                          {copy.delivery(d.fromTray, d.toTray, stamp.civilDate(d.deliveredOn, locationId))}
                          {d.visitId ? <span className="text-muted"> · {copy.inVisit}</span> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dialog?.kind === 'series' ? (
        <OrthoAlignerSeriesDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          token={token}
          patientId={patientId}
          caseId={caseId}
          refinementOf={dialog.refinementOf}
          onSaved={setView}
        />
      ) : null}
      {dialog?.kind === 'delivery' && view ? (
        <OrthoAlignerDeliveryDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          token={token}
          patientId={patientId}
          caseId={caseId}
          series={dialog.series}
          today={view.today}
          visits={visits}
          // Desde el control de hoy, si lo hay; si no, una entrega suelta.
          defaultVisitId={visits.find((v) => v.visitDate === view.today)?.id ?? null}
          onSaved={setView}
        />
      ) : null}
    </section>
  );
}
