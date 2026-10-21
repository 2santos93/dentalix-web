'use client';
import { useEffect, useState } from 'react';
import { ClipboardClock, ClipboardX, Pill, TriangleAlert } from 'lucide-react';
import {
  MEDICAL_ALERTS_TITLE,
  PREMEDICATION_HINT,
  PREMEDICATION_LABEL,
  anamnesisNote,
  getPatientMedicalAlerts,
  medicalAlertLines,
  medicalAlertSeverity,
  type MedicalAlertFlags,
} from '@/lib/clinical/medical-alerts';
import { FieldError } from '@/components/errors/field-error';

const copy = {
  loading: 'Comprobando alertas médicas…',
  loadError: 'Alertas sin comprobar',
};

/**
 * Bloque de alertas médicas de una cita (DX-247): en el detalle al abrirla y en
 * el formulario al crearla. «Requiere premedicación» va primero y destacado;
 * luego las alertas (etiquetas del banner de la ficha) y la anamnesis caducada
 * o ausente. Nada si está al día y sin alertas.
 */
export function AppointmentMedicalAlerts({ flags }: { flags: MedicalAlertFlags | null | undefined }) {
  if (!flags || !medicalAlertSeverity(flags)) return null;
  const lines = medicalAlertLines(flags);
  const note = anamnesisNote(flags);
  return (
    <div data-testid="appointment-medical-alerts" className="flex flex-col gap-2">
      {flags.requiresPremedication ? (
        <div
          role="alert"
          data-testid="premedication-notice"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger"
        >
          <Pill aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold">{PREMEDICATION_LABEL}</span>
            <span className="text-sm">{PREMEDICATION_HINT}</span>
          </div>
        </div>
      ) : null}
      {lines.length > 0 ? (
        <div className="rounded-lg border border-danger/30 bg-surface px-3 py-2 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-danger">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {MEDICAL_ALERTS_TITLE}
          </p>
          <ul className="mt-1 list-inside list-disc text-ink">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? (
        <p className="flex items-center gap-1.5 text-sm text-warning">
          {flags.anamnesisStatus === 'MISSING' ? (
            <ClipboardX aria-hidden className="size-4 shrink-0" />
          ) : (
            <ClipboardClock aria-hidden className="size-4 shrink-0" />
          )}
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Las alertas del paciente elegido en «Nueva cita» (DX-247): las pide a la API
 * (`GET /patients/:id/medical-alerts`, los cuatro roles de agenda) y avisa de
 * «Requiere premedicación» antes de agendar. Si no se pudieron comprobar lo
 * dice, con reintento: no saber nunca se pinta como «sin alertas».
 */
export function PatientMedicalAlertsNotice({ token, patientId }: { token: string; patientId: string }) {
  const [flags, setFlags] = useState<MedicalAlertFlags | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPatientMedicalAlerts(token, patientId)
      .then((res) => {
        if (cancelled) return;
        setFlags(res);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  if (failed) {
    return (
      <FieldError
        label={copy.loadError}
        onRetry={() => {
          setFailed(false);
          setReloadKey((k) => k + 1);
        }}
        className="w-full"
      />
    );
  }
  if (!flags) {
    return (
      <p role="status" className="text-xs text-muted">
        {copy.loading}
      </p>
    );
  }
  return <AppointmentMedicalAlerts flags={flags} />;
}
