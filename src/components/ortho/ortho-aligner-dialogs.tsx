'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  addOrthoAlignerDelivery,
  createOrthoAlignerSeries,
  nextTrayToDeliver,
  ORTHO_ARCH_LABELS,
  ORTHO_ARCHES,
  type OrthoAligners,
  type OrthoAlignerArch,
  type OrthoAlignerSeries,
} from '@/lib/ortho/ortho-billing';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { DateField } from '@/components/ui/date-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

export const alignerDialogsCopy = {
  seriesTitle: 'Nueva serie de alineadores',
  refinementTitle: 'Refinamiento',
  seriesDescription: 'La arcada, la marca, cuántas bandejas trae la serie y cuántos días se usa cada una.',
  refinementDescription: 'Abre una serie nueva que continúa la anterior; la anterior se conserva con sus entregas.',
  arch: 'Arcada',
  brand: 'Marca',
  totalTrays: 'Número de bandejas',
  daysPerTray: 'Días por bandeja',
  seriesSubmit: 'Abrir serie',
  seriesError: 'No pudimos abrir la serie. Intenta de nuevo.',
  invalidSeries: 'Escribe la marca y, con números enteros, las bandejas (1 a 99) y los días por bandeja (1 a 60).',
  deliveryTitle: 'Registrar entrega',
  deliveryDescription: (brand: string, arch: string) => `${brand} · ${arch}. Las bandejas se entregan seguidas.`,
  fromTray: 'Desde la bandeja',
  toTray: 'Hasta la bandeja',
  visit: 'Entregada en el control',
  noVisit: 'Fuera de un control',
  visitOption: (n: number, date: string) => `Control ${n} · ${date}`,
  date: 'Fecha de la entrega',
  dateFromVisit: 'La del control',
  deliverySubmit: 'Registrar entrega',
  deliveryError: 'No pudimos registrar la entrega. Intenta de nuevo.',
  invalidTrays: (total: number) => `Escribe la primera y la última bandeja con números enteros (hasta ${total}).`,
};
const copy = alignerDialogsCopy;

const whole = (text: string): number | null => (/^\d{1,2}$/.test(text.trim()) ? Number(text.trim()) : null);

export function OrthoAlignerSeriesDialog({
  open,
  onOpenChange,
  token,
  patientId,
  caseId,
  refinementOf,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  caseId: string;
  /** La serie que se refina (refinamiento), o `null` para una serie nueva. */
  refinementOf: OrthoAlignerSeries | null;
  onSaved: (view: OrthoAligners) => void;
}) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const [arch, setArch] = useState<OrthoAlignerArch>(refinementOf?.arch ?? 'BOTH');
  const [brand, setBrand] = useState(refinementOf?.brand ?? '');
  const [trays, setTrays] = useState('');
  const [days, setDays] = useState(refinementOf ? String(refinementOf.daysPerTray) : '14');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const totalTrays = whole(trays);
    const daysPerTray = whole(days);
    if (!brand.trim() || totalTrays === null || daysPerTray === null) {
      setError(copy.invalidSeries);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const view = await createOrthoAlignerSeries(token, patientId, caseId, {
        arch,
        brand: brand.trim(),
        totalTrays,
        daysPerTray,
        refinementOfId: refinementOf?.id,
      });
      onOpenChange(false);
      onSaved(view);
    } catch (err) {
      setError(apiErrorMessage(err, copy.seriesError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={refinementOf ? copy.refinementTitle : copy.seriesTitle}
      description={refinementOf ? copy.refinementDescription : copy.seriesDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.seriesSubmit}
      submitting={submitting}
      error={error}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField htmlFor={id('arch')} label={copy.arch}>
          <NativeSelect id={id('arch')} value={arch} onChange={(e) => setArch(e.target.value as OrthoAlignerArch)}>
            {ORTHO_ARCHES.map((a) => (
              <option key={a} value={a}>
                {ORTHO_ARCH_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor={id('brand')} label={copy.brand}>
          <Input id={id('brand')} maxLength={60} autoComplete="off" required value={brand} onChange={(e) => setBrand(e.target.value)} />
        </FormField>
        <FormField htmlFor={id('trays')} label={copy.totalTrays}>
          <Input
            id={id('trays')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            required
            value={trays}
            onChange={(e) => setTrays(e.target.value)}
            className="t-data"
          />
        </FormField>
        <FormField htmlFor={id('days')} label={copy.daysPerTray}>
          <Input
            id={id('days')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="t-data"
          />
        </FormField>
      </div>
    </FormModal>
  );
}

export interface DeliveryVisitOption {
  id: string;
  visitNumber: number;
  /** Día civil del control (`YYYY-MM-DD`). */
  visitDate: string;
  label: string;
}

export function OrthoAlignerDeliveryDialog({
  open,
  onOpenChange,
  token,
  patientId,
  caseId,
  series,
  today,
  visits,
  defaultVisitId = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  caseId: string;
  series: OrthoAlignerSeries;
  /** Hoy en la sede del caso (tope de la fecha). */
  today: string;
  /** Controles del caso, el más reciente primero, para «Entregada en el control». */
  visits: readonly DeliveryVisitOption[];
  defaultVisitId?: string | null;
  onSaved: (view: OrthoAligners) => void;
}) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const next = nextTrayToDeliver(series) ?? series.totalTrays;
  const [fromTray, setFromTray] = useState(String(next));
  const [toTray, setToTray] = useState(String(Math.min(series.totalTrays, next + 3)));
  const [visitId, setVisitId] = useState<string>(defaultVisitId ?? '');
  const [date, setDate] = useState<string | null>(today);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const from = whole(fromTray);
    const to = whole(toTray);
    if (from === null || to === null) {
      setError(copy.invalidTrays(series.totalTrays));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const view = await addOrthoAlignerDelivery(token, patientId, caseId, series.id, {
        fromTray: from,
        toTray: to,
        visitId: visitId || undefined,
        deliveredOn: visitId ? undefined : (date ?? undefined),
      });
      onOpenChange(false);
      onSaved(view);
    } catch (err) {
      setError(apiErrorMessage(err, copy.deliveryError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.deliveryTitle}
      description={copy.deliveryDescription(series.brand, ORTHO_ARCH_LABELS[series.arch])}
      onSubmit={handleSubmit}
      submitLabel={copy.deliverySubmit}
      submitting={submitting}
      submitDisabled={!visitId && !date}
      error={error}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField htmlFor={id('from')} label={copy.fromTray}>
          <Input
            id={id('from')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            required
            value={fromTray}
            onChange={(e) => setFromTray(e.target.value)}
            className="t-data"
          />
        </FormField>
        <FormField htmlFor={id('to')} label={copy.toTray}>
          <Input
            id={id('to')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            required
            value={toTray}
            onChange={(e) => setToTray(e.target.value)}
            className="t-data"
          />
        </FormField>
        <FormField htmlFor={id('visit')} label={copy.visit} className="sm:col-span-2">
          <NativeSelect id={id('visit')} value={visitId} onChange={(e) => setVisitId(e.target.value)}>
            <option value="">{copy.noVisit}</option>
            {visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {visitId ? null : (
          <FormField htmlFor={id('date')} label={copy.date} className="sm:col-span-2">
            <DateField id={id('date')} max={today} required value={date} onChange={(value) => setDate(value)} />
          </FormField>
        )}
      </div>
    </FormModal>
  );
}
