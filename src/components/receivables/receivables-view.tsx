'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Lock, SlidersHorizontal } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import { fetchClinicName } from '@/lib/clinic-branding';
import {
  downloadReceivablesCsv,
  getReceivablesAging,
  type ReceivablesAgingPage,
  type ReceivablesFilters,
} from '@/lib/receivables/receivables-api';
import { AGE_FILTERS, PROMISE_FILTERS, csvFileName } from '@/lib/receivables/presentation';
import type { AgingRow } from '@/lib/receivables/receivables-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { CollectionNoteDialog } from '@/components/collections/collection-note-dialog';
import { PaymentPromiseDialog } from '@/components/collections/payment-promise-dialog';
import { parseMoneyInput } from '@/lib/format/money';
import { saveCsv } from '@/lib/files/save-csv';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataList, DATA_LIST_PHONE_QUERY, type DataListColumn } from '@/components/ui/data-list';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { ResultCount } from '@/components/shared/list-toolbar';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { AgingSummary } from './aging-summary';
import { ScopeMarker } from './scope-marker';
import {
  AgeCell,
  AgeMeta,
  BucketList,
  bucketLineCount,
  CollectionCell,
  ContactButtons,
  DebtCell,
  LastPayment,
  NextInstallment,
  debtorCopy,
  debtorRowActions,
  statementHref,
} from './debtor-parts';

export const receivablesCopy = {
  title: 'Cartera',
  description:
    'Lo que deben los pacientes, por antigüedad: a quién llamar primero. Cada saldo es el de su estado de cuenta, por moneda y sin convertir.',
  ageLabel: 'Antigüedad',
  minBalanceLabel: 'Saldo mínimo',
  minBalancePlaceholder: 'Saldo mínimo',
  minBalanceInvalid: (reason: string) => `Saldo mínimo: ${reason} Mientras, no se filtra por saldo.`,
  currencyLabel: 'Moneda',
  currencyAll: 'Todas las monedas',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exportError: 'No pudimos exportar la cartera.',
  exported: 'Cartera exportada.',
  countNoun: 'deudor',
  countNounPlural: 'deudores',
  listLabel: 'Deudores',
  moreFilters: 'Más filtros',
  moreFiltersActive: (n: number) => `Más filtros (${n})`,
  clearMoreFilters: 'Quitar estos filtros',
  colPatient: 'Paciente',
  colAge: 'Antigüedad',
  colDebt: 'Por cobrar',
  colLastPayment: 'Último abono',
  colNext: 'Próxima cuota',
  colContact: 'Contacto',
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: 'No pudimos cargar la cartera.',
  badRequest: 'Algún filtro no es válido: revisa el saldo mínimo.',
  forbiddenTitle: 'Tu rol no tiene acceso a la cartera.',
  forbiddenHint:
    'La cartera es para administración y recepción. Pídele acceso a quien administra la clínica.',
  emptyLocation: 'No hay saldos vencidos en esta sede',
  emptyClinic: 'No hay saldos vencidos en la clínica',
  emptyHint: 'Cuando un paciente deba algo, aparecerá aquí con su antigüedad. Prueba también con otros filtros.',
  asOf: (day: string) => `Antigüedad contada al ${day}, en días del calendario de la sede.`,
  // DX-150: cobranza.
  promiseLabel: 'Compromiso',
  providerLabel: 'Profesional',
  providerAll: 'Todos los profesionales',
  colCollection: 'Gestión',
  noteSaved: (name: string) => `Gestión registrada para ${name}.`,
  promiseSaved: (name: string) => `Compromiso de pago registrado para ${name}.`,
};

type CollectionDialog = { kind: 'note' | 'promise'; row: AgingRow } | null;

const MIN_BALANCE_DEBOUNCE_MS = 400;

/**
 * El saldo mínimo del filtro, con la lectura común de los campos de dinero
 * (DX-241): «100.000» es cien mil, también aquí. Vacío o ilegible, sin filtro.
 */
function parseMinBalance(text: string, currency: string): number | undefined {
  const parsed = parseMoneyInput(text, currency === 'ALL' ? '' : currency);
  return parsed.ok ? parsed.value : undefined;
}

