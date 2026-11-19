'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Landmark, Pencil, RefreshCw, Upload } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  RECONCILIATION_STATUSES,
  autoMatchPeriod,
  defaultPeriod,
  listBankAccounts,
  listReconciliationItems,
  matchMovement,
  unmatchMovement,
  type BankAccount,
  type BankMovement,
  type BankStatementConfirm,
  type CandidateReport,
  type ReconciliationCounts,
  type ReconciliationItem,
  type ReconciliationPeriod,
  type ReconciliationStatus,
} from '@/lib/bank-reconciliation/bank-reconciliation-api';
import { listPaymentReports, type PaymentReport } from '@/lib/payment-links/payment-links-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { statusLabel } from '@/lib/status/tones';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { usePaymentProofViewer, useReportProofViewer } from '@/components/payments/payment-proof-viewer';
import type { CashViewTabs } from '@/components/payments/cash-register-view';
import { ConfirmPaymentReportModal } from '@/components/payment-links/confirm-payment-report-modal';
import { BankAccountModal } from './bank-account-modal';
import { StatementImportModal } from './statement-import-modal';
import { MovementCandidatesModal } from './movement-candidates-modal';
import { RegisterMovementPayment } from './register-movement-payment';
import { ReconciliationList } from './reconciliation-list';

export const bankReconciliationCopy = {
  title: 'Caja',
  description:
    'Compara el extracto del banco con los abonos por transferencia y pago móvil: qué entró, qué está registrado y qué falta.',
  loadError: 'No pudimos cargar las cuentas de conciliación.',
  emptyTitle: 'Aún no hay cuentas de conciliación',
  emptyHint:
    'Una cuenta es la del banco donde llegan las transferencias y los pagos móviles. Créala, elige qué medios de pago llegan a ella y sube su extracto en CSV o Excel: Dentalix empareja cada movimiento con su abono por la referencia.',
  createAccount: 'Crear cuenta',
  account: 'Cuenta',
  inactive: ' (desactivada)',
  newAccount: 'Nueva cuenta',
  editAccount: 'Editar cuenta',
  upload: 'Subir extracto',
  uploadInactive: 'La cuenta está desactivada: actívala para subir extractos.',
  methods: (names: string) => `Medios: ${names}`,
  noMethods: 'Sin medios',
  tolerance: (amount: string) => `Tolerancia ${amount}`,
  lastImport: (from: string, to: string) => `Último extracto: del ${from} al ${to}`,
  noImports: 'Sin extractos todavía',
  period: 'Período',
  periodInvalid: 'Elige un período de 93 días como mucho.',
  rematch: 'Volver a emparejar',
  rematched: (n: number) =>
    n === 0
      ? 'No había movimientos nuevos que emparejar solos.'
      : `${n} ${n === 1 ? 'movimiento se emparejó' : 'movimientos se emparejaron'} solo${n === 1 ? '' : 's'}.`,
  rematchError: 'No pudimos volver a emparejar el período.',
  lists: 'Lista',
  descriptions: {
    CONCILIADO: 'Movimiento y abono emparejados.',
    IMPORTE_DISTINTO: 'Misma referencia, otro importe.',
    MOVIMIENTO_SIN_ABONO: 'Entró al banco y no hay abono.',
    SIN_MOVIMIENTO: 'Abono que no aparece en el banco.',
  } satisfies Record<ReconciliationStatus, string>,
  listTitles: {
    CONCILIADO: 'Conciliados',
    IMPORTE_DISTINTO: 'Importe distinto',
    MOVIMIENTO_SIN_ABONO: 'Sin abono',
    SIN_MOVIMIENTO: 'Sin movimiento',
  } satisfies Record<ReconciliationStatus, string>,
  itemsError: 'No pudimos cargar la conciliación del período.',
  empty: {
    CONCILIADO: 'Ningún movimiento conciliado en el período',
    IMPORTE_DISTINTO: 'Ningún importe distinto en el período',
    MOVIMIENTO_SIN_ABONO: 'Ningún movimiento sin abono en el período',
    SIN_MOVIMIENTO: 'Ningún abono sin movimiento en el período',
  } satisfies Record<ReconciliationStatus, string>,
  emptyHints: {
    CONCILIADO:
      'Aquí aparecen los movimientos del extracto que casan con un abono: la misma referencia y el importe dentro de la tolerancia, solos o emparejados a mano.',
    IMPORTE_DISTINTO:
      'Aquí aparecen los movimientos con la referencia de un abono pero otro importe. Revisa cuál está bien y empareja igualmente si corresponde.',
    MOVIMIENTO_SIN_ABONO:
      'Aquí aparecen las entradas del banco que no casan con ningún abono: dinero que llegó y aún no está registrado en la caja.',
    SIN_MOVIMIENTO:
      'Aquí aparecen los abonos por estos medios que no figuran en el extracto: puede que el dinero no haya llegado o que falte subir el extracto de esos días.',
  } satisfies Record<ReconciliationStatus, string>,
  count: (n: number) => (n === 1 ? '1 resultado' : `${n} resultados`),
  created: 'Cuenta creada. Ahora sube su extracto.',
  saved: 'Cuenta guardada.',
  imported: (created: number, matched: number) =>
    `Extracto importado: ${created} ${created === 1 ? 'movimiento nuevo' : 'movimientos nuevos'}, ${matched} ${matched === 1 ? 'conciliado solo' : 'conciliados solos'}.`,
  unmatched: 'Emparejado deshecho: el movimiento vuelve a «Sin abono».',
  unmatchError: 'No pudimos deshacer el emparejado.',
  matched: 'Movimiento conciliado.',
  matchError: 'No pudimos emparejar el movimiento.',
  recordedMatched: (notice: string) => `${notice} Quedó conciliado con el movimiento del banco.`,
  recordedNotMatched: (notice: string) =>
    `${notice} No se pudo emparejar solo con el movimiento: hazlo desde «Sin abono».`,
  reportMissing: 'Ese pago reportado ya no está por confirmar en esta sede. Ábrelo en Caja › Por confirmar.',
  reportConfirmed: 'Pago confirmado y conciliado con el movimiento.',
  reportStale: 'Otra persona ya decidió ese pago reportado. La lista se actualizó.',
};
const copy = bankReconciliationCopy;

