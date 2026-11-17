"use client";
import * as React from "react";
import { useEffect, useId, useState } from "react";
import {
  Calculator,
  Copy,
  MessageCircle,
  PenLine,
  Plus,
  Printer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api/error-message";
import type { ClinicRole } from "@/lib/me/me-api";
import type { TreatmentPlan } from "@/lib/treatment-plans/treatment-plans-api";
import {
  canAcceptPlan,
  planQuotePrintHref,
  type PlanQuote,
} from "@/lib/treatment-plans/plan-quote-api";
import {
  acceptInstallmentPlan,
  dueDay,
  encodeFinancing,
  FINANCING_PARAM,
  financingMessage,
  financingWhatsAppHref,
  installmentAmounts,
  MAX_SCENARIOS,
  PERIODICITY_OPTIONS,
  scenarioLine,
  simulateInstallments,
  startDateInstant,
  type FinancingPainters,
  type InstallmentScenario,
  type InstallmentSimulation,
  type InstallmentTerms,
  type Periodicity,
} from "@/lib/treatment-plans/installment-simulation";
import { parseMoneyInput } from "@/lib/format/money";
import type { SedePainters } from "@/lib/locations/sede-stamp";
import {
  readyTimeZone,
  sedeToday,
  useSedeTimeZone,
} from "@/lib/locations/use-sede-time-zone";
import { fetchClinicName } from "@/lib/clinic-branding";
import { getPatient } from "@/lib/patients/patients-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { DatePicker } from "@/components/ui/date-picker";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { Disclosure } from "@/components/shared/disclosure";
import { ExternalLink } from "@/components/shared/external-link";
import { InlineError } from "@/components/errors/inline-error";
import { SedeConfigError } from "@/components/locations/sede-config-error";
import { AcceptPlanModal } from "./accept-plan-modal";

export const financingCopy = {
  heading: "Financiar",
  description:
    "Simula hasta 3 opciones de pago en cuotas para presentarlas con el presupuesto. Nada se guarda hasta que el paciente acepta una.",
  open: "Simular cuotas",
  option: (n: number) => `Opción ${n}`,
  downPayment: "Cuota inicial",
  installmentsCount: "N.º de cuotas",
  periodicity: "Periodicidad",
  startDate: "Primera cuota",
  addOption: "Agregar opción",
  removeOption: (n: number) => `Quitar la opción ${n}`,
  simulate: "Calcular cuotas",
  simulating: "Calculando…",
  invalidCount: "El número de cuotas debe ser un entero entre 1 y 600.",
  missingStart: "Elige la fecha de la primera cuota.",
  simulateError: "No pudimos calcular las cuotas.",
  financed: (total: string) => `Saldo que se financia: ${total}`,
  noInterest:
    "Sin intereses. La inicial más las cuotas suman el saldo; el ajuste de redondeo va en la última cuota.",
  schedule: "Ver calendario",
  scheduleCaption: (n: number) => `Calendario de la opción ${n}`,
  colSeq: "N.º",
  colDue: "Vence",
  colAmount: "Importe",
  downRow: "Inicial",
  print: "Imprimir con estas opciones",
  whatsapp: "Enviar por WhatsApp",
  copyText: "Copiar texto",
  copied: "Texto copiado.",
  copyFailed: "No pudimos copiar el texto.",
  noFormat:
    "Configura el formato de la sede para enviar o copiar las opciones.",
  accept: "Aceptar con esta opción",
  expiredHint:
    "El presupuesto venció: actualiza los precios antes de aceptarlo con cuotas.",
  staleHint: "Cambiaste las condiciones: vuelve a calcular las cuotas.",
};

const copy = financingCopy;

interface ScenarioForm {
  key: number;
  downPayment: string;
  installmentsCount: string;
  periodicity: Periodicity;
  /** `null` = hoy en la sede, hasta que se elige otro día. */
  startDate: string | null;
}

const DEFAULT_COUNTS = [3, 6, 12];

function newScenario(key: number): ScenarioForm {
  return {
    key,
    downPayment: "0",
    installmentsCount: String(DEFAULT_COUNTS[key % DEFAULT_COUNTS.length]),
    periodicity: "MONTHLY",
    startDate: null,
  };
}

interface PlanFinancingProps {
  token: string;
  patientId: string;
  /** El detalle del plan (con `items`), sin aceptar. */
  plan: TreatmentPlan;
  role: ClinicRole | null;
  /** El pintor de la pantalla (la sede de la presentación da importes y fechas). */
  stamp: SedePainters;
  /** Tras firmar con una opción: el padre recarga el plan (y su plan de cuotas). */
  onAccepted: (quote: PlanQuote) => void;
}

/**
 * «Financiar» del presupuesto (DX-041). Hasta 3 opciones (cuota inicial,
 * cuotas, periodicidad y primera cuota) que la API simula sin guardar nada;
 * se imprimen con el presupuesto, se comparten por WhatsApp (enlace wa.me con
 * el texto: no hay proveedor de WhatsApp, DX-126) y, quien acepta, firma el
 * presupuesto con una de ellas: el plan de cuotas nace en la misma aceptación.
 */
export function PlanFinancing({
  token,
  patientId,
  plan,
  role,
  stamp,
  onAccepted,
}: PlanFinancingProps) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<ScenarioForm[]>(() => [newScenario(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [simulation, setSimulation] = useState<InstallmentSimulation | null>(
    null,
  );
  const [stale, setStale] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<InstallmentScenario | null>(null);
  const [patient, setPatient] = useState<{
    name: string;
    phone: string | null;
  } | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;
  const locationId = plan.presentedLocationId ?? null;
  const currency = plan.currency;

  // Para el texto al paciente: su nombre y su teléfono, y el de la clínica. Fallan en silencio.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPatient(token, patientId)
      .then((p) => {
        if (!cancelled) {
          setPatient({
            name: `${p.firstName} ${p.lastName}`.trim(),
            phone: p.phoneInternational ?? p.phone ?? null,
          });
        }
      })
      .catch(() => undefined);
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId]);

  const money = (amount: number, cur: string) =>
    stamp.money(amount, cur, locationId);
  const paint: FinancingPainters = {
    amount: (amount, cur) =>
      stamp.fmtOf(locationId) ? stamp.money(amount, cur, locationId) : null,
    civilDate: (day) => stamp.maybe.civilDate(day, locationId),
  };

  function patch(key: number, next: Partial<ScenarioForm>) {
    setForms((list) =>
      list.map((f) => (f.key === key ? { ...f, ...next } : f)),
    );
    if (simulation) setStale(true);
  }

  function fieldId(key: number, field: string) {
    return `${baseId}-${field}-${key}`;
  }

  function readTerms(): InstallmentTerms[] | null {
    const nextErrors: Record<string, string> = {};
    const terms: InstallmentTerms[] = [];
    for (const f of forms) {
      const count = Number(f.installmentsCount);
      if (!Number.isInteger(count) || count < 1 || count > 600) {
        nextErrors[fieldId(f.key, "count")] = copy.invalidCount;
      }
      const down =
        f.downPayment.trim() === ""
          ? null
          : parseMoneyInput(f.downPayment, currency);
      if (down && !down.ok) nextErrors[fieldId(f.key, "down")] = down.message;
      const start = f.startDate ?? today;
      if (!start) nextErrors[fieldId(f.key, "start")] = copy.missingStart;
      if (start && Number.isInteger(count) && (!down || down.ok)) {
        terms.push({
          installmentsCount: count,
          periodicity: f.periodicity,
          startDate: startDateInstant(start),
          downPayment: down ? down.value : 0,
        });
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? terms : null;
  }

  async function handleSimulate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const terms = readTerms();
    if (!terms) return;
    setSimulating(true);
    setSimulateError(null);
    try {
      setSimulation(await simulateInstallments(token, plan.id, terms));
      setStale(false);
    } catch (err) {
      setSimulation(null);
      setSimulateError(apiErrorMessage(err, copy.simulateError));
    } finally {
      setSimulating(false);
    }
  }

  const ready = simulation !== null && !stale;
  const message =
    ready && simulation
      ? financingMessage(
          { patientName: patient?.name ?? "", clinicName, simulation },
          paint,
        )
      : null;
  const printHref =
    ready && simulation
      ? `${planQuotePrintHref(patientId, plan.id)}?${FINANCING_PARAM}=${encodeURIComponent(
          encodeFinancing(simulation.scenarios.map(termsOf)),
        )}`
      : null;
  const mayAccept = canAcceptPlan(role);

  async function handleCopy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
    }
  }

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      className="flex flex-col gap-4"
    >
      <SectionHeader
        titleId={`${baseId}-title`}
        title={copy.heading}
        description={copy.description}
        actions={
          open ? null : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(true)}
            >
              <Calculator aria-hidden />
              {copy.open}
            </Button>
          )
        }
      />
      {open ? (
        <form
          noValidate
          onSubmit={handleSimulate}
          className="flex flex-col gap-4"
        >
          {forms.map((f, index) => (
            <div
              key={f.key}
              role="group"
              aria-labelledby={fieldId(f.key, "legend")}
              className="flex flex-col gap-3 border-t border-border-subtle pt-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 id={fieldId(f.key, "legend")} className="t-label text-ink">
                  {copy.option(index + 1)}
                </h3>
                {forms.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copy.removeOption(index + 1)}
                    onClick={() => {
                      setForms((list) => list.filter((x) => x.key !== f.key));
                      if (simulation) setStale(true);
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormField
                  htmlFor={fieldId(f.key, "down")}
                  label={copy.downPayment}
                  error={errors[fieldId(f.key, "down")]}
                >
                  <MoneyInput
                    id={fieldId(f.key, "down")}
                    money={money}
                    currency={currency}
                    value={f.downPayment}
                    onValueChange={(downPayment) =>
                      patch(f.key, { downPayment })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor={fieldId(f.key, "count")}
                  label={copy.installmentsCount}
                  error={errors[fieldId(f.key, "count")]}
                >
                  <Input
                    id={fieldId(f.key, "count")}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    step="1"
                    value={f.installmentsCount}
                    onChange={(e) =>
                      patch(f.key, { installmentsCount: e.target.value })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor={fieldId(f.key, "periodicity")}
                  label={copy.periodicity}
                >
                  <NativeSelect
                    id={fieldId(f.key, "periodicity")}
                    value={f.periodicity}
                    onChange={(e) =>
                      patch(f.key, {
                        periodicity: e.target.value as Periodicity,
                      })
                    }
                  >
                    {PERIODICITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField
                  htmlFor={fieldId(f.key, "start")}
                  label={copy.startDate}
                  error={errors[fieldId(f.key, "start")]}
                >
                  {zone.status === "error" ? (
                    <SedeConfigError
                      kind="timeZone"
                      variant="field"
                      retryId={fieldId(f.key, "start")}
                      description={zone.message}
                      onRetry={zone.retry}
                    />
                  ) : (
                    <DatePicker
                      id={fieldId(f.key, "start")}
                      value={f.startDate ?? today}
                      min={today ?? undefined}
                      onChange={(next) =>
                        patch(f.key, { startDate: next ?? today })
                      }
                    />
                  )}
                </FormField>
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Una sola primaria en la vista: la de aceptar el presupuesto. */}
            <Button type="submit" variant="secondary" disabled={simulating}>
              <Calculator aria-hidden />
              {simulating ? copy.simulating : copy.simulate}
            </Button>
            {forms.length < MAX_SCENARIOS ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setForms((list) => [...list, newScenario(nextKey)]);
                  setNextKey((k) => k + 1);
                  if (simulation) setStale(true);
                }}
              >
                <Plus aria-hidden />
                {copy.addOption}
              </Button>
            ) : null}
          </div>
          {simulateError ? <InlineError>{simulateError}</InlineError> : null}
        </form>
      ) : null}

      {open && simulation ? (
        <div aria-live="polite" className="flex flex-col gap-4">
          {stale ? (
            <p role="status" className="t-caption text-muted">
              {copy.staleHint}
            </p>
          ) : null}
          <p className="text-sm tabular-nums text-ink">
            {copy.financed(
              money(simulation.totalToFinance, simulation.currency),
            )}
          </p>
          <ol className="flex flex-col gap-4" aria-label={copy.heading}>
            {simulation.scenarios.map((scenario, index) => (
              <ScenarioResult
                key={index}
                n={index + 1}
                scenario={scenario}
                currency={simulation.currency}
                money={money}
                civilDate={(day) => stamp.civilDate(day, locationId)}
                line={scenarioLine(scenario, simulation.currency, paint)}
                acceptAction={
                  mayAccept && ready ? (
                    plan.quoteExpired ? (
                      <p className="t-caption text-muted">{copy.expiredHint}</p>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setAccepting(scenario)}
                      >
                        <PenLine aria-hidden />
                        {copy.accept}
                      </Button>
                    )
                  ) : null
                }
              />
            ))}
          </ol>
          <p className="t-caption text-muted">{copy.noInterest}</p>
          {ready ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {printHref ? (
                <Button asChild variant="secondary">
                  <ExternalLink href={printHref}>
                    <Printer aria-hidden />
                    {copy.print}
                  </ExternalLink>
                </Button>
              ) : null}
              {message ? (
                <>
                  <Button asChild variant="secondary">
                    <ExternalLink
                      href={financingWhatsAppHref(patient?.phone, message)}
                    >
                      <MessageCircle aria-hidden />
                      {copy.whatsapp}
                    </ExternalLink>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleCopy()}
                  >
                    <Copy aria-hidden />
                    {copy.copyText}
                  </Button>
                </>
              ) : (
                <p className="t-caption text-muted">{copy.noFormat}</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {accepting ? (
        <AcceptPlanModal
          open
          onOpenChange={(next) => {
            if (!next) setAccepting(null);
          }}
          token={token}
          patientId={patientId}
          planId={plan.id}
          onAccepted={onAccepted}
          quoteExpired={plan.quoteExpired}
          role={role}
          locationId={locationId}
          installmentPlan={acceptInstallmentPlan(accepting)}
          installmentSummary={
            scenarioLine(accepting, currency, paint) ??
            copy.financed(money(accepting.totalToFinance, currency))
          }
        />
      ) : null}
    </section>
  );
}

/** Las condiciones de un escenario ya simulado (para la URL de la vista A4). */
function termsOf(s: InstallmentScenario): InstallmentTerms {
  return {
    installmentsCount: s.installmentsCount,
    periodicity: s.periodicity,
    startDate: s.startDate,
    downPayment: s.downPayment,
  };
}

function ScenarioResult({
  n,
  scenario,
  currency,
  money,
  civilDate,
  line,
  acceptAction,
}: {
  n: number;
  scenario: InstallmentScenario;
  currency: string;
  money: (amount: number, currency: string) => string;
  civilDate: (day: string) => string;
  line: string | null;
  acceptAction: React.ReactNode;
}) {
  const { base } = installmentAmounts(scenario);
  return (
    <li
      className="flex flex-col gap-2 border-t border-border-subtle pt-3"
      data-testid={`financing-option-${n}`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h3 className="t-label text-ink">{copy.option(n)}</h3>
        <p className="text-sm font-medium tabular-nums text-ink">
          {`${scenario.installmentsCount} × ${money(base, currency)}`}
        </p>
      </div>
      {line ? <p className="text-sm tabular-nums text-muted">{line}</p> : null}
      <Disclosure summary={copy.schedule}>
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">{copy.scheduleCaption(n)}</caption>
          <thead>
            <tr className="t-label text-muted">
              <th scope="col" className="py-1 text-left font-medium">
                {copy.colSeq}
              </th>
              <th scope="col" className="py-1 text-left font-medium">
                {copy.colDue}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {copy.colAmount}
              </th>
            </tr>
          </thead>
          <tbody>
            {scenario.downPayment > 0 ? (
              <tr className="border-t border-border-subtle">
                <td className="py-1">{copy.downRow}</td>
                <td className="py-1">
                  {civilDate(dueDay(scenario.startDate))}
                </td>
                <td className="py-1 text-right">
                  {money(scenario.downPayment, currency)}
                </td>
              </tr>
            ) : null}
            {scenario.installments.map((i) => (
              <tr key={i.sequence} className="border-t border-border-subtle">
                <td className="py-1">{i.sequence}</td>
                <td className="py-1">{civilDate(dueDay(i.dueDate))}</td>
                <td className="py-1 text-right">{money(i.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
      {acceptAction ? <div>{acceptAction}</div> : null}
    </li>
  );
}
