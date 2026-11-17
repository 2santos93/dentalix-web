'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { FileX, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  COMMISSIONS_HREF,
  COMMISSION_BASIS_LABELS,
  COMMISSION_RELEASE_LABELS,
  commissionSettlementPrintHref,
  getCommissionSettlement,
  percentText,
  type CommissionSettlement,
} from '@/lib/commissions/commissions-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SectionError } from '@/components/errors/section-error';
import { SectionSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { CommissionLines, CommissionTotals } from './commission-lines';

export const commissionSettlementViewCopy = {
  title: (name: string) => `Liquidación de ${name}`,
  titleLoading: 'Liquidación de honorarios',
  description: 'Congelada al cerrarse: no cambia nunca. Lo que se anule después sale como ajuste en la siguiente.',
  back: 'Honorarios',
  print: 'Imprimir',
  period: 'Período',
  rule: 'Regla',
  categories: 'Por categoría',
  closedAt: 'Cerrada',
  closedBy: 'Cerró',
  lock: 'Cierre contable',
  lockValue: (day: string) => `Cerrado hasta el ${day}`,
  periodValue: (from: string, to: string) => `${from} – ${to}`,
  ruleValue: (percent: string, basis: string, release: string) => `${percent} de ${basis}, ${release}`,
  loadError: 'No pudimos cargar la liquidación.',
  notFound: 'No encontramos esta liquidación.',
  notFoundHint: 'Puede que no sea tuya o que el enlace no sea de esta clínica.',
};

const copy = commissionSettlementViewCopy;

/** Una liquidación cerrada (DX-018): cabecera, totales por moneda, detalle e «Imprimir». */
export function CommissionSettlementView({ token, id }: { token: string; id: string }) {
  const [data, setData] = useState<CommissionSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const stamp = useSedeStamp(token, data?.lines.map((l) => l.locationId) ?? []);

  useEffect(() => {
    let cancelled = false;
    getCommissionSettlement(token, id)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNotFound(err instanceof ApiError && (err.status === 404 || err.status === 400));
        setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, id, reloadKey]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={data ? copy.title(data.professional.name) : copy.titleLoading}
        description={copy.description}
        back={{ href: COMMISSIONS_HREF, label: copy.back }}
        actions={
          data ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.open(commissionSettlementPrintHref(data.id), '_blank', 'noopener')}
            >
              <Printer aria-hidden />
              {copy.print}
            </Button>
          ) : undefined
        }
      />
      {data ? (
        <div className="flex flex-col gap-8">
          <SedeStampNote stamp={stamp} />
          <DescriptionList columns={3}>
            <DescriptionItem label={copy.period} numeric>
              {copy.periodValue(stamp.civilDate(data.period.from), stamp.civilDate(data.period.to))}
            </DescriptionItem>
            <DescriptionItem label={copy.rule}>
              {copy.ruleValue(
                percentText(data.percent),
                COMMISSION_BASIS_LABELS[data.basis].toLowerCase(),
                COMMISSION_RELEASE_LABELS[data.releaseMode].toLowerCase(),
              )}
            </DescriptionItem>
            {data.categoryPercents.length > 0 ? (
              <DescriptionItem label={copy.categories}>
                {data.categoryPercents.map((c) => `${c.category}: ${percentText(c.percent)}`).join(' · ')}
              </DescriptionItem>
            ) : null}
            <DescriptionItem label={copy.closedAt} numeric>
              {stamp.dateTime(data.closedAt)}
            </DescriptionItem>
            <DescriptionItem label={copy.closedBy}>{data.closedBy.name ?? '—'}</DescriptionItem>
            <DescriptionItem label={copy.lock} numeric>
              {copy.lockValue(stamp.civilDate(data.lockDateAfter))}
            </DescriptionItem>
          </DescriptionList>
          <CommissionTotals totals={data.totals} stamp={stamp} />
          <CommissionLines lines={data.lines} stamp={stamp} />
        </div>
      ) : notFound ? (
        <EmptyState role="status" icon={<FileX aria-hidden />} title={copy.notFound} description={copy.notFoundHint} />
      ) : error ? (
        <SectionError
          description={error}
          onRetry={() => {
            setError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : (
        <SectionSkeleton />
      )}
    </div>
  );
}
