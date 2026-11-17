import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { whatsAppUrl } from "@/lib/appointments/confirmation-message";

/**
 * DX-041: «Financiar» del presupuesto. La API simula (sin guardar nada) hasta
 * 3 planes de cuotas con la MISMA cuenta que el alta del plan de cuotas; la
 * web solo pide, pinta y comparte. Nunca reparte cuotas por su cuenta.
 */
export type InstallmentTerms = components["schemas"]["InstallmentTermsDto"];
export type InstallmentScenario =
  components["schemas"]["InstallmentScenarioDto"];
export type InstallmentSimulation =
  components["schemas"]["InstallmentSimulationDto"];
export type AcceptInstallmentPlan =
  components["schemas"]["AcceptInstallmentPlanDto"];
export type Periodicity = InstallmentTerms["periodicity"];

/** Escenarios por simulación: los que caben en pantalla y en el PDF (la API da 400 con más). */
export const MAX_SCENARIOS = 3;
/** 409 de la aceptación: el saldo a financiar ya no es el simulado. */
export const INSTALLMENT_SIMULATION_STALE = "INSTALLMENT_SIMULATION_STALE";

export const PERIODICITY_OPTIONS: readonly {
  value: Periodicity;
  label: string;
}[] = [
  { value: "MONTHLY", label: "Mensual" },
  { value: "BIWEEKLY", label: "Quincenal" },
  { value: "WEEKLY", label: "Semanal" },
];

const PERIODICITY_PLURAL: Record<Periodicity, string> = {
  MONTHLY: "mensuales",
  BIWEEKLY: "quincenales",
  WEEKLY: "semanales",
};
const PERIODICITY_ONE: Record<Periodicity, string> = {
  MONTHLY: "mensual",
  BIWEEKLY: "quincenal",
  WEEKLY: "semanal",
};

/** `POST /treatment-plans/:id/installment-simulation` — no escribe nada. */
export async function simulateInstallments(
  token: string,
  planId: string,
  scenarios: readonly InstallmentTerms[],
): Promise<InstallmentSimulation> {
  return apiFetch<InstallmentSimulation>(
    `/treatment-plans/${encodeURIComponent(planId)}/installment-simulation`,
    {
      method: "POST",
      body: { scenarios },
      token,
    },
  );
}

/** El día civil (`YYYY-MM-DD`) de una fecha de cuota (la API la guarda a medianoche UTC). */
export function dueDay(iso: string): string {
  return iso.slice(0, 10);
}

