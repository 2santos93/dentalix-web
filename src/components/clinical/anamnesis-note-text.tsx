'use client';
import { anamnesisNote, type MedicalAlertFlags } from '@/lib/clinical/medical-alerts';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSedeStamp } from '@/lib/locations/sede-stamp';

/**
 * El texto de la nota de anamnesis («Anamnesis caducada · última revisión
 * 01/09/2026») con el formato y la zona de la sede de la pantalla (DX-354b, E5).
 * Es un componente aparte para que el hook solo corra donde la nota se pinta
 * (el panel abierto del indicador), no en cada tarjeta de la agenda.
 */
export function AnamnesisNoteText({ flags }: { flags: MedicalAlertFlags }) {
  const token = useAuthStore((s) => s.accessToken) ?? '';
  const stamp = useSedeStamp(token);
  return <>{anamnesisNote(flags, stamp)}</>;
}
