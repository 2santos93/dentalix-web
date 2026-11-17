'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Percent, Settings2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import {
  COMMISSION_SETTINGS_HREF,
  canManageCommissions,
  closeCommissionSettlement,
  commissionSettlementHref,
  getCommissionPreview,
  listCommissionRules,
  listCommissionSettlements,
  previousMonthOf,
  ruleSummary,
  suggestedPeriod,
  type CommissionPreview,
  type CommissionSettlementSummary,
  type ProfessionalCommissionRule,
} from '@/lib/commissions/commissions-api';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { notifySuccess } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { FieldError } from '@/components/errors/field-error';
import { AsyncSection, SectionSkeleton, TableSkeleton } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { SectionHeader } from '@/components/ui/section-header';
import { CommissionLines, CommissionTotals } from './commission-lines';

export const commissionsViewCopy = {
  title: 'Honorarios',
  description:
    'Lo que le toca a cada odontólogo según su regla: la vista previa del período con el detalle por paciente, procedimiento y abono, y las liquidaciones cerradas.',
  descriptionOwn: 'Tus honorarios: la vista previa del período con su detalle y tus liquidaciones cerradas.',
  professional: 'Profesional',
  from: 'Desde',
  to: 'Hasta',
  professionalsError: 'Profesionales sin cargar',
  noProfessionals: 'Aún no hay odontólogos con regla de honorarios',
  noProfessionalsHint: 'Configura el porcentaje de cada profesional en Ajustes › Honorarios.',
  configure: 'Configurar honorarios',
  rule: (summary: string) => `Regla: ${summary}`,
  noRule: 'Sin regla de honorarios: configúrala para calcular la liquidación.',
  previewTitle: 'Vista previa',
  previewHint: 'Así quedaría la liquidación si se cerrara ahora. Cada importe va en su moneda.',
  loadError: 'No pudimos calcular la vista previa.',
  close: 'Cerrar liquidación',
  cannotClose: 'Todavía no se puede cerrar',
  confirmTitle: 'Cerrar la liquidación',
  confirmBody: (who: string, from: string, to: string) =>
    `Se congela la liquidación de ${who} del ${from} al ${to}: ya no cambia nunca. Lo que se anule después saldrá como ajuste en la siguiente.`,
  confirmLock: (to: string) =>
    `El cierre contable de la clínica pasa a quedar cerrado hasta el ${to}, inclusive (si ya estaba cerrado más tarde, no cambia): no se podrán registrar ni anular abonos de esos días.`,
  confirmAction: 'Cerrar y congelar',
  confirming: 'Cerrando…',
  closeError: 'No pudimos cerrar la liquidación. Intenta de nuevo.',
  closed: 'Liquidación cerrada.',
  settlements: 'Liquidaciones cerradas',
  settlementsHint: 'Congeladas al cerrarse. Abre una para ver su detalle o imprimirla.',
  settlementsLabel: 'Liquidaciones cerradas, la más reciente primero',
  settlementsError: 'No pudimos cargar las liquidaciones cerradas.',
  settlementsEmpty: 'Aún no hay liquidaciones cerradas',
  colPeriod: 'Período',
  colProfessional: 'Profesional',
  colClosed: 'Cerrada',
  colTotal: 'A pagar',
  nothing: 'Sin movimientos',
  period: (from: string, to: string) => `${from} – ${to}`,
  invalidPeriod: '«Desde» no puede ser posterior a «Hasta».',
};

const copy = commissionsViewCopy;

/**
 * «Honorarios» (DX-018). ADMIN: elige profesional y período, ve la vista
 * previa (devengos + ajustes, totales por moneda) y cierra; un DENTIST ve lo
 * suyo, sin cerrar. Debajo, las liquidaciones cerradas. Se llega desde la
 * paleta ⌘K y desde Reportes y Ajustes › Honorarios (sin entrada en la barra).
 */