/** La fecha de la 1ª cuota como la envía el alta del plan de cuotas: medianoche UTC del día. */
export function startDateInstant(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/** Las condiciones de un escenario simulado, para aceptarlo (con el saldo que mostró). */
export function acceptInstallmentPlan(
  scenario: InstallmentScenario,
): AcceptInstallmentPlan {
  return {
    downPayment: scenario.downPayment,
    installmentsCount: scenario.installmentsCount,
    periodicity: scenario.periodicity,
    startDate: startDateInstant(dueDay(scenario.startDate)),
    totalToFinance: scenario.totalToFinance,
  };
}

/** Cuota base (la de todas menos, quizá, la última) y la última, que se lleva el ajuste. */
export function installmentAmounts(scenario: InstallmentScenario): {
  base: number;
  last: number;
} {
  const list = scenario.installments;
  const last = list[list.length - 1]?.amount ?? 0;
  return { base: list[0]?.amount ?? 0, last };
}

/** Painters de dinero y de día civil; `null` si la sede no tiene formato (nada sale con «—»). */
export interface FinancingPainters {
  amount: (amount: number, currency: string) => string | null;
  civilDate: (day: string) => string | null;
}

/**
 * Una línea por escenario: «Inicial de 300,00 USD y 6 cuotas mensuales de
 * 200,00 USD desde el 01/12/2026» (con «la última de …» si el redondeo la
 * cambia). `null` sin formato de la sede.
 */
export function scenarioLine(
  scenario: InstallmentScenario,
  currency: string,
  paint: FinancingPainters,
): string | null {
  const { base, last } = installmentAmounts(scenario);
  const baseText = paint.amount(base, currency);
  const lastText = paint.amount(last, currency);
  const downText = paint.amount(scenario.downPayment, currency);
  const from = paint.civilDate(dueDay(scenario.startDate));
  if (
    baseText === null ||
    lastText === null ||
    downText === null ||
    from === null
  )
    return null;
  const n = scenario.installmentsCount;
  const quotas =
    n === 1
      ? `1 cuota ${PERIODICITY_ONE[scenario.periodicity]} de ${baseText}`
      : `${n} cuotas ${PERIODICITY_PLURAL[scenario.periodicity]} de ${baseText}`;
  const adjust = n > 1 && last !== base ? ` (la última de ${lastText})` : "";
  const lead =
    scenario.downPayment > 0
      ? `Inicial de ${downText} y ${quotas}`
      : `Sin inicial: ${quotas}`;
  return `${lead}${adjust}, desde el ${from}`;
}

/**
 * El texto para el paciente (WhatsApp o copiar): saludo, total y una línea por
 * opción. Sin procedimientos ni datos clínicos. `null` si falta el formato de
 * la sede: un mensaje que sale al paciente nunca lleva «—».
 */
export function financingMessage(
  {
    patientName,
    clinicName,
    simulation,
  }: {
    patientName: string;
    clinicName: string | null;
    simulation: InstallmentSimulation;
  },
  paint: FinancingPainters,
): string | null {
  const total = paint.amount(simulation.totalToFinance, simulation.currency);
  const lines = simulation.scenarios.map((s) =>
    scenarioLine(s, simulation.currency, paint),
  );
  if (total === null || lines.some((l) => l === null)) return null;
  const firstName = patientName.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName}` : "Hola";
  const clinic = clinicName ? clinicName : "la clínica";
  const options = lines
    .map((line, i) => `Opción ${i + 1}: ${line}.`)
    .join("\n");
  return (
    `${greeting}, te escribimos de ${clinic} con las opciones de pago de tu presupuesto de ${total}:\n` +
    `${options}\n` +
    "Sin intereses. Escríbenos si quieres empezar con alguna."
  );
}

/** `https://wa.me/<número>?text=…`, o el selector de chats de WhatsApp sin número conocido. */
export function financingWhatsAppHref(
  phoneInternational: string | null | undefined,
  message: string,
): string {
  const digits = (phoneInternational ?? "").replace(/\D/g, "");
  return digits.length >= 8
    ? whatsAppUrl(digits, message)
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/* ---------- Los escenarios en la URL de la vista A4 ---------- */

/** Parámetro de la vista imprimible con los escenarios (`?cuotas=`). */
export const FINANCING_PARAM = "cuotas";

const PERIODICITY_CODE: Record<Periodicity, string> = {
  MONTHLY: "M",
  BIWEEKLY: "Q",
  WEEKLY: "S",
};
const CODE_PERIODICITY: Record<string, Periodicity> = {
  M: "MONTHLY",
  Q: "BIWEEKLY",
  S: "WEEKLY",
};

/**
 * `M.6.2026-12-01.300_Q.12.2026-12-01.0`: periodicidad, cuotas, 1ª cuota e
 * inicial de cada escenario. La vista A4 los vuelve a simular (nada viaja con
 * importes calculados).
 */
export function encodeFinancing(
  scenarios: readonly InstallmentTerms[],
): string {
  return scenarios
    .slice(0, MAX_SCENARIOS)
    .map((s) =>
      [
        PERIODICITY_CODE[s.periodicity],
        s.installmentsCount,
        dueDay(s.startDate),
        s.downPayment ?? 0,
      ].join("."),
    )
    .join("_");
}

/** Lee `?cuotas=`; `null` si falta o no es válido (el presupuesto se imprime sin el bloque). */
export function decodeFinancing(
  value: string | null | undefined,
): InstallmentTerms[] | null {
  if (!value) return null;
  const parts = value.split("_");
  if (parts.length < 1 || parts.length > MAX_SCENARIOS) return null;
  const out: InstallmentTerms[] = [];
  for (const part of parts) {
    const match =
      /^([MQS])\.(\d{1,3})\.(\d{4}-\d{2}-\d{2})\.(\d{1,10}(?:\.\d{1,2})?)$/.exec(
        part,
      );
    if (!match) return null;
    const count = Number.parseInt(match[2], 10);
    if (count < 1 || count > 600) return null;
    out.push({
      periodicity: CODE_PERIODICITY[match[1]],
      installmentsCount: count,
      startDate: startDateInstant(match[3]),
      downPayment: Number.parseFloat(match[4]),
    });
  }
  return out;
}
