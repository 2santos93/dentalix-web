"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import type {
  TreatmentPlan,
  TreatmentPlanItem,
} from "@/lib/treatment-plans/treatment-plans-api";
import type { ClinicRole } from "@/lib/me/me-api";
import {
  getPlanVisits,
  updatePlanVisits,
  type PlanVisits,
  type VisitAssignment,
} from "@/lib/treatment-plans/plan-visits-api";
import { formatCivilDate } from "@/lib/format/date";
import { apiErrorMessage } from "@/lib/api/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { InlineError } from "@/components/errors/inline-error";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";

/** DX-291: un cargo administrativo (inasistencia) no es de ningún diente. */
function toothLabel(toothNumber: string): string {
  return toothNumber ? `diente ${toothNumber}` : "sin diente";
}
export function PlanVisitsBoard({
  token,
  plan,
  role,
  onChanged,
  renderItems,
}: {
  token: string;
  plan: TreatmentPlan;
  role: ClinicRole | null;
  onChanged: () => void | Promise<void>;
  /**
   * Los ítems de una visita. `visit` es su número (`null` sin visitas) y
   * `ordered`, todos los ítems en el orden en que se pintan (visita a visita):
   * lo que numere entre visitas (DX-343, «Cargo n de N») sigue la pantalla.
   */
  renderItems: (
    items: TreatmentPlanItem[],
    context: { visit: number | null; ordered: TreatmentPlanItem[] },
  ) => React.ReactNode;
}) {
  const editable =
    (role === "DENTIST" || role === "ADMIN") &&
    ["DRAFT", "PRESENTED", "ACCEPTED"].includes(plan.status);
  const [assignments, setAssignments] = useState<VisitAssignment[]>(() =>
    (plan.items ?? []).map((i) => ({
      itemId: i.id,
      visit: i.visit ?? 1,
      visitLabel: i.visitLabel ?? null,
    })),
  );
  const [intervals, setIntervals] = useState<Record<string, number>>(
    () => plan.visitIntervals ?? {},
  );
  const [schedule, setSchedule] = useState<PlanVisits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [booking, setBooking] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const sourceSignature = JSON.stringify([
    (plan.items ?? []).map((i) => [i.id, i.visit ?? 1, i.visitLabel ?? null]),
    plan.visitIntervals ?? {},
  ]);
  const availabilityKey = JSON.stringify(
    (plan.items ?? []).map((i) => [i.id, i.status]),
  );
  const [loadedSignature, setLoadedSignature] = useState(sourceSignature);
  if (loadedSignature !== sourceSignature) {
    setLoadedSignature(sourceSignature);
    setAssignments(
      (plan.items ?? []).map((i) => ({
        itemId: i.id,
        visit: i.visit ?? 1,
        visitLabel: i.visitLabel ?? null,
      })),
    );
    setIntervals(plan.visitIntervals ?? {});
    setDirty(false);
  }

  useEffect(() => {
    let cancelled = false;
    getPlanVisits(token, plan.id)
      .then((data) => {
        if (!cancelled) {
          setSchedule(data);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled)
          setError("No pudimos cargar las fechas de las visitas.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, plan.id, plan.status, plan.updatedAt, availabilityKey, reload]);
  function scheduledVisit(number: number) {
    const visit = schedule?.visits.find((v) => v.number === number);
    return visit
      ? {
          ...visit,
          planItemIds: visit.planItemIds.filter((id) =>
            (plan.items ?? []).some(
              (i) => i.id === id && i.status === "ACCEPTED",
            ),
          ),
        }
      : undefined;
  }
  const numbers = [...new Set(assignments.map((i) => i.visit))].sort(
    (a, b) => a - b,
  );
  const next = Math.max(0, ...numbers) + 1;
  const itemsOf = (number: number) =>
    (plan.items ?? []).filter((i) =>
      assignments.some((a) => a.visit === number && a.itemId === i.id),
    );
  const ordered = numbers.flatMap(itemsOf);
  function move(itemId: string, visit: number) {
    setDirty(true);
    setAssignments((prev) =>
      prev.map((i) =>
        i.itemId === itemId
          ? {
              ...i,
              visit,
              visitLabel:
                prev.find((x) => x.visit === visit)?.visitLabel ?? null,
            }
          : i,
      ),
    );
  }
  function label(number: number, value: string) {
    setDirty(true);
    setAssignments((prev) =>
      prev.map((i) =>
        i.visit === number ? { ...i, visitLabel: value || null } : i,
      ),
    );
  }
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updatePlanVisits(token, plan.id, {
        items: assignments,
        visitIntervals: intervals,
      });
      setDirty(false);
      setReload((k) => k + 1);
      await onChanged();
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          "No pudimos guardar las visitas. Intenta de nuevo.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      aria-label="Plan por visitas"
      className="flex min-w-0 flex-col gap-5 [&_button]:min-h-11 [&_button]:min-w-11 [&_select]:min-h-11"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="t-title text-ink">Plan por visitas</h3>
          <p className="mt-1 text-sm text-muted">
            Organiza qué se realiza en cada cita y cuánto esperar entre visitas.
          </p>
        </div>
        {editable ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "Guardando…" : "Guardar visitas"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <InlineError>
          {error}{" "}
          <button
            type="button"
            className="min-h-11 font-medium underline"
            onClick={() => (dirty ? void save() : setReload((k) => k + 1))}
          >
            Reintentar
          </button>
        </InlineError>
      ) : null}
      {numbers.length === 0 ? renderItems([], { visit: null, ordered }) : null}
      {numbers.map((number) => {
        const assignment = assignments.filter((i) => i.visit === number);
        const items = itemsOf(number);
        const visit = scheduledVisit(number);
        const title = `Visita ${number}${assignment[0]?.visitLabel ? " · " + assignment[0].visitLabel : ""}`;
        return (
          <section
            key={number}
            aria-label={title}
            className="min-w-0 rounded-xl border border-border bg-surface"
          >
            <div className="flex flex-col gap-4 border-b border-border-subtle p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="font-semibold text-ink">{title}</h4>
                {visit && visit.planItemIds.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={dirty}
                    onClick={() => setBooking(number)}
                  >
                    Agendar visita {number}
                  </Button>
                ) : null}
              </div>
              {editable ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                    Etiqueta de visita {number}
                    <Input
                      disabled={saving}
                      name={`visit-${number}-label`}
                      maxLength={60}
                      value={assignment[0]?.visitLabel ?? ""}
                      onChange={(e) => label(number, e.target.value)}
                    />
                  </label>
                  {number > 1 ? (
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                      Días desde la visita anterior
                      <Input
                        disabled={saving}
                        name={`visit-${number}-interval`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={3650}
                        value={intervals[String(number)] ?? 0}
                        onChange={(e) => {
                          setDirty(true);
                          setIntervals((prev) => ({
                            ...prev,
                            [String(number)]: Number(e.target.value),
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              {number > 1 ? (
                <p className="text-sm text-muted">
                  Intervalo mínimo: {intervals[String(number)] ?? 0} días.
                </p>
              ) : null}
              {visit && plan.status === "ACCEPTED" ? (
                <p className="text-sm text-muted">
                  Fecha mínima sugerida:{" "}
                  <time dateTime={visit.minimumDate}>
                    {formatCivilDate(visit.minimumDay)}
                  </time>
                </p>
              ) : null}
              {editable ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className="flex flex-col gap-1.5 text-sm text-ink"
                    >
                      Mover a visita: {toothLabel(item.toothNumber)}, ítem{" "}
                      {(plan.items ?? []).findIndex((i) => i.id === item.id) +
                        1}
                      <NativeSelect
                        disabled={saving}
                        aria-label={`Mover a visita: ${toothLabel(item.toothNumber)}, ítem ${(plan.items ?? []).findIndex((i) => i.id === item.id) + 1}`}
                        name={`visit-item-${item.id}`}
                        value={number}
                        onChange={(e) => move(item.id, Number(e.target.value))}
                      >
                        {numbers.map((n) => (
                          <option key={n} value={n}>
                            Visita {n}
                          </option>
                        ))}
                        {next <= 1000 ? (
                          <option value={next}>Nueva visita {next}</option>
                        ) : null}
                      </NativeSelect>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            {renderItems(items, { visit: number, ordered })}
          </section>
        );
      })}
      {booking !== null && schedule ? (
        <ScheduleVisitDialog
          token={token}
          patientId={plan.patientId}
          locationId={
            plan.acceptedLocationId ?? plan.presentedLocationId ?? undefined
          }
          visit={scheduledVisit(booking)!}
          onClose={() => setBooking(null)}
          onCreated={() => {
            setBooking(null);
            setReload((k) => k + 1);
            void onChanged();
          }}
        />
      ) : null}
    </section>
  );
}
