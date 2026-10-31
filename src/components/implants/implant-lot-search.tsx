'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Download, Lock, Search } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  downloadImplantLotCsv,
  IMPLANT_KIND_LABELS,
  implantLotCsvFileName,
  searchImplantLots,
  type ImplantLotMatch,
  type ImplantLotQuery,
} from '@/lib/implants/implants-api';
import { formatCivilDate } from '@/lib/format/date';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { saveCsv } from '@/lib/files/save-csv';

const copy = {
  heading: '¿Quién recibió este lote?',
  note:
    'Salen los pacientes de la clínica que lo recibieron, en todas las sedes, con fecha, diente, profesional y sede. La búsqueda y la exportación quedan en el registro de accesos.',
  lot: 'Lote',
  reference: 'Referencia (REF)',
  search: 'Buscar',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exported: 'CSV descargado.',
  exportError: 'No pudimos exportar el CSV.',
  needTerm: 'Escribe un lote o una referencia para buscar.',
  idleTitle: 'Busca un lote o una referencia',
  idleHint: 'Copia el lote del aviso del fabricante; no distingue mayúsculas.',
  emptyTitle: 'Ningún paciente de la clínica recibió ese lote',
  emptyHint: 'Revisa el código del aviso; la búsqueda es exacta.',
  loadError: 'No pudimos hacer la búsqueda.',
  forbiddenTitle: 'Solo la administración busca implantes por lote.',
  forbiddenHint: 'Son datos personales de muchos pacientes: los ve el ADMIN.',
  count: (n: number) => (n === 1 ? '1 implante encontrado' : `${n} implantes encontrados`),
  tableLabel: 'Pacientes que recibieron el lote o la referencia',
  colPatient: 'Paciente',
  colContact: 'Documento y teléfono',
  colDate: 'Fecha',
  colTooth: 'Diente',
  colProduct: 'Producto',
  colProfessional: 'Profesional',
  colStatus: 'Estado',
  product: (m: ImplantLotMatch) =>
    `${IMPLANT_KIND_LABELS[m.kind]} · ${m.manufacturer}${m.system ? ` ${m.system}` : ''}`,
  codes: (m: ImplantLotMatch) => `REF ${m.reference} · Lote ${m.lot}`,
  tooth: (t: string) => `Diente ${t}`,
};

/**
 * Ajustes → Implantes (DX-191): búsqueda por lote/REF y su CSV, solo ADMIN.
 * Siempre en toda la clínica (la API no la acota a la sede activa): una
 * retirada de lote no puede dejar fuera a un paciente operado en otra sede.
 */
export function ImplantLotSearch({ token, allowed }: { token: string; allowed: boolean }) {
  const [lot, setLot] = useState('');
  const [reference, setReference] = useState('');
  const [query, setQuery] = useState<ImplantLotQuery | null>(null);
  const [rows, setRows] = useState<ImplantLotMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!query || !allowed) return;
    let cancelled = false;
    async function load(q: ImplantLotQuery) {
      setLoading(true);
      try {
        const data = await searchImplantLots(token, q);
        if (cancelled) return;
        setRows(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load(query);
    return () => {
      cancelled = true;
    };
  }, [token, query, reloadKey, allowed]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lot.trim() === '' && reference.trim() === '') {
      setFormError(copy.needTerm);
      return;
    }
    setFormError(null);
    setNotice(null);
    setQuery({ lot: lot.trim(), reference: reference.trim() });
  }

  async function exportCsv() {
    if (!query) return;
    setExporting(true);
    setNotice(null);
    try {
      const text = await downloadImplantLotCsv(token, query);
      saveCsv(text, implantLotCsvFileName(query));
      setNotice(copy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: copy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  if (!allowed || deniedByApi) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  const canExport = query !== null && !loading && error === null && rows.length > 0;

  const columns: DataListColumn<ImplantLotMatch>[] = [
    { id: 'patient', header: copy.colPatient, mobile: 'primary', cell: (m) => m.patientName },
    {
      id: 'contact',
      header: copy.colContact,
      cell: (m) => (
        <span className="t-data text-muted">{[m.patientDocument, m.phone].filter(Boolean).join(' · ')}</span>
      ),
      mobileCell: (m) => [m.patientDocument, m.phone].filter(Boolean).join(' · ') || null,
    },
    {
      id: 'date',
      header: copy.colDate,
      cell: (m) => (
        <span className="flex flex-col whitespace-nowrap">
          <span className="t-data">{formatCivilDate(m.placedOn)}</span>
          <span className="text-muted">{copy.tooth(m.toothNumber)}</span>
        </span>
      ),
      mobileCell: (m) => `${formatCivilDate(m.placedOn)} · ${copy.tooth(m.toothNumber)}`,
    },
    {
      id: 'product',
      header: copy.colProduct,
      cell: (m) => (
        <span className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
          <span className={m.voided ? 'text-muted line-through' : undefined}>{copy.product(m)}</span>
          <span className="t-id break-all text-muted">{copy.codes(m)}</span>
        </span>
      ),
      mobileCell: (m) => (
        <span className={m.voided ? 'line-through' : undefined}>
          {copy.product(m)} · <span className="t-id break-all">{copy.codes(m)}</span>
        </span>
      ),
    },
    {
      id: 'professional',
      header: copy.colProfessional,
      cell: (m) => (
        <span className="flex min-w-0 flex-col text-muted">
          <span>{m.professionalName}</span>
          <span>{m.locationName}</span>
        </span>
      ),
      mobileCell: (m) => [m.professionalName, m.locationName].filter(Boolean).join(' · '),
    },
    {
      id: 'status',
      header: <span className="sr-only">{copy.colStatus}</span>,
      mobile: 'trailing',
      cell: (m) => (m.voided ? <StatusBadge kind="clinicalRecord" status="VOIDED" /> : null),
    },
  ];

  return (
    <section aria-label={copy.heading} className="flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex max-w-[720px] flex-col gap-3 sm:flex-row sm:items-start"
      >
        <FormField htmlFor="implant-lot" label={copy.lot} className="sm:flex-1" error={formError}>
          <Input
            id="implant-lot"
            autoComplete="off"
            maxLength={80}
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            className="t-id"
          />
        </FormField>
        <FormField htmlFor="implant-reference" label={copy.reference} className="sm:flex-1">
          <Input
            id="implant-reference"
            autoComplete="off"
            maxLength={80}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="t-id"
          />
        </FormField>
        {/* Alineado con los campos: la etiqueta ocupa su sitio encima. */}
        <Button type="submit" className="w-full sm:mt-[calc(1.125rem+0.375rem)] sm:w-auto">
          <Search aria-hidden />
          {copy.search}
        </Button>
      </form>
      <p className="t-caption max-w-[68ch] text-muted">{copy.note}</p>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {query === null ? (
        <EmptyState icon={<Search aria-hidden />} title={copy.idleTitle} description={copy.idleHint} />
      ) : (
        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={rows.length === 0}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyHint}
          skeleton={<TableSkeleton rows={3} />}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="t-data text-sm text-muted">{copy.count(rows.length)}</p>
            {canExport ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void exportCsv()}
                disabled={exporting}
                className="w-full sm:w-auto"
              >
                <Download aria-hidden />
                {exporting ? copy.exporting : copy.export}
              </Button>
            ) : null}
          </div>
          <DataList
            label={copy.tableLabel}
            rows={rows}
            columns={columns}
            getRowKey={(m) => m.implantId}
            getRowHref={(m) => `/patients/${encodeURIComponent(m.patientId)}?tab=implants`}
          />
        </AsyncSection>
      )}
    </section>
  );
}
