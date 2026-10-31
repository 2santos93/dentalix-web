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
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { AsyncSection } from "@/components/shared/async-section";
import { InlineError } from "@/components/errors/inline-error";
import { apiErrorMessage } from "@/lib/api/error-message";
import { SedeConfigError } from "@/components/locations/sede-config-error";
import { formatMinute } from "@/lib/appointments/day-grid";
import { civilDateLabel } from "@/lib/format/date";
import { sedeTimeRange, useSedeClock } from "@/lib/locations/sede-clock";
import { addCivilDays, wallDay, wallMinuteOfDay } from "@/lib/time/wall-clock";

/**
 * «Agendar visita»: los huecos, la fecha mínima y la hora que se propone
 * van en el reloj de la sede de la visita (DX-378), nunca en el del navegador.
 */
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
  const sede = useSedeClock(token, site || undefined);
  const clock = sede.status === "ready" ? sede.clock : null;
  const minimumDay =
    visit.minimumDay ?? (clock ? wallDay(visit.minimumDate, clock.timeZone) : null);
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
    if (!minimumDay) return;
    const version = ++searchVersion.current;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await findOpenings(token, {
        providerId: provider,
        locationId: site,
        from: minimumDay,
        to: addCivilDays(minimumDay, 14),
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
  /** "HH:mm" del reloj de la sede: el valor de la hora del formulario. */
  const inputTime = (value: string, timeZone: string) =>
    formatMinute(wallMinuteOfDay(value, timeZone));
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
            {minimumDay && clock ? clock.fmt.civilDate(minimumDay) : "—"}. Los tratamientos seleccionados quedarán enlazados a la
            cita.
          </DialogDescription>
        </DialogHeader>
        {sede.status === "error" ? (
          <SedeConfigError
            kind={sede.kind}
            description={sede.message}
            onRetry={sede.retry}
            locationId={sede.locationId}
          />
        ) : (
        <AsyncSection
          loading={loading || !clock || !minimumDay}
          error={error}
          onRetry={() => {
            setLoading(true);
            setReload((k) => k + 1);
          }}
        >
          {patient && clock && minimumDay ? (
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="t-label mb-1 text-ink">
                  Tratamientos de la visita
                </legend>
                {visit.planItemIds.map((id, index) => (
                  <Checkbox
                    key={id}
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
                    label={`Tratamiento ${index + 1} de la visita ${visit.number}`}
                  />
                ))}
              </fieldset>
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  Profesional para buscar hueco
                  <NativeSelect
                    value={provider}
                    onChange={(e) => changeProvider(e.target.value)}
                  >
                    {staff.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        {s.fullName}
                      </option>
                    ))}
                  </NativeSelect>
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
                          {civilDateLabel(wallDay(o.start, clock.timeZone), {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {sedeTimeRange(o.start, o.end, clock)}
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
                    slot ? wallDay(slot.start, clock.timeZone) : minimumDay
                  }
                  minimumDate={minimumDay}
                  defaultProviderId={slot ? provider : undefined}
                  defaultStartTime={slot ? inputTime(slot.start, clock.timeZone) : undefined}
                  defaultEndTime={slot ? inputTime(slot.end, clock.timeZone) : undefined}
                  planItemIds={selected}
                  locationId={site}
                  onCreated={onCreated}
                />
              )}
            </div>
          ) : null}
        </AsyncSection>
        )}
      </DialogContent>
    </Dialog>
  );
}
