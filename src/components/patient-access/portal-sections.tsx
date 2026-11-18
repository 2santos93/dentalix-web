'use client';
import * as React from 'react';
import {
  CalendarCheck,
  CalendarX,
  CircleCheck,
  Clock,
  Download,
  FileSignature,
  FileText,
  MapPin,
  Stethoscope,
  UserRound,
  Wallet,
} from 'lucide-react';
import type { AccountStatement } from '@/lib/account-statement/account-statement-api';
import {
  installmentLabel,
  isEmptyStatement,
  movementMethodLabel,
  shownSummaryRows,
  statementCopy,
} from '@/lib/account-statement/presentation';
import { documentFormat, documentTexts, type DocumentFormat } from '@/lib/format/document-format';
import type { PortalAppointment, PortalPlan } from '@/lib/patient-access/patient-access-api';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { MissingValue } from '@/components/ui/missing-value';
import { StatusBadge } from '@/components/ui/status-badge';

// Copy como constantes (i18n-ready). Español neutro y de «tú», sin nada de un país.
export const portalSectionsCopy = {
  appointmentsHeading: 'Tus próximas citas',
  appointmentsEmpty: 'No tiene citas próximas',
  appointmentsEmptyHint: 'Cuando la clínica te agende una cita, aparecerá aquí.',
  day: 'Día',
  time: 'Hora',
  location: 'Sede',
  provider: 'Profesional',
  type: 'Tipo de cita',
  noFormat: 'Consulta la hora con la clínica.',
  confirm: 'Confirmar',
  confirmLabel: (day: string) => `Confirmar la cita del ${day}`,
  confirmed: 'Cita confirmada. ¡Gracias!',
  confirmError: 'No pudimos confirmar la cita. Intenta de nuevo.',
  plansHeading: 'Tus presupuestos',
  plansEmpty: 'No tiene presupuestos',
  plansEmptyHint: 'Cuando la clínica te presente un presupuesto, aparecerá aquí.',
  alternatives: 'Alternativas para elegir',
  alternativesHint: 'La clínica te propone estas opciones: eliges una de ellas.',
  option: (label: string | null, index: number) => `Opción ${label ?? String.fromCharCode(65 + index)}`,
  quoteTitle: (location: string) => `Presupuesto · ${location}`,
  issuedValid: (issued: string, until: string) => `Emitido el ${issued} · válido hasta el ${until}`,
  itemsLabel: 'Procedimientos',
  tooth: (t: string) => (t ? `Diente ${t}` : 'Sin diente'),
  quantity: (n: number) => (n === 1 ? '' : ` · ${n} uds.`),
  discount: (amount: string) => `Descuento ${amount}`,
  total: (currency: string) => `Total (${currency})`,
  gross: 'Subtotal',
  discounts: 'Descuentos',
  pdf: 'Descargar PDF',
  pdfQuoteLabel: (location: string) => `Descargar PDF del presupuesto de ${location}`,
  // DX-101-bis: aceptar con firma desde el portal.
  accept: 'Aceptar presupuesto',
  chooseOption: 'Elegir esta opción',
  chooseOptionLabel: (option: string) => `Elegir esta opción: ${option}`,
  validUntil: (date: string) => `Válido hasta el ${date}`,
  acceptedOn: (date: string) => `Aceptado el ${date}`,
  accepted: 'Presupuesto aceptado. La clínica ya recibió tu aceptación.',
  accountHeading: 'Tu estado de cuenta',
  upToDate: 'Está al día',
  upToDateHint: 'No tienes saldo pendiente con la clínica.',
  summaryLabel: 'Resumen por moneda',
  balance: 'Saldo',
  inFavor: 'a tu favor',
  overdue: 'Vencido',
  overdueValue: (amount: string, n: number) => `${amount} (${n === 1 ? '1 cuota' : `${n} cuotas`})`,
  nextInstallment: 'Próxima cuota',
  nextValue: (day: string, amount: string) => `${day} · ${amount}`,
  none: 'Ninguna',
  installmentsHeading: 'Cuotas',
  installmentDue: (day: string) => `Vence el ${day}`,
  outstanding: (amount: string) => `Pendiente ${amount}`,
  movementsHeading: 'Abonos',
  movementsEmpty: 'Sin abonos registrados.',
  voided: 'Anulado',
  accountPdf: 'Descargar PDF del estado de cuenta',
};
const copy = portalSectionsCopy;

