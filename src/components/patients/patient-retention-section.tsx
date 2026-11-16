'use client';
import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { RETENTION_REASON_MIN, type Patient, type RetentionExtension } from '@/lib/patients/patients-api';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { DATA_SECTION_CLASS } from './data-section';
import type { SedePainters } from '@/lib/locations/sede-stamp';

/** También la usan los modales de ADMIN (`patient-retention-dialogs`). */
export const retentionCopy = {
  sectionLabel: 'Retención de la historia clínica',
  sectionTitle: 'Retención',
  // Chip corto de la cabecera; la frase completa está en «Datos».
  chip: {
    until: (date: string) => `Retención hasta ${date}`,
    permanent: 'Retención permanente',
    expired: (date: string) => `Retención vencida el ${date}`,
  },
  until: (date: string) => `Historia en retención hasta ${date}`,
  permanent: 'Historia en retención permanente',
  expired: (date: string) => `Retención vencida el ${date}`,
  none: 'Sin atenciones clínicas: sin retención',
  // DX-330: el plazo es de la clínica (`clinicRetentionYears`), nunca un
  // número fijo. Sin él (una API anterior) no se pinta ninguna cifra.
  double: (years: number | undefined) =>
    years === undefined ? 'Plazo doble' : `Plazo doble (${2 * years} años)`,
  // La ayuda sigue al plazo vigente: con DOUBLE o PERMANENT, el plazo simple
  // contradiría la fecha del aviso.
  hint: {
    NONE: (years: number | undefined) =>
      `Se conserva ${years === undefined ? 'el plazo de la clínica' : `${years} años`} desde la última atención. Mientras dure, el paciente no se puede archivar.`,
    DOUBLE: (years: number | undefined) =>
      `Plazo doble: se conserva ${years === undefined ? 'el doble del plazo de la clínica' : `${2 * years} años`} desde la última atención. Mientras dure, el paciente no se puede archivar.`,
    PERMANENT: () => 'Se conserva sin fecha de fin: el paciente no se puede archivar.',
  } satisfies Record<RetentionExtension, (years: number | undefined) => string>,
  // La clínica redujo el plazo y esta historia ya estaba en retención: manda
  // la fecha que tenía.
  previousTermHint: (date: string) =>
    `Se conserva hasta el ${date} por el plazo anterior de la clínica. Mientras dure, el paciente no se puede archivar.`,
  suppressed: (date: string) => `Datos de contacto suprimidos el ${date}`,
  changeRetention: 'Cambiar retención',
  suppress: 'Supresión parcial',
  archive: 'Archivar paciente',
  retentionTitle: 'Retención extendida',
  retentionDescription:
    'Amplía el plazo de conservación de la historia clínica. Queda registrado quién lo cambió, cuándo y por qué.',
  retentionLabel: 'Plazo',
  options: {
    NONE: (years: number | undefined) =>
      years === undefined
        ? 'Plazo de la clínica desde la última atención'
        : `${years} años desde la última atención (plazo de la clínica)`,
    DOUBLE: (years: number | undefined) =>
      years === undefined ? 'Plazo doble' : `${2 * years} años (plazo doble)`,
    PERMANENT: () => 'Permanente (nunca se libera)',
  } satisfies Record<RetentionExtension, (years: number | undefined) => string>,
  reasonLabel: 'Motivo',
  reasonHint: `Mínimo ${RETENTION_REASON_MIN} caracteres. Queda en el registro.`,
  reasonTooShort: `El motivo debe tener al menos ${RETENTION_REASON_MIN} caracteres.`,
  saveRetention: 'Guardar retención',
  retentionError: 'No pudimos cambiar la retención.',
  suppressTitle: 'Supresión parcial de datos',
  suppressDescription:
    'Vacía teléfono, email, dirección, notas administrativas y contacto de emergencia, y retira la autorización de marketing. La historia clínica y los datos de identificación se conservan. No se puede deshacer.',
  confirmSuppress: 'Suprimir datos',
  suppressError: 'No pudimos hacer la supresión parcial.',
  archiveTitle: 'Archivar paciente',
  archiveDescription:
    'El paciente deja de aparecer en los listados. Su historia clínica se conserva. Si tiene citas programadas o confirmadas, cancélalas antes.',
  confirmArchive: 'Archivar',
  archiveError: 'No pudimos archivar al paciente.',
};
const copy = retentionCopy;

