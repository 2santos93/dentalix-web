import type { components } from '@/lib/api/schema';

// DX-285: la marca «Ortodoncia: saldo vencido» de la cita y de «En clínica».
// Fichero aparte y ligero: lo cargan la agenda y el panel sin el resto de la
// ortodoncia.
export type OrthoBalanceFlag = components['schemas']['OrthoBalanceFlagDto'];

/** Texto de la marca; `null` sin saldo vencido. La API no manda el importe. */
export function orthoOverdueChipText(flag: OrthoBalanceFlag | null | undefined): string | null {
  if (!flag?.hasOverdue) return null;
  return flag.overdueDays !== null && flag.overdueDays !== undefined
    ? `Ortodoncia: saldo vencido · ${flag.overdueDays} días`
    : 'Ortodoncia: saldo vencido';
}
