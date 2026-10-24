'use client';
import { useCallback, useEffect, useState } from 'react';
import { getPatientAttendance, type PatientAttendanceSummary } from '@/lib/cancellations/cancellation';

export interface PatientAttendanceState {
  /** `null` mientras se pide (o si falló). */
  data: PatientAttendanceSummary | null;
  /** No se pudo comprobar: se dice, con reintento (nunca parece «sin incidencias»). */
  failed: boolean;
  reload: () => void;
}

/** Resumen de asistencia de 12 meses del paciente para la cabecera de su ficha (DX-279). */
export function usePatientAttendance(token: string | null, patientId: string): PatientAttendanceState {
  const [data, setData] = useState<PatientAttendanceSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getPatientAttendance(token, patientId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  const reload = useCallback(() => {
    setFailed(false);
    setReloadKey((k) => k + 1);
  }, []);
  return { data, failed, reload };
}