/**
 * Cartera por antigüedad (DX-145): la lista de cobro de la sede activa. Mismo
 * patrón de lista que la caja: dos filtros a la vista (antigüedad y moneda) y
 * el resto en «Más filtros», «Exportar CSV» secundario (solo ADMIN), resumen
 * por tramo, conteo, `DataList` y páginas. Toda la fila abre el estado de
 * cuenta; gestión y compromiso van en el «⋯».
 */
export function ReceivablesView({ token }: { token: string }) {
  const router = useRouter();
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);
  const isAdmin = getTokenRole(token) === 'ADMIN';
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const [minBalanceText, setMinBalanceText] = useState('');
  const [minBalance, setMinBalance] = useState<number | undefined>(undefined);
  const [currency, setCurrency] = useState<string>('ALL');
  const [knownCurrencies, setKnownCurrencies] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReceivablesAgingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // DX-150: filtros de cobranza y los modales de gestión y compromiso.
  const [promiseFilter, setPromiseFilter] = useState<string>('all');
  const [providerId, setProviderId] = useState<string>('ALL');
  const [providers, setProviders] = useState<StaffMember[]>([]);
  const [dialog, setDialog] = useState<CollectionDialog>(null);

  const age = AGE_FILTERS.find((f) => f.value === ageFilter);
  const minAgeDays = age?.minAgeDays;
  const hasPromise = PROMISE_FILTERS.find((f) => f.value === promiseFilter)?.hasPromise;
  const filters: ReceivablesFilters = {
    ...(currency !== 'ALL' ? { currency } : {}),
    ...(minBalance !== undefined ? { minBalance } : {}),
    ...(minAgeDays !== undefined ? { minAgeDays } : {}),
    ...(providerId !== 'ALL' ? { providerId } : {}),
    ...(hasPromise !== undefined ? { hasPromise } : {}),
  };
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!token) return;
    const query: ReceivablesFilters = JSON.parse(filterKey);
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getReceivablesAging(token, { ...query, page });
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        if (!query.currency) {
          setKnownCurrencies((prev) => [...new Set([...prev, ...res.totals.map((t) => t.currency)])].sort());
        }
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(
          apiErrorMessage(err, { fallback: receivablesCopy.loadError, byStatus: { 400: receivablesCopy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, page, reloadKey]);

  // Nombre de la clínica para el mensaje de WhatsApp: si falla, «la clínica».
  useEffect(() => {
    let cancelled = false;
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => {
        /* sin nombre, el mensaje dice «la clínica» */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Profesionales para el filtro: si falla, el filtro no se ofrece.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listStaff(token)
      .then((staff) => {
        if (!cancelled) setProviders(staff.filter((m) => m.role === 'DENTIST' || m.role === 'ADMIN'));
      })
      .catch(() => {
        /* sin lista, sin filtro por profesional */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // El saldo mínimo se aplica al dejar de teclear, no en cada tecla.
  useEffect(() => {
    const next = parseMinBalance(minBalanceText, currency);
    if (next === minBalance) return;
    const timer = setTimeout(() => {
      setMinBalance(next);
      setPage(1);
    }, MIN_BALANCE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [minBalanceText, minBalance, currency]);
  // Lo que no se entiende no filtra: el campo lo marca para que no parezca
  // aplicado.
  // QA DX-241: y dice por qué, enlazado al campo.
  const minBalanceParsed = parseMoneyInput(minBalanceText, currency === 'ALL' ? '' : currency);
  const minBalanceError =
    minBalanceText.trim() !== '' && !minBalanceParsed.ok ? receivablesCopy.minBalanceInvalid(minBalanceParsed.message) : null;

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      const text = await downloadReceivablesCsv(token, JSON.parse(filterKey) as ReceivablesFilters);
      saveCsv(text, csvFileName(data?.asOf ?? new Date().toISOString().slice(0, 10)));
      setNotice(receivablesCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: receivablesCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  const items = data?.items ?? [];
  const location = data?.scope.location ?? null;
  const anyApproximate = items.some((r) => r.ageApproximate);
  // «Más filtros (n)»: cuenta solo lo que de verdad filtra (un saldo ilegible no).
  const moreFiltersCount =
    (minBalance !== undefined ? 1 : 0) + (promiseFilter !== 'all' ? 1 : 0) + (providerId !== 'ALL' ? 1 : 0);

  function openNote(r: AgingRow) {
    setDialog({ kind: 'note', row: r });
  }
  function openPromise(r: AgingRow) {
    setDialog({ kind: 'promise', row: r });
  }

  // La fila entera abre el estado de cuenta; «Llamar» y «WhatsApp» como
  // iconos en la tabla, y en el teléfono dentro del «⋯» (no caben botones en
  // una tarjeta que ya es un enlace).
  const columns: DataListColumn<AgingRow>[] = [
    {
      id: 'patient',
      header: receivablesCopy.colPatient,
      mobile: 'primary',
      cell: (r) => (
        <span className="block min-w-[9rem]">
          <span className="block">{r.patient.fullName}</span>
          {r.patient.phone ? (
            <span className="block whitespace-nowrap text-xs font-normal text-muted tabular-nums">
              {r.patient.phone}
            </span>
          ) : null}
        </span>
      ),
      mobileCell: (r) => r.patient.fullName,
    },
    {
      id: 'age',
      header: receivablesCopy.colAge,
      cell: (r) => <AgeCell row={r} />,
      mobileCell: (r) => <AgeMeta row={r} />,
    },
    {
      id: 'debt',
      header: receivablesCopy.colDebt,
      numeric: true,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => (
        <>
          <DebtCell currencies={r.currencies} />
          {/* Con un solo tramo ya lo dice la antigüedad; con varios, el desglose. */}
          {bucketLineCount(r) > 1 ? <BucketList currencies={r.currencies} className="mt-1" /> : null}
        </>
      ),
      mobileCell: (r) => <DebtCell currencies={r.currencies} compact />,
    },
    {
      id: 'last-payment',
      header: receivablesCopy.colLastPayment,
      mobile: 'hidden',
      showFrom: 'xl',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => <LastPayment row={r} />,
    },
    {
      id: 'next',
      header: receivablesCopy.colNext,
      mobile: 'hidden',
      showFrom: 'xl',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => <NextInstallment row={r} />,
    },
    {
      id: 'collection',
      header: receivablesCopy.colCollection,
      showFrom: 'lg',
      cellClassName: 'max-w-[14rem]',
      cell: (r) => <CollectionCell row={r} />,
      mobileCell: (r) => (r.lastNote || r.promise ? <CollectionCell row={r} compact /> : null),
    },
    {
      id: 'contact',
      header: <span className="sr-only">{receivablesCopy.colContact}</span>,
      mobile: 'hidden',
      align: 'end',
      cell: (r) => <ContactButtons row={r} clinicName={clinicName} />,
    },
  ];

  return (
    <>
      <PageHeader
        title={receivablesCopy.title}
        description={receivablesCopy.description}
        meta={data ? <ScopeMarker location={location} /> : null}
      />

      <div className="flex flex-col gap-3">
        {/* Sin acceso (403) no hay filas que filtrar ni exportar: solo el aviso. */}
        {!forbidden ? (
          // Teléfono: los dos filtros a lo ancho (sus textos no caben en media
          // columna) y «Más filtros» + «Exportar CSV» lado a lado.
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <NativeSelect
              aria-label={receivablesCopy.ageLabel}
              value={ageFilter}
              onChange={(e) => {
                setAgeFilter(e.target.value);
                setPage(1);
              }}
              className="col-span-2 sm:w-52"
            >
              {AGE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={receivablesCopy.currencyLabel}
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setPage(1);
              }}
              className="col-span-2 sm:w-48"
            >
              <option value="ALL">{receivablesCopy.currencyAll}</option>
              {knownCurrencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </NativeSelect>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="secondary" className={isAdmin ? undefined : 'col-span-2'}>
                  <SlidersHorizontal aria-hidden />
                  {moreFiltersCount > 0
                    ? receivablesCopy.moreFiltersActive(moreFiltersCount)
                    : receivablesCopy.moreFilters}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex w-80 flex-col gap-4 p-4">
                <FormField
                  htmlFor="receivables-min-balance"
                  label={receivablesCopy.minBalanceLabel}
                  error={minBalanceError}
                >
                  <Input
                    id="receivables-min-balance"
                    type="text"
                    inputMode="decimal"
                    value={minBalanceText}
                    onChange={(e) => setMinBalanceText(e.target.value)}
                    aria-invalid={minBalanceError ? true : undefined}
                    aria-describedby={minBalanceError ? fieldErrorId('receivables-min-balance') : undefined}
                    autoComplete="off"
                    className="tabular-nums"
                  />
                </FormField>
                <FormField htmlFor="receivables-promise" label={receivablesCopy.promiseLabel}>
                  <NativeSelect
                    id="receivables-promise"
                    value={promiseFilter}
                    onChange={(e) => {
                      setPromiseFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    {PROMISE_FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                {providers.length > 0 ? (
                  <FormField htmlFor="receivables-provider" label={receivablesCopy.providerLabel}>
                    <NativeSelect
                      id="receivables-provider"
                      value={providerId}
                      onChange={(e) => {
                        setProviderId(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="ALL">{receivablesCopy.providerAll}</option>
                      {providers.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.fullName}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                ) : null}
                {moreFiltersCount > 0 || minBalanceText ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="self-start"
                    onClick={() => {
                      setMinBalanceText('');
                      setPromiseFilter('all');
                      setProviderId('ALL');
                      setPage(1);
                    }}
                  >
                    {receivablesCopy.clearMoreFilters}
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
            {/* Exportar nunca es la acción primaria de la cobranza: secundaria. */}
            {isAdmin ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void exportCsv()}
                disabled={exporting || loading}
                className="sm:ml-auto"
              >
                <Download aria-hidden />
                {exporting ? receivablesCopy.exporting : receivablesCopy.export}
              </Button>
            ) : null}
          </div>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={receivablesCopy.forbiddenTitle}
            description={receivablesCopy.forbiddenHint}
          />
        ) : (
          <>
            <AsyncSection
              loading={loading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={location || !data ? receivablesCopy.emptyLocation : receivablesCopy.emptyClinic}
              emptyDescription={receivablesCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              {data ? <AgingSummary totals={data.totals} /> : null}

              <ResultCount
                total={data?.total ?? 0}
                noun={receivablesCopy.countNoun}
                nounPlural={receivablesCopy.countNounPlural}
              />

              <DataList
                label={receivablesCopy.listLabel}
                rows={items}
                columns={columns}
                getRowKey={(r) => r.patient.id}
                getRowHref={(r) => statementHref(r.patient.id)}
                getRowLabel={(r) => r.patient.fullName}
                rowActions={(r) =>
                  debtorRowActions({
                    row: r,
                    clinicName,
                    withContact: isPhone,
                    onStatement: (x) => router.push(statementHref(x.patient.id)),
                    onNote: openNote,
                    onPromise: openPromise,
                  })
                }
              />

              {data ? (
                <div className="flex flex-col gap-1 text-xs text-muted">
                  <p className="tabular-nums">{receivablesCopy.asOf(data.asOf.split('-').reverse().join('/'))}</p>
                  {anyApproximate ? <p>{debtorCopy.approximateNote}</p> : null}
                </div>
              ) : null}
            </AsyncSection>

            {!loadError ? (
              <Pagination
                page={page}
                pageSize={data?.pageSize ?? 0}
                total={data?.total ?? 0}
                onPageChange={setPage}
                disabled={loading}
              />
            ) : null}
          </>
        )}
      </div>

      {dialog ? (
        <>
          <CollectionNoteDialog
            open={dialog.kind === 'note'}
            onOpenChange={(open) => {
              if (!open) setDialog(null);
            }}
            token={token}
            patient={dialog.row.patient}
            onSaved={() => {
              setNotice(receivablesCopy.noteSaved(dialog.row.patient.fullName));
              setReloadKey((k) => k + 1);
            }}
          />
          <PaymentPromiseDialog
            open={dialog.kind === 'promise'}
            onOpenChange={(open) => {
              if (!open) setDialog(null);
            }}
            token={token}
            patient={dialog.row.patient}
            currencies={dialog.row.currencies.filter((c) => c.debt > 0).map((c) => c.currency)}
            onSaved={() => {
              setNotice(receivablesCopy.promiseSaved(dialog.row.patient.fullName));
              setReloadKey((k) => k + 1);
            }}
          />
        </>
      ) : null}
    </>
  );
}