/** DX-354: zona, locale y reloj de la sede de la cita (en crudo de la API); `null` → «—». */
export function appointmentFormat(appointment: PortalAppointment): DocumentFormat | null {
  return documentFormat({
    timeZone: appointment.location.timeZone,
    locale: appointment.location.locale,
    hourCycle: appointment.location.hourCycle,
  });
}

function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="relative min-w-0 py-2 pl-8">
      <dt className="t-caption text-muted">
        <Icon aria-hidden className="absolute left-0 top-2.5 size-4 text-muted" />
        {label}
      </dt>
      <dd className="break-words font-medium tabular-nums text-ink first-letter:uppercase">{children}</dd>
    </div>
  );
}

function SectionEmpty({ icon: Icon, title, hint }: { icon: typeof Clock; title: string; hint: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <Icon aria-hidden className="size-6 text-muted" />
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{hint}</p>
    </div>
  );
}

// --- Citas -------------------------------------------------------------------

export function PortalAppointments({
  appointments,
  confirming,
  confirmError,
  confirmedId,
  onConfirm,
}: {
  appointments: PortalAppointment[];
  /** La cita que se está confirmando, o `null`. */
  confirming: string | null;
  confirmError: { id: string; message: string } | null;
  confirmedId: string | null;
  onConfirm: (id: string) => void;
}) {
  if (appointments.length === 0) {
    return <SectionEmpty icon={CalendarX} title={copy.appointmentsEmpty} hint={copy.appointmentsEmptyHint} />;
  }
  return (
    <section aria-labelledby="portal-appointments-heading" className="flex flex-col gap-3">
      <h2 id="portal-appointments-heading" className="t-title text-ink">
        {copy.appointmentsHeading}
      </h2>
      <p role="status" className={confirmedId ? 'text-sm text-success-text' : 'sr-only'}>
        {confirmedId ? copy.confirmed : ''}
      </p>
      <ul className="flex flex-col gap-3">
        {appointments.map((a) => {
          const format = appointmentFormat(a);
          const doc = documentTexts(format);
          const separator = format?.fmt.hourCycle === 'h12' ? ' – ' : '–';
          const day = format ? format.fmt.longDate(new Date(a.start), format.timeZone, { weekday: true }) : null;
          return (
            <li
              key={a.id}
              data-testid="portal-appointment"
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3 sm:px-6"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="t-title min-w-0 break-words text-ink first-letter:uppercase">{day ?? <MissingValue />}</p>
                <StatusBadge kind="appointment" status={a.status} className="shrink-0" />
              </div>
              <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <Fact icon={Clock} label={copy.time}>
                  {format ? `${doc.time(a.start)}${separator}${doc.time(a.end)}` : <MissingValue />}
                  {format ? null : <span className="block text-sm font-normal text-muted">{copy.noFormat}</span>}
                </Fact>
                <Fact icon={MapPin} label={copy.location}>
                  {a.location.name}
                  {a.location.address ? (
                    <span className="block text-sm font-normal text-muted">{a.location.address}</span>
                  ) : null}
                </Fact>
                {a.providerName ? (
                  <Fact icon={UserRound} label={copy.provider}>
                    {a.providerName}
                  </Fact>
                ) : null}
                {a.typeName ? (
                  <Fact icon={Stethoscope} label={copy.type}>
                    {a.typeName}
                  </Fact>
                ) : null}
              </dl>
              {a.confirmable ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    className="w-full sm:w-auto sm:self-start max-sm:min-h-11"
                    loading={confirming === a.id}
                    disabled={confirming !== null}
                    aria-label={day ? copy.confirmLabel(day) : undefined}
                    onClick={() => onConfirm(a.id)}
                  >
                    <CalendarCheck aria-hidden /> {copy.confirm}
                  </Button>
                  {confirmError?.id === a.id ? <InlineError>{confirmError.message}</InlineError> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- Presupuestos ------------------------------------------------------------

/** Las alternativas A/B juntas (mismo `optionGroupId`), en el orden en que llegan. */
export function groupPlans(plans: PortalPlan[]): PortalPlan[][] {
  const groups: PortalPlan[][] = [];
  const byGroup = new Map<string, PortalPlan[]>();
  for (const plan of plans) {
    if (!plan.optionGroupId) {
      groups.push([plan]);
      continue;
    }
    const existing = byGroup.get(plan.optionGroupId);
    if (existing) existing.push(plan);
    else {
      const group = [plan];
      byGroup.set(plan.optionGroupId, group);
      groups.push(group);
    }
  }
  return groups;
}

/** El id del título de la tarjeta de un plan: recibe el foco tras aceptarlo. */
export function portalPlanTitleId(planId: string): string {
  return `portal-plan-${planId}`;
}

function PlanCard({
  plan,
  optionLabel,
  inGroup,
  onPrint,
  onAccept,
}: {
  plan: PortalPlan;
  optionLabel: string | null;
  /** Una de las alternativas A/B: el botón dice «Elegir esta opción». */
  inGroup: boolean;
  onPrint: (planId: string) => void;
  onAccept: (plan: PortalPlan, optionLabel: string | null) => void;
}) {
  const { quote } = plan;
  const format = documentFormat(quote.regional);
  const doc = documentTexts(format);
  const titleId = portalPlanTitleId(plan.id);
  const validId = `${titleId}-valid`;
  return (
    <article
      aria-labelledby={titleId}
      data-testid="portal-plan"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4 sm:px-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} tabIndex={-1} className="t-title break-words text-ink focus-visible:outline-none">
            {optionLabel ? `${optionLabel} · ` : ''}
            {copy.quoteTitle(quote.location.name)}
          </h3>
          <p className="t-caption tabular-nums text-muted">
            {copy.issuedValid(doc.civilDate(quote.issuedOn), doc.civilDate(quote.validUntil))}
          </p>
        </div>
        <StatusBadge kind="treatmentPlan" status={plan.status} className="shrink-0" />
      </div>
      <ul aria-label={copy.itemsLabel} className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
        {quote.items.map((item, index) => (
          <li key={`${item.toothNumber}-${index}`} className="flex items-start justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 break-words">
              <span className="block font-medium text-ink">{item.procedure}</span>
              <span className="block tabular-nums text-muted">
                {copy.tooth(item.toothNumber)}
                {copy.quantity(item.quantity)}
                {item.discount > 0 ? ` · ${copy.discount(doc.amount(item.discount, quote.currency))}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-right font-medium tabular-nums text-ink">
              {doc.amount(item.subtotal, quote.currency)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1 text-sm">
        {quote.totals.map((t) => (
          <React.Fragment key={t.currency}>
            {t.discount > 0 ? (
              <>
                <div className="flex justify-between gap-3 text-muted">
                  <dt>{copy.gross}</dt>
                  <dd className="tabular-nums">{doc.amount(t.gross, t.currency)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-muted">
                  <dt>{copy.discounts}</dt>
                  <dd className="tabular-nums">−{doc.amount(t.discount, t.currency)}</dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between gap-3 text-base font-semibold text-ink">
              <dt>{copy.total(t.currency)}</dt>
              <dd className="tabular-nums">{doc.amount(t.net, t.currency)}</dd>
            </div>
          </React.Fragment>
        ))}
      </dl>
      {plan.status === 'ACCEPTED' && plan.acceptedAt ? (
        <p data-testid="portal-plan-accepted" className="flex items-start gap-2 text-sm font-medium text-ink">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success-text" />
          <span className="tabular-nums">{copy.acceptedOn(doc.date(plan.acceptedAt))}</span>
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {plan.acceptable ? (
          <Button
            type="button"
            className="w-full sm:w-auto max-sm:min-h-11"
            aria-label={inGroup && optionLabel ? copy.chooseOptionLabel(optionLabel) : undefined}
            aria-describedby={validId}
            onClick={() => onAccept(plan, optionLabel)}
          >
            <FileSignature aria-hidden /> {inGroup ? copy.chooseOption : copy.accept}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto max-sm:min-h-11"
          aria-label={copy.pdfQuoteLabel(quote.location.name)}
          disabled={format === null}
          onClick={() => onPrint(plan.id)}
        >
          <Download aria-hidden /> {copy.pdf}
        </Button>
      </div>
      {plan.acceptable ? (
        <p id={validId} className="t-caption tabular-nums text-muted">
          {copy.validUntil(doc.civilDate(plan.validUntil))}
        </p>
      ) : null}
    </article>
  );
}

export function PortalPlans({
  plans,
  onPrint,
  onAccept,
  accepted = false,
  acceptError = null,
}: {
  plans: PortalPlan[];
  onPrint: (planId: string) => void;
  /** DX-101-bis: abre la aceptación con firma de un plan `acceptable`. */
  onAccept: (plan: PortalPlan, optionLabel: string | null) => void;
  /** Recién aceptado uno: la confirmación (región `role="status"` montada siempre). */
  accepted?: boolean;
  /** No se pudo aceptar (409, 404…): el texto de la API, ya con los datos recargados. */
  acceptError?: string | null;
}) {
  if (plans.length === 0) {
    return <SectionEmpty icon={FileText} title={copy.plansEmpty} hint={copy.plansEmptyHint} />;
  }
  return (
    <section aria-labelledby="portal-plans-heading" className="flex flex-col gap-3">
      <h2 id="portal-plans-heading" className="t-title text-ink">
        {copy.plansHeading}
      </h2>
      <p role="status" data-testid="portal-plan-accepted-notice" className={accepted ? 'text-sm text-success-text' : 'sr-only'}>
        {accepted ? copy.accepted : ''}
      </p>
      {acceptError ? (
        <Callout tone="warning" role="alert" data-testid="portal-accept-error">
          {acceptError}
        </Callout>
      ) : null}
      {groupPlans(plans).map((group) =>
        group.length === 1 && !group[0].optionGroupId ? (
          <PlanCard
            key={group[0].id}
            plan={group[0]}
            optionLabel={null}
            inGroup={false}
            onPrint={onPrint}
            onAccept={onAccept}
          />
        ) : (
          <section
            key={group[0].optionGroupId ?? group[0].id}
            aria-label={copy.alternatives}
            data-testid="portal-plan-group"
            className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-sunken p-3"
          >
            <div>
              <p className="text-sm font-medium text-ink">{copy.alternatives}</p>
              <p className="text-sm text-muted">{copy.alternativesHint}</p>
            </div>
            {group.map((plan, i) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                optionLabel={copy.option(plan.optionLabel, i)}
                inGroup
                onPrint={onPrint}
                onAccept={onAccept}
              />
            ))}
          </section>
        ),
      )}
    </section>
  );
}

// --- Mi cuenta ---------------------------------------------------------------

/** Sin deuda: ningún saldo pendiente ni cuota vencida en ninguna moneda. */
export function accountUpToDate(account: AccountStatement): boolean {
  return shownSummaryRows(account.summary).every((r) => r.convertedBalance <= 0 && r.overdueCount === 0);
}

export function PortalAccount({ account, onPrint }: { account: AccountStatement; onPrint: () => void }) {
  // Los importes vienen calculados de la API (los mismos del estado de cuenta
  // del personal, DX-011): aquí solo se pintan, sin sumar ni redondear nada.
  const format = documentFormat(account.regional);
  const doc = documentTexts(format);
  const summary = shownSummaryRows(account.summary);
  const empty = isEmptyStatement(account);
  const upToDate = accountUpToDate(account);
  return (
    <section aria-labelledby="portal-account-heading" className="flex flex-col gap-4">
      <h2 id="portal-account-heading" className="t-title text-ink">
        {copy.accountHeading}
      </h2>
      {upToDate ? (
        <Callout tone="success" icon={Wallet} title={copy.upToDate} data-testid="portal-up-to-date">
          {copy.upToDateHint}
        </Callout>
      ) : null}
      {!empty && summary.length > 0 ? (
        <ul aria-label={copy.summaryLabel} className="flex flex-col gap-3">
          {summary.map((row) => (
            <li
              key={row.currency}
              data-testid="portal-account-summary"
              className="rounded-xl border border-border bg-surface px-4 py-3 sm:px-6"
            >
              <p className="t-caption text-muted">{row.currency}</p>
              <dl className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <dt className="t-caption text-muted">{copy.balance}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-ink">
                    {doc.amount(Math.abs(row.convertedBalance), row.currency)}
                    {row.convertedBalance < 0 ? <span className="text-sm font-normal text-muted"> {copy.inFavor}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="t-caption text-muted">{copy.overdue}</dt>
                  <dd className={row.overdueCount > 0 ? 'font-semibold tabular-nums text-danger-text' : 'tabular-nums text-ink'}>
                    {row.overdueCount > 0
                      ? copy.overdueValue(doc.amount(row.overdueAmount, row.currency), row.overdueCount)
                      : copy.none}
                  </dd>
                </div>
                <div>
                  <dt className="t-caption text-muted">{copy.nextInstallment}</dt>
                  <dd className="tabular-nums text-ink">
                    {row.nextInstallment
                      ? copy.nextValue(
                          doc.civilDate(row.nextInstallment.dueDate),
                          doc.amount(row.nextInstallment.amount, row.currency),
                        )
                      : copy.none}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}

      {account.installments.length > 0 ? (
        <section aria-labelledby="portal-installments-heading" className="flex flex-col gap-2">
          <h3 id="portal-installments-heading" className="t-label text-ink">
            {copy.installmentsHeading}
          </h3>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
            {account.installments.map((inst) => (
              <li
                key={`${inst.paymentPlanId}-${inst.kind}-${inst.sequence ?? 0}`}
                className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{installmentLabel(inst)}</span>
                  <span className="block tabular-nums text-muted">{copy.installmentDue(doc.civilDate(inst.dueDate))}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="font-medium tabular-nums text-ink">{doc.amount(inst.amount, inst.currency)}</span>
                  {inst.outstanding > 0 && inst.outstanding !== inst.amount ? (
                    <span className="tabular-nums text-muted">{copy.outstanding(doc.amount(inst.outstanding, inst.currency))}</span>
                  ) : null}
                  <StatusBadge kind="installment" status={inst.status} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!empty ? (
        <section aria-labelledby="portal-movements-heading" className="flex flex-col gap-2">
          <h3 id="portal-movements-heading" className="t-label text-ink">
            {copy.movementsHeading}
          </h3>
          {account.movements.length === 0 ? (
            <p className="text-sm text-muted">{copy.movementsEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
              {account.movements.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block tabular-nums font-medium text-ink">{doc.civilDate(m.paidOn)}</span>
                    <span className="block break-words text-muted">{movementMethodLabel(m)}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {m.voided ? (
                      <>
                        <span className="block text-xs text-muted">{copy.voided}</span>
                        <span className="text-muted line-through">{doc.amount(m.amount, m.currency)}</span>
                      </>
                    ) : (
                      <span className="font-medium text-ink">{doc.amount(m.amount, m.currency)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">{statementCopy.footnote}</p>
        </section>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto sm:self-start max-sm:min-h-11"
        aria-label={copy.accountPdf}
        disabled={format === null}
        onClick={onPrint}
      >
        <Download aria-hidden /> {copy.pdf}
      </Button>
    </section>
  );
}
