'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const copy = {
  heading: '¿Quién recibió este lote?',
  support:
    'Busca por lote o por referencia (REF) cuando un fabricante retira un producto: salen los pacientes de la clínica que lo recibieron, con fecha, diente y profesional. La búsqueda y la exportación quedan en el registro de accesos.',
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
  colDate: 'Fecha',
  colTooth: 'Diente',
  colProduct: 'Producto',
  colProfessional: 'Profesional',
  voided: 'Anulado',
  product: (m: ImplantLotMatch) =>
    `${IMPLANT_KIND_LABELS[m.kind]} · ${m.manufacturer}${m.system ? ` ${m.system}` : ''}`,
  codes: (m: ImplantLotMatch) => `REF ${m.reference} · Lote ${m.lot}`,
  tooth: (t: string) => `Diente ${t}`,
};

function saveCsv(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Ajustes → Implantes (DX-191): búsqueda por lote/REF y su CSV, solo ADMIN.
 * La sede activa (X-Location-Id) acota la búsqueda; sin sede, toda la clínica.
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

  return (
    <section aria-labelledby="implant-lot-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="implant-lot-heading" className="text-lg font-semibold text-ink">
          {copy.heading}
        </h2>
        <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <FormField htmlFor="implant-lot" label={copy.lot} className="sm:w-56" error={formError}>
          <Input
            id="implant-lot"
            autoComplete="off"
            maxLength={80}
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField htmlFor="implant-reference" label={copy.reference} className="sm:w-56">
          <Input
            id="implant-reference"
            autoComplete="off"
            maxLength={80}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <div className="flex flex-col gap-2 sm:flex-row sm:ml-auto">
          <Button type="submit" variant="secondary" className="w-full sm:w-auto">
            <Search aria-hidden />
            {copy.search}
          </Button>
          <Button
            type="button"
            onClick={() => void exportCsv()}
            disabled={!query || loading || exporting || rows.length === 0 || error !== null}
            className="w-full sm:w-auto"
          >
            <Download aria-hidden />
            {exporting ? copy.exporting : copy.export}
          </Button>
        </div>
      </form>

      <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
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
          <p className="text-sm text-muted tabular-nums">{copy.count(rows.length)}</p>
          <ul aria-label={copy.tableLabel} className="flex flex-col gap-3">
            {rows.map((m) => (
              <li
                key={m.implantId}
                data-testid="implant-lot-row"
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-sm text-ink [overflow-wrap:anywhere] sm:grid sm:grid-cols-[minmax(0,2fr)_auto_minmax(0,2fr)_minmax(0,1fr)] sm:items-start sm:gap-4"
              >
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={`/patients/${encodeURIComponent(m.patientId)}?tab=implants`}
                    className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {m.patientName}
                  </Link>
                  <span className="text-muted tabular-nums">
                    {[m.patientDocument, m.phone].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="flex flex-col tabular-nums">
                  <span>{formatCivilDate(m.placedOn)}</span>
                  <span className="text-muted">{copy.tooth(m.toothNumber)}</span>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className={m.voided ? 'text-muted line-through' : undefined}>
                    {copy.product(m)}
                  </span>
                  <span className="break-all text-muted tabular-nums">{copy.codes(m)}</span>
                  {m.voided ? (
                    <Badge variant="danger" className="mt-1 w-fit">
                      {copy.voided}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-col text-muted">
                  <span>{m.professionalName}</span>
                  <span>{m.locationName}</span>
                </div>
              </li>
            ))}
          </ul>
        </AsyncSection>
      )}
    </section>
  );
}
