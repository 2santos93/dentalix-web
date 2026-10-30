"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listUnscheduledPlans,
  type UnscheduledPage,
  type UnscheduledPlan,
} from "@/lib/treatment-plans/plan-visits-api";
import {
  listLocations,
  type ClinicLocation,
} from "@/lib/locations/locations-api";
import { getActiveLocationId } from "@/lib/locations/location-store";
import { apiErrorMessage } from "@/lib/api/error-message";
import { NO_SEDE_FORMAT, sedeMoney } from "@/lib/format/sede-number";
import { useSedeClock } from "@/lib/locations/sede-clock";
import { SedeConfigError } from "@/components/locations/sede-config-error";
import { Button } from "@/components/ui/button";
import { AsyncSection } from "@/components/shared/async-section";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";
export function UnscheduledPlansView({ token }: { token: string }) {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [locationId, setLocationId] = useState(
    () => getActiveLocationId() ?? "",
  );
  // DX-378 (FE-078): la fecha mínima y el total con el formato de la sede, no con «es».
  const sede = useSedeClock(token, locationId || undefined);
  const clock = sede.status === "ready" ? sede.clock : null;
  const minimumDateLabel = (day: string | null | undefined, instant: string) => {
    if (!clock) return NO_SEDE_FORMAT;
    return day ? clock.fmt.civilDate(day) : clock.fmt.date(new Date(instant), clock.timeZone);
  };
  const [age, setAge] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [data, setData] = useState<UnscheduledPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [booking, setBooking] = useState<UnscheduledPlan | null>(null);
  useEffect(() => {
    let cancelled = false;
    listLocations(token)
      .then((l) => {
        if (!cancelled) setLocations(l ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await listUnscheduledPlans(token, {
          locationId: locationId || undefined,
          olderThanDays: age,
          cursor,
        });
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            apiErrorMessage(
              err,
              "No pudimos cargar el tratamiento pendiente de agendar.",
            ),
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, locationId, age, cursor, reload]);
  function reset() {
    setCursor(undefined);
    setHistory([]);
  }
  return (
    <section
      aria-label="Tratamiento aceptado sin agendar"
      className="flex min-w-0 flex-col gap-5"
    >
      {sede.status === "error" ? (
        <SedeConfigError
          kind={sede.kind}
          variant="note"
          description={sede.message}
          onRetry={sede.retry}
          locationId={sede.locationId}
        />
      ) : null}
      <div>
        <h2 className="text-xl font-semibold text-ink">Aceptado sin agendar</h2>
        <p className="mt-2 max-w-[65ch] text-sm text-muted">
          Tratamiento aceptado que aún no tiene una cita futura. Agenda la
          siguiente visita y respeta el intervalo indicado.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Sede
          <select
            name="unscheduled-location"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-ink focus-visible:ring-2 focus-visible:ring-primary"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              reset();
            }}
          >
            <option value="">Todas las sedes permitidas</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Días desde la aceptación
          <select
            name="unscheduled-age"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-ink focus-visible:ring-2 focus-visible:ring-primary"
            value={age}
            onChange={(e) => {
              setAge(Number(e.target.value));
              reset();
            }}
          >
            {[0, 7, 15, 30, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Cualquier antigüedad" : `${n} días o más`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReload((k) => k + 1)}
        isEmpty={data?.items.length === 0}
        emptyTitle="No hay tratamiento aceptado pendiente de agendar en esta sede"
        emptyDescription="Los tratamientos aceptados aparecerán aquí mientras no tengan una cita futura enlazada."
      >
        <ul className="divide-y divide-hairline rounded-xl border border-border bg-surface">
          {data?.items.map((item) => (
            <li
              key={item.planId}
              className="grid min-w-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
            >
              <div className="min-w-0">
                <Link
                  href={`/patients/${item.patientId}?tab=plan&planId=${item.planId}`}
                  className="inline-flex min-h-11 items-center text-base font-semibold text-ink underline-offset-4 hover:underline"
                >
                  {item.patientName}
                </Link>
                {item.optionLabel ? (
                  <p className="text-sm text-muted">{item.optionLabel}</p>
                ) : null}
                <p className="mt-1 text-sm text-muted">
                  Visita {item.nextVisit}
                  {item.visitLabel ? ` · ${item.visitLabel}` : ""} ·{" "}
                  {item.itemCount} tratamientos pendientes
                </p>
                <p className="mt-1 text-sm text-muted">
                  Fecha mínima:{" "}
                  <time dateTime={item.minimumDate}>
                    {minimumDateLabel(item.minimumDay, item.minimumDate)}
                  </time>{" "}
                  · {item.daysSinceAccepted} días desde la aceptación
                </p>
              </div>
              <div className="flex items-baseline gap-2 lg:flex-col lg:items-end">
                <span className="font-semibold text-ink tabular-nums">
                  {sedeMoney(item.total, item.currency, clock?.fmt ?? null)}
                </span>
                <span className="text-sm text-muted">{item.currency}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  aria-label={`Agendar a ${item.patientName}`}
                  onClick={() => setBooking(item)}
                >
                  Agendar
                </Button>
                {item.patientWhatsApp ? (
                  <a
                    href={`https://wa.me/${item.patientWhatsApp}?text=${encodeURIComponent("Hola, te contactamos desde la clínica para coordinar tu próxima cita. ¿Qué horario te viene bien?")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp a ${item.patientName}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </AsyncSection>
      {data && (history.length > 0 || data.nextCursor) ? (
        <nav
          aria-label="Paginación de tratamiento pendiente"
          className="flex justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={loading || history.length === 0}
            onClick={() => {
              setCursor(history[history.length - 1]);
              setHistory((prev) => prev.slice(0, -1));
            }}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={loading || !data.nextCursor}
            onClick={() => {
              setHistory((prev) => [...prev, cursor]);
              setCursor(data.nextCursor ?? undefined);
            }}
          >
            Siguiente
          </Button>
        </nav>
      ) : null}
      {booking ? (
        <ScheduleVisitDialog
          token={token}
          patientId={booking.patientId}
          locationId={booking.locationId ?? undefined}
          visit={{
            number: booking.nextVisit,
            label: booking.visitLabel,
            minDaysAfterPrevious: 0,
            minimumDate: booking.minimumDate,
            minimumDay: booking.minimumDay,
            planItemIds: booking.planItemIds,
          }}
          onClose={() => setBooking(null)}
          onCreated={() => {
            setBooking(null);
            setReload((k) => k + 1);
          }}
        />
      ) : null}
    </section>
  );
}