type Status =
  | { kind: 'until'; date: string }
  | { kind: 'permanent' }
  | { kind: 'expired'; date: string }
  | { kind: 'none' };

function statusOf(patient: Patient, stamp: SedePainters): Status {
  if (patient.retentionExtended === 'PERMANENT') return { kind: 'permanent' };
  if (!patient.retentionUntil) return { kind: 'none' };
  const date = stamp.civilDate(patient.retentionUntil);
  return patient.underRetention ? { kind: 'until', date } : { kind: 'expired', date };
}

/**
 * La ayuda de la retención, una sola para la sección y el chip de la cabecera
 * (DX-330): el plazo de la clínica, o el anterior si manda un suelo.
 */
export function retentionHint(patient: Patient, stamp: SedePainters): string {
  const extension = patient.retentionExtended ?? 'NONE';
  if (
    extension !== 'PERMANENT' &&
    patient.retentionFromPreviousTerm &&
    patient.retentionUntil
  ) {
    return copy.previousTermHint(stamp.civilDate(patient.retentionUntil));
  }
  return copy.hint[extension](patient.clinicRetentionYears);
}

function statusText(status: Status): string {
  switch (status.kind) {
    case 'until':
      return copy.until(status.date);
    case 'permanent':
      return copy.permanent;
    case 'expired':
      return copy.expired(status.date);
    case 'none':
      return copy.none;
  }
}

/** Las tres acciones de ADMIN, que viven en el menú «⋯» de la cabecera. */
export type RetentionDialog = 'retention' | 'suppress' | 'archive';

export const retentionActionLabels = {
  retention: copy.changeRetention,
  suppress: copy.suppress,
  archive: copy.archive,
} satisfies Record<RetentionDialog, string>;

/**
 * Chip de la cabecera: la retención es un estado normal y esperado, no un
 * riesgo — tono neutro, nunca ámbar junto a «Sin anamnesis» (critique-core §7).
 * `null` sin atenciones clínicas: no hay nada que decir en la cabecera.
 */
export function retentionChip(patient: Patient, stamp: SedePainters): { text: string; hint: string | null } | null {
  const status = statusOf(patient, stamp);
  const hint = patient.underRetention ? retentionHint(patient, stamp) : null;
  switch (status.kind) {
    case 'until':
      return { text: copy.chip.until(status.date), hint };
    case 'permanent':
      return { text: copy.chip.permanent, hint };
    case 'expired':
      return { text: copy.chip.expired(status.date), hint };
    case 'none':
      return null;
  }
}

/**
 * Retención de la HC en la pestaña «Datos» (DX-039): el aviso con la
 * fecha hasta la que se conserva, el plazo y la supresión parcial si la hubo.
 * Lo ven todos. Los controles (ADMIN) están en el menú «⋯» de la cabecera:
 * son acciones raras y delicadas, no van a la vista en cada pestaña.
 */
export function PatientRetentionSection({ patient, stamp }: { patient: Patient; stamp: SedePainters }) {
  const status = statusOf(patient, stamp);
  return (
    <section aria-label={copy.sectionLabel} className={DATA_SECTION_CLASS}>
      <SectionHeader as="h2" title={copy.sectionTitle} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <ShieldCheck aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="tnum">{statusText(status)}</span>
          {patient.retentionExtended === 'DOUBLE' ? (
            <Badge variant="neutral">{copy.double(patient.clinicRetentionYears)}</Badge>
          ) : null}
        </p>
        {patient.underRetention ? (
          <p className="text-sm text-muted">{retentionHint(patient, stamp)}</p>
        ) : null}
        {patient.partiallySuppressedAt ? (
          <p className="text-sm text-muted tnum">
            {copy.suppressed(stamp.date(patient.partiallySuppressedAt))}
          </p>
        ) : null}
      </div>
    </section>
  );
}
