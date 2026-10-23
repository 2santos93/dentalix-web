"use client";
import { useEffect, useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  getPatientOptOutWarnings,
  type PatientOptOutMatchWarning,
} from "@/lib/patients/communication-api";
import { formatDate } from "@/lib/format/date";
import { SectionError } from "@/components/errors/section-error";

const copy = {
  loading: "Cargando avisos",
  error: "No pudimos cargar los avisos de baja por mensaje.",
  title: "Baja por mensaje sin aplicar",
  explanation:
    "La solicitud de baja coincidió con varias fichas. No se desactivaron los recordatorios. Verifica el móvil y la solicitud con el paciente antes de cambiar sus preferencias.",
  counts: (count: number, max: number) =>
    `${count} pacientes coincidentes · máximo ${max}`,
};

type State = { token: string; patientId: string } & (
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; warnings: PatientOptOutMatchWarning[] }
);

/** Solo se monta para recepción/ADMIN dentro del bloque Comunicaciones. */
export function PatientOptOutWarnings({
  token,
  patientId,
}: {
  token: string;
  patientId: string;
}) {
  const headingId = useId();
  const [state, setState] = useState<State>({
    token,
    patientId,
    kind: "loading",
  });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getPatientOptOutWarnings(token, patientId)
      .then((warnings) => {
        if (!cancelled) setState({ token, patientId, kind: "ready", warnings });
      })
      .catch(() => {
        if (!cancelled) setState({ token, patientId, kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  if (
    state.token !== token ||
    state.patientId !== patientId ||
    state.kind === "loading"
  )
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  if (state.kind === "error")
    return (
      <SectionError
        description={copy.error}
        className="py-6"
        onRetry={() => {
          setState({ token, patientId, kind: "loading" });
          setReloadKey((key) => key + 1);
        }}
      />
    );
  if (!state.warnings.length) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3 border-t border-border pt-4"
    >
      <h4
        id={headingId}
        className="flex items-start gap-2 text-sm font-semibold text-ink"
      >
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-warning"
        />
        {copy.title}
      </h4>
      <p className="text-sm text-muted">{copy.explanation}</p>
      <ul aria-label={copy.title} className="divide-y divide-border text-sm">
        {state.warnings.map((warning) => (
          <li
            key={warning.id}
            className="flex flex-wrap gap-x-2 gap-y-1 py-2 tabular-nums"
          >
            <time dateTime={warning.createdAt} className="text-muted">
              {formatDate(warning.createdAt)}
            </time>
            <span className="text-ink">
              {copy.counts(warning.matchCount, warning.maxMatches)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