export function CommissionsView({ token }: { token: string }) {
  const router = useRouter();
  const role = getTokenRole(token);
  const isAdmin = canManageCommissions(role);
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;

  const [professionals, setProfessionals] = useState<ProfessionalCommissionRule[] | null>(null);
  const [professionalsFailed, setProfessionalsFailed] = useState(false);
  const [professionalsReload, setProfessionalsReload] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  // null = el de por defecto (el mes anterior a hoy en la sede).
  const [chosenPeriod, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [preview, setPreview] = useState<CommissionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [settlements, setSettlements] = useState<CommissionSettlementSummary[] | null>(null);
  const [settlementsError, setSettlementsError] = useState<string | null>(null);
  const [settlementsReload, setSettlementsReload] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const periodId = React.useId();

  const period = chosenPeriod ?? (today ? previousMonthOf(today) : null);
  const periodKey = period ? `${period.from}|${period.to}` : null;

  // ADMIN: los profesionales con regla (los demás se configuran en Ajustes).
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    listCommissionRules(token)
      .then((res) => {
        if (cancelled) return;
        const withRule = res.professionals.filter((p) => p.rule !== null);
        setProfessionals(withRule);
        setProfessionalsFailed(false);
        setUserId((current) => current ?? withRule[0]?.professional.userId ?? null);
      })
      .catch(() => {
        if (!cancelled) setProfessionalsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin, professionalsReload]);

  const target = isAdmin ? userId : 'self';
  const invalidPeriod = period !== null && period.from > period.to;

  useEffect(() => {
    if (!target || !periodKey || invalidPeriod) return;
    const [from, to] = periodKey.split('|');
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getCommissionPreview(token, { userId: isAdmin ? target : null, from, to });
        if (cancelled) return;
        setPreview(res);
        setError(null);
        // Sin tocar el período, se propone el que sigue a la última cerrada.
        if (!touched && today && res.nextFrom && res.nextFrom !== from) {
          setPeriod(suggestedPeriod(today, res.nextFrom));
        }
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin, target, periodKey, invalidPeriod, touched, today, reloadKey]);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    listCommissionSettlements(token, { userId: isAdmin ? target : null })
      .then((res) => {
        if (cancelled) return;
        setSettlements(res);
        setSettlementsError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSettlementsError(apiErrorMessage(err, copy.settlementsError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin, target, settlementsReload]);

  const stamp = useSedeStamp(token, preview?.lines.map((l) => l.locationId) ?? []);

  async function close() {
    if (!preview || !period) return;
    setClosing(true);
    setCloseError(null);
    try {
      const closed = await closeCommissionSettlement(token, {
        userId: preview.professional.userId,
        from: period.from,
        to: period.to,
      });
      setConfirmOpen(false);
      notifySuccess(copy.closed);
      router.push(commissionSettlementHref(closed.id));
    } catch (err) {
      setCloseError(apiErrorMessage(err, copy.closeError));
    } finally {
      setClosing(false);
    }
  }

  const noProfessionals = isAdmin && professionals !== null && professionals.length === 0;
  const settlementColumns: DataListColumn<CommissionSettlementSummary>[] = [
    {
      id: 'period',
      header: copy.colPeriod,
      mobile: 'primary',
      cell: (s) => (
        <span className="tabular-nums">{copy.period(stamp.civilDate(s.period.from), stamp.civilDate(s.period.to))}</span>
      ),
    },
    ...(isAdmin
      ? [
          {
            id: 'professional',
            header: copy.colProfessional,
            cell: (s: CommissionSettlementSummary) => s.professional.name,
          } satisfies DataListColumn<CommissionSettlementSummary>,
        ]
      : []),
    {
      id: 'closed',
      header: copy.colClosed,
      cell: (s) => <span className="tabular-nums">{stamp.date(s.closedAt)}</span>,
      mobileCell: (s) => stamp.maybe.date(s.closedAt),
      showFrom: 'md',
    },
    {
      id: 'total',
      header: copy.colTotal,
      numeric: true,
      align: 'end',
      mobile: 'trailing',
      cell: (s) => (
        <span className="flex flex-col items-end tabular-nums">
          {s.totals.length === 0
            ? copy.nothing
            : s.totals.map((t) => <span key={t.currency}>{stamp.money(t.total, t.currency)}</span>)}
        </span>
      ),
    },
  ];

  const professionalName = preview?.professional.name ?? '';

  return (
    <div className="flex flex-col">
      <PageHeader
        title={copy.title}
        description={isAdmin ? copy.description : copy.descriptionOwn}
        actions={
          isAdmin ? (
            <Button asChild variant="secondary">
              <Link href={COMMISSION_SETTINGS_HREF}>
                <Settings2 aria-hidden />
                {copy.configure}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-8">
        {noProfessionals ? (
          <AsyncSection
            loading={false}
            isEmpty
            emptyTitle={copy.noProfessionals}
            emptyDescription={copy.noProfessionalsHint}
            emptyIcon={<Percent aria-hidden />}
          >
            {null}
          </AsyncSection>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
              {isAdmin ? (
                professionalsFailed ? (
                  <FieldError
                    label={copy.professionalsError}
                    onRetry={() => setProfessionalsReload((k) => k + 1)}
                    className="col-span-2 h-10 sm:w-64"
                  />
                ) : (
                  <FormField htmlFor={`${periodId}-professional`} label={copy.professional} className="col-span-2 sm:w-64">
                    <NativeSelect
                      id={`${periodId}-professional`}
                      value={userId ?? ''}
                      disabled={professionals === null}
                      onChange={(e) => {
                        setUserId(e.target.value);
                        setTouched(false);
                        setPeriod(null);
                      }}
                    >
                      {(professionals ?? []).map((p) => (
                        <option key={p.professional.userId} value={p.professional.userId}>
                          {p.professional.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                )
              ) : null}
              {period ? (
                <>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span id={`${periodId}-from`} className="text-sm font-medium text-ink">
                      {copy.from}
                    </span>
                    <DatePicker
                      aria-labelledby={`${periodId}-from`}
                      value={period.from}
                      onChange={(value) => {
                        if (!value) return;
                        setTouched(true);
                        setPeriod({ from: value, to: period.to });
                      }}
                      className="sm:w-48"
                      isInvalid={invalidPeriod}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span id={`${periodId}-to`} className="text-sm font-medium text-ink">
                      {copy.to}
                    </span>
                    <DatePicker
                      aria-labelledby={`${periodId}-to`}
                      value={period.to}
                      onChange={(value) => {
                        if (!value) return;
                        setTouched(true);
                        setPeriod({ from: period.from, to: value });
                      }}
                      className="sm:w-48"
                      isInvalid={invalidPeriod}
                    />
                  </div>
                </>
              ) : null}
            </div>
            {invalidPeriod ? (
              <InlineError>{copy.invalidPeriod}</InlineError>
            ) : null}

            <SedeStampNote stamp={stamp} />

            <section className="flex flex-col gap-4" aria-labelledby={`${periodId}-preview`}>
              <SectionHeader
                titleId={`${periodId}-preview`}
                title={copy.previewTitle}
                description={
                  preview?.rule ? copy.rule(ruleSummary(preview.rule)) : copy.previewHint
                }
                actions={
                  isAdmin && preview && !loading && !error ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setCloseError(null);
                        setConfirmOpen(true);
                      }}
                      disabled={!preview.canClose}
                    >
                      <Lock aria-hidden />
                      {copy.close}
                    </Button>
                  ) : undefined
                }
              />
              <AsyncSection
                loading={!invalidPeriod && (loading || !period || (isAdmin && !userId && !professionalsFailed))}
                error={error}
                onRetry={() => setReloadKey((k) => k + 1)}
                skeleton={<SectionSkeleton />}
              >
                {preview ? (
                  <div className="flex flex-col gap-6">
                    {preview.rule === null ? (
                      <Callout tone="warning">{copy.noRule}</Callout>
                    ) : isAdmin && preview.blockerMessage ? (
                      <Callout tone="info" title={copy.cannotClose}>
                        {preview.blockerMessage}
                      </Callout>
                    ) : null}
                    <CommissionTotals totals={preview.totals} stamp={stamp} />
                    <CommissionLines lines={preview.lines} stamp={stamp} />
                  </div>
                ) : null}
              </AsyncSection>
            </section>
          </>
        )}

        {noProfessionals ? null : (
          <section className="flex flex-col gap-3" aria-labelledby={`${periodId}-settlements`}>
            <SectionHeader titleId={`${periodId}-settlements`} title={copy.settlements} description={copy.settlementsHint} />
            <AsyncSection
              loading={settlements === null && !settlementsError}
              error={settlementsError}
              onRetry={() => setSettlementsReload((k) => k + 1)}
              isEmpty={(settlements ?? []).length === 0}
              emptyTitle={copy.settlementsEmpty}
              skeleton={<TableSkeleton rows={3} />}
            >
              <DataList
                label={copy.settlementsLabel}
                rows={settlements ?? []}
                columns={settlementColumns}
                getRowKey={(s) => s.id}
                getRowHref={(s) => commissionSettlementHref(s.id)}
                getRowLabel={(s) => copy.period(s.period.from, s.period.to)}
              />
            </AsyncSection>
          </section>
        )}
      </div>

      {preview && period ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={copy.confirmTitle}
          description={copy.confirmBody(professionalName, stamp.civilDate(period.from), stamp.civilDate(period.to))}
          confirmLabel={copy.confirmAction}
          confirmingLabel={copy.confirming}
          confirming={closing}
          error={closeError}
          onConfirm={() => void close()}
        >
          <p className="text-sm text-muted">{copy.confirmLock(stamp.civilDate(period.to))}</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