const PAGE_SIZE = 25;
const MAX_PERIOD_DAYS = 93;
const DAY_MS = 86_400_000;

function periodDays(period: ReconciliationPeriod): number {
  return Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / DAY_MS) + 1;
}

interface BankReconciliationViewProps {
  token: string;
  tabs?: CashViewTabs;
}

/**
 * Caja › «Conciliación» (DX-571, solo ADMIN): las cuentas del banco de la
 * clínica, subir su extracto (CSV o Excel) y las cuatro listas del período
 * —conciliados, importe distinto, movimientos sin abono y abonos sin
 * movimiento— con sus contadores y acciones: deshacer, emparejar igualmente,
 * emparejar con un abono o un pago reportado, registrar el abono y ver el
 * comprobante. La cuenta es de la clínica: no depende de la sede activa.
 */
export function BankReconciliationView({ token, tabs }: BankReconciliationViewProps) {
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const [accountsAttempt, setAccountsAttempt] = useState(0);
  const [accounts, setAccounts] = useState<{ key: number; items: BankAccount[]; error: string | null } | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Record<string, ReconciliationPeriod>>({});
  const [status, setStatus] = useState<ReconciliationStatus>('CONCILIADO');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<{
    key: string;
    items: ReconciliationItem[];
    counts: ReconciliationCounts | null;
    total: number;
    pageSize: number;
    error: string | null;
  } | null>(null);
  const [editing, setEditing] = useState<{ account: BankAccount | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [candidatesOf, setCandidatesOf] = useState<BankMovement | null>(null);
  const [registerFor, setRegisterFor] = useState<BankMovement | null>(null);
  const [confirming, setConfirming] = useState<{ movement: BankMovement; report: PaymentReport } | null>(null);
  const proofViewer = usePaymentProofViewer(token);
  const reportProofViewer = useReportProofViewer(token);

  useEffect(() => {
    let cancelled = false;
    listBankAccounts(token)
      .then((data) => {
        if (!cancelled) setAccounts({ key: accountsAttempt, items: data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setAccounts({ key: accountsAttempt, items: [], error: apiErrorMessage(err, copy.loadError) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, accountsAttempt]);

  // Esqueleto en la primera carga y en el reintento de un error; una recarga tras guardar no lo enseña.
  const accountsLoading = accounts === null || (accounts.error !== null && accounts.key !== accountsAttempt);
  const list = accounts?.items ?? [];
  const account = list.find((a) => a.id === accountId) ?? list[0] ?? null;
  const today = timeZone ? sedeToday(timeZone) : null;
  const period = account ? (periods[account.id] ?? (today ? defaultPeriod(account, today) : null)) : null;
  const periodInvalid = period !== null && (period.from > period.to || periodDays(period) > MAX_PERIOD_DAYS);

  const itemsKey =
    account && period && !periodInvalid
      ? `${account.id}|${period.from}|${period.to}|${status}|${page}|${reloadKey}`
      : null;
  useEffect(() => {
    if (!itemsKey || !account || !period) return;
    let cancelled = false;
    listReconciliationItems(token, account.id, { ...period, status, page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (!cancelled)
          setItems({
            key: itemsKey,
            items: data.items,
            counts: data.counts,
            total: data.total,
            pageSize: data.pageSize,
            error: null,
          });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setItems((prev) => ({
            key: itemsKey,
            items: [],
            counts: prev?.counts ?? null,
            total: 0,
            pageSize: PAGE_SIZE,
            error: apiErrorMessage(err, copy.itemsError),
          }));
      });
    return () => {
      cancelled = true;
    };
    // `account`/`period` están dentro de `itemsKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, itemsKey]);

  const itemsLoading = itemsKey !== null && items?.key !== itemsKey;
  const rows = !itemsLoading && items && !items.error ? items.items : [];
  const counts = items?.counts ?? null;
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.payment?.location.id),
  );

  const reload = () => setReloadKey((k) => k + 1);
  const reloadAccounts = () => setAccountsAttempt((n) => n + 1);

  function setPeriod(next: ReconciliationPeriod) {
    if (!account) return;
    setPeriods((p) => ({ ...p, [account.id]: next }));
    setPage(1);
  }

  async function onUnmatch(item: ReconciliationItem) {
    if (!item.match) return;
    try {
      await unmatchMovement(token, item.match.id);
      notifySuccess(copy.unmatched);
      reload();
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.unmatchError), { onRetry: () => void onUnmatch(item) });
    }
  }

  async function match(movementId: string, paymentId: string) {
    try {
      await matchMovement(token, movementId, paymentId);
      notifySuccess(copy.matched);
      reload();
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.matchError), { onRetry: () => void match(movementId, paymentId) });
    }
  }

  async function onRematch() {
    if (!account || !period) return;
    setRematching(true);
    try {
      const done = await autoMatchPeriod(token, account.id, period);
      notifySuccess(copy.rematched(done.matched));
      reload();
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.rematchError), { onRetry: () => void onRematch() });
    } finally {
      setRematching(false);
    }
  }

  async function onConfirmReport(movement: BankMovement, candidate: CandidateReport) {
    // La bandeja trae el reporte completo (enlace, sede, comprobante) que pide su confirmación.
    try {
      const pending = await listPaymentReports(token, { status: 'PENDING', pageSize: 100 });
      const report = pending.items.find((r) => r.id === candidate.id);
      if (!report) {
        notifyError(copy.reportMissing);
        return;
      }
      setCandidatesOf(null);
      setConfirming({ movement, report });
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.matchError), { onRetry: () => void onConfirmReport(movement, candidate) });
    }
  }

  async function matchRecorded(movement: BankMovement, notice: string, paymentIds: string[]) {
    setRegisterFor(null);
    // Un cobro dividido crea varios abonos: el emparejado es 1:1, así que se deja a mano.
    if (paymentIds.length !== 1) {
      notifySuccess(copy.recordedNotMatched(notice), { persistent: true });
      reload();
      return;
    }
    try {
      await matchMovement(token, movement.id, paymentIds[0]);
      notifySuccess(copy.recordedMatched(notice));
    } catch {
      notifySuccess(copy.recordedNotMatched(notice), { persistent: true });
    }
    reload();
  }

  const actions = {
    onUnmatch: (item: ReconciliationItem) => void onUnmatch(item),
    onMatchAnyway: (item: ReconciliationItem) => {
      if (item.movement && item.payment) void match(item.movement.id, item.payment.id);
    },
    onMatchWith: (item: ReconciliationItem) => setCandidatesOf(item.movement),
    onRegister: (item: ReconciliationItem) => setRegisterFor(item.movement),
    onViewProof: proofViewer.open,
  };

  const panelProps = tabs ? { role: 'tabpanel', id: tabs.panelId, 'aria-labelledby': tabs.tabId } : {};

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      {tabs?.nav}
      <div className="flex min-w-0 flex-col gap-6" {...panelProps}>
        <AsyncSection
          loading={accountsLoading}
          error={accounts?.error ?? null}
          onRetry={reloadAccounts}
          isEmpty={list.length === 0}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyHint}
          emptyIcon={<Landmark aria-hidden />}
          emptyAction={
            <Button type="button" onClick={() => setEditing({ account: null })}>
              {copy.createAccount}
            </Button>
          }
          skeleton={<TableSkeleton rows={3} />}
        >
          {account ? (
            <>
              <section aria-label={copy.account} className="flex min-w-0 flex-col gap-3">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  {list.length > 1 ? (
                    <div className="flex min-w-0 flex-col gap-1.5 sm:w-72">
                      <label htmlFor="bank-account" className="t-label text-ink">
                        {copy.account}
                      </label>
                      <NativeSelect
                        id="bank-account"
                        value={account.id}
                        onChange={(e) => {
                          setAccountId(e.target.value);
                          setPage(1);
                        }}
                      >
                        {list.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.active ? '' : copy.inactive}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  ) : (
                    <h2 className="t-title min-w-0 break-words text-ink sm:mr-auto">
                      {account.name}
                      {account.active ? '' : copy.inactive}
                    </h2>
                  )}
                  <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditing({ account: null })}
                      className="w-full sm:w-auto"
                    >
                      {copy.newAccount}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditing({ account })}
                      className="w-full sm:w-auto"
                    >
                      <Pencil aria-hidden />
                      {copy.editAccount}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setImporting(true)}
                      disabled={!account.active}
                      aria-describedby={account.active ? undefined : 'bank-upload-inactive'}
                      className="w-full sm:w-auto"
                    >
                      <Upload aria-hidden />
                      {copy.upload}
                    </Button>
                  </div>
                </div>
                <p className="t-caption tnum text-muted">
                  {[
                    account.currency,
                    account.paymentMethods.length
                      ? copy.methods(account.paymentMethods.map((m) => m.name).join(', '))
                      : copy.noMethods,
                    copy.tolerance(stamp.money(account.amountTolerance, account.currency)),
                    account.lastImport?.periodFrom && account.lastImport.periodTo
                      ? copy.lastImport(
                          stamp.civilDate(account.lastImport.periodFrom),
                          stamp.civilDate(account.lastImport.periodTo),
                        )
                      : copy.noImports,
                  ].join(' · ')}
                </p>
                {!account.active ? (
                  <p id="bank-upload-inactive" className="text-sm text-muted">
                    {copy.uploadInactive}
                  </p>
                ) : null}
              </section>

              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <DateRangePicker
                    label={copy.period}
                    className="min-w-0 sm:w-72"
                    value={period}
                    onChange={(next) => {
                      if (next) setPeriod(next);
                    }}
                    isInvalid={periodInvalid}
                    aria-describedby={periodInvalid ? 'bank-period-error' : undefined}
                  />
                  {periodInvalid ? <InlineError id="bank-period-error">{copy.periodInvalid}</InlineError> : null}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  loading={rematching}
                  disabled={!period || periodInvalid}
                  onClick={() => void onRematch()}
                  className="w-full sm:ml-auto sm:w-auto"
                >
                  <RefreshCw aria-hidden />
                  {copy.rematch}
                </Button>
              </div>

              <SedeStampNote stamp={stamp} />

              <RadioGroup
                id="bank-lists"
                legend={copy.lists}
                value={status}
                onValueChange={(v) => {
                  setStatus(v as ReconciliationStatus);
                  setPage(1);
                }}
                optionsClassName="grid grid-cols-2 gap-2 lg:grid-cols-4"
              >
                {RECONCILIATION_STATUSES.map((s, i) => (
                  <RadioCard
                    key={s}
                    id={i === 0 ? 'bank-lists' : undefined}
                    value={s}
                    title={
                      <>
                        {copy.listTitles[s]} <span className="tnum font-semibold">{counts ? counts[s] : ''}</span>
                      </>
                    }
                    description={copy.descriptions[s]}
                  />
                ))}
              </RadioGroup>

              <section aria-label={statusLabel('bankReconciliation', status)} className="flex min-w-0 flex-col gap-3">
                {periodInvalid ? null : (
                  <AsyncSection
                    loading={itemsLoading || !period}
                    error={items?.error ?? null}
                    onRetry={reload}
                    isEmpty={rows.length === 0}
                    emptyTitle={copy.empty[status]}
                    emptyDescription={copy.emptyHints[status]}
                    skeleton={<TableSkeleton rows={4} />}
                  >
                    <p className="t-caption tnum text-muted" aria-live="polite">
                      {copy.count(items?.total ?? 0)}
                    </p>
                    <ReconciliationList status={status} items={rows} stamp={stamp} actions={actions} />
                    <Pagination
                      page={page}
                      pageSize={items?.pageSize ?? PAGE_SIZE}
                      total={items?.total ?? 0}
                      onPageChange={setPage}
                      disabled={itemsLoading}
                    />
                  </AsyncSection>
                )}
              </section>
            </>
          ) : null}
        </AsyncSection>
      </div>

      {editing ? (
        <BankAccountModal
          key={editing.account?.id ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          token={token}
          account={editing.account}
          onSaved={(saved) => {
            notifySuccess(editing.account ? copy.saved : copy.created);
            setEditing(null);
            setAccountId(saved.id);
            reloadAccounts();
            reload();
          }}
        />
      ) : null}
      {importing && account ? (
        <StatementImportModal
          key={account.id}
          open
          onOpenChange={(open) => {
            if (!open) setImporting(false);
          }}
          token={token}
          account={account}
          stamp={stamp}
          onImported={(result: BankStatementConfirm) => {
            setImporting(false);
            notifySuccess(copy.imported(result.created, result.matched));
            // El período pasa a ser el del extracto importado.
            if (result.periodFrom && result.periodTo) setPeriod({ from: result.periodFrom, to: result.periodTo });
            reloadAccounts();
            reload();
          }}
        />
      ) : null}
      {candidatesOf ? (
        <MovementCandidatesModal
          key={candidatesOf.id}
          open
          onOpenChange={(open) => {
            if (!open) setCandidatesOf(null);
          }}
          token={token}
          movement={candidatesOf}
          stamp={stamp}
          onMatched={() => {
            setCandidatesOf(null);
            notifySuccess(copy.matched);
            reload();
          }}
          onConfirmReport={(report) => void onConfirmReport(candidatesOf, report)}
          onRegister={() => {
            const movement = candidatesOf;
            setCandidatesOf(null);
            setRegisterFor(movement);
          }}
        />
      ) : null}
      {account ? (
        <RegisterMovementPayment
          token={token}
          movement={registerFor}
          account={account}
          stamp={stamp}
          onClose={() => setRegisterFor(null)}
          onRecorded={(movement, notice, ids) => void matchRecorded(movement, notice, ids)}
        />
      ) : null}
      {confirming ? (
        <ConfirmPaymentReportModal
          key={confirming.report.id}
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          token={token}
          report={confirming.report}
          onViewProof={reportProofViewer.open}
          onConfirmed={(done) => {
            const { movement } = confirming;
            setConfirming(null);
            void matchMatched(movement, done.payment.id);
          }}
          onStale={() => {
            setConfirming(null);
            notifyError(copy.reportStale);
            reload();
          }}
        />
      ) : null}
      {proofViewer.dialog}
      {reportProofViewer.dialog}
    </>
  );

  async function matchMatched(movement: BankMovement, paymentId: string) {
    try {
      await matchMovement(token, movement.id, paymentId);
      notifySuccess(copy.reportConfirmed);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.matchError), { onRetry: () => void matchMatched(movement, paymentId) });
    }
    reload();
  }
}
