"use client";
import * as React from "react";
import { useEffect, useState, useRef } from "react";
import { getPatient, type Patient } from "@/lib/patients/patients-api";
import { listStaff, type StaffMember } from "@/lib/appointments/staff-api";
import { listLocations } from "@/lib/locations/locations-api";
import { getActiveLocationId } from "@/lib/locations/location-store";
import { findOpenings, type Opening } from "@/lib/appointments/waitlist-api";
import type { PlanVisit } from "@/lib/treatment-plans/plan-visits-api";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AsyncSection } from "@/components/shared/async-section";
import { InlineError } from "@/components/errors/inline-error";
import { apiErrorMessage } from "@/lib/api/error-message";
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function ScheduleVisitDialog({
  token,
  patientId,
  locationId,
  visit,
  onClose,
  onCreated,
}: {
  token: string;
  patientId: string;
  locationId?: string;
  visit: PlanVisit;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [site, setSite] = useState(locationId ?? getActiveLocationId() ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(visit.planItemIds);
  const [provider, setProvider] = useState("");
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchVersion = useRef(0);
  const [slot, setSlot] = useState<Opening | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const minimumDay = visit.minimumDay ?? localDay(new Date(visit.minimumDate));
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getPatient(token, patientId),
      listStaff(token),
      listLocations(token),
    ])
      .then(([p, providers, locations]) => {
        if (cancelled) return;
        setPatient(p);
        const attending = providers.filter(
          (p) =>
            (p.role === "DENTIST" || p.role === "ADMIN") &&
            (p.locationIds === null ||
              p.locationIds.includes(site || locations[0]?.id || "")),
        );
        setStaff(attending);
        setProvider((previous) =>
          attending.some((p) => p.userId === previous)
            ? previous
            : (attending[0]?.userId ?? ""),
        );
        if (!site) setSite(locations[0]?.id ?? "");
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar los datos para agendar.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reload, site]);
  function changeProvider(value: string) {
    searchVersion.current += 1;
    setProvider(value);
    setOpenings(null);
    setSlot(null);
    setSearchError(null);
    setSearching(false);
  }
  async function search() {
    const version = ++searchVersion.current;
    setSearching(true);
    setSearchError(null);
    const to = new Date(`${minimumDay}T12:00:00`);
    to.setDate(to.getDate() + 14);
    try {
      const result = await findOpenings(token, {
        providerId: provider,
        locationId: site,
        from: minimumDay,
        to: localDay(to),
        durationMinutes: 30,
        patientId,
      });
      if (version === searchVersion.current) setOpenings(result.openings);
    } catch (err) {
      if (version === searchVersion.current)
        setSearchError(
          apiErrorMessage(err, "No pudimos buscar huecos. Intenta de nuevo."),
        );
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }
  const time = (value: string) =>
    new Date(value).toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 [&_select]:min-h-11">
        <DialogHeader>
          <DialogTitle>Agendar visita {visit.number}</DialogTitle>
          <DialogDescription>
            {visit.label ? `${visit.label}. ` : ""}Fecha mínima sugerida:{" "}
            {minimumDay}. Los tratamientos seleccionados quedarán enlazados a la
            cita.
          </DialogDescription>
        </DialogHeader>
        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => {
            setLoading(true);
            setReload((k) => k + 1);
          }}
        >
          {patient ? (
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium text-ink">
                  Tratamientos de la visita
                </legend>
                {visit.planItemIds.map((id, index) => (
                  <label
                    key={id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      name="planItemIds"
                      value={id}
                      checked={selected.includes(id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, id]
                            : prev.filter((i) => i !== id),
                        )
                      }
                      className="size-5 accent-primary"
                    />
                    Tratamiento {index + 1} de la visita {visit.number}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  Profesional para buscar hueco
                  <select
                    className="min-h-11 rounded-lg border border-border bg-surface px-3 text-ink"
                    value={provider}
                    onChange={(e) => changeProvider(e.target.value)}
                  >
                    {staff.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={searching || !site || !provider}
                  onClick={() => void search()}
                >
                  {searching ? "Buscando…" : "Buscar hueco"}
                </Button>
                {searchError ? <InlineError>{searchError}</InlineError> : null}
                {openings ? (
                  <div
                    role="region"
                    aria-label="Huecos disponibles"
                    className="flex max-h-48 flex-col gap-2 overflow-y-auto"
                  >
                    {openings.length === 0 ? (
                      <p className="text-sm text-muted">
                        No hay huecos disponibles en las próximas dos semanas
                        desde la fecha mínima.
                      </p>
                    ) : (
                      openings.slice(0, 20).map((o) => (
                        <Button
                          key={o.start}
                          type="button"
                          variant="ghost"
                          className="min-h-11 justify-start"
                          onClick={() => setSlot(o)}
                        >
                          {localDay(new Date(o.start))} · {time(o.start)}–
                          {time(o.end)}
                        </Button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              {selected.length === 0 ? (
                <p role="status" className="text-sm text-muted">
                  Selecciona al menos un tratamiento para enlazarlo.
                </p>
              ) : (
                <AppointmentForm
                  key={slot?.start ?? "manual"}
                  token={token}
                  defaultPatient={patient}
                  defaultReason={`Visita ${visit.number}${visit.label ? " · " + visit.label : ""}`}
                  defaultDate={
                    slot ? localDay(new Date(slot.start)) : minimumDay
                  }
                  minimumDate={minimumDay}
                  defaultProviderId={slot ? provider : undefined}
                  defaultStartTime={slot ? time(slot.start) : undefined}
                  defaultEndTime={slot ? time(slot.end) : undefined}
                  planItemIds={selected}
                  locationId={site}
                  onCreated={onCreated}
                />
              )}
            </div>
          ) : null}
        </AsyncSection>
      </DialogContent>
    </Dialog>
  );
}
