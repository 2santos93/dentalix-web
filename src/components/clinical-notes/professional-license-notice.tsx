'use client';
import Link from 'next/link';
import { toast } from 'sonner';
import { Callout } from '@/components/ui/callout';
import type { ClinicalEntryWarning } from '@/lib/patients/clinical-api';

export const professionalLicenseCopy = {
  title: 'Vas a firmar sin registro profesional',
  body: 'La evolución se guardará sin tu número de registro profesional y no podrá añadirse después. Puedes guardarla igual.',
  editLink: 'Cargar mi registro en Personal',
  newTab: '(se abre en otra pestaña)',
  askAdmin: 'Pide a un administrador que lo cargue en tu ficha de Personal.',
  savedWithout: 'Evolución guardada sin registro profesional',
};

const copy = professionalLicenseCopy;

/** Cuánto se queda el aviso posterior: se lee con calma (como los de la agenda). */
const WARNING_DURATION_MS = 10_000;

interface ProfessionalLicenseNoticeProps {
  /** Quien puede editar Personal (ADMIN) recibe el enlace a su propia ficha. */
  canEditStaff: boolean;
  /** Usuario de la sesión; sin él no hay ficha a la que enlazar. */
  userId: string | null;
}

/**
 * DX-540: aviso ANTES de firmar una evolución sin registro profesional, cuando
 * la clínica lo tiene activado (lo decide la API en `GET
 * /clinical-entries/signing`). No bloquea: solo dice qué pasará y dónde se
 * carga el registro. El enlace abre otra pestaña para no perder lo escrito en
 * el modal. `role="status"`: está ahí al abrir, no responde a una acción.
 */
export function ProfessionalLicenseNotice({ canEditStaff, userId }: ProfessionalLicenseNoticeProps) {
  const editable = canEditStaff && userId !== null;
  return (
    <Callout tone="warning" title={copy.title}>
      <p>{copy.body}</p>
      {editable ? (
        <p className="mt-1">
          <Link
            href={`/staff/${userId}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${copy.editLink} ${copy.newTab}`}
            className="inline-flex min-h-11 items-center font-medium text-primary-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text sm:min-h-0"
          >
            {copy.editLink}
          </Link>
        </p>
      ) : (
        <p className="mt-1">{copy.askAdmin}</p>
      )}
    </Callout>
  );
}

/**
 * DX-540: avisos de la respuesta del alta (la evolución YA está guardada:
 * nada que deshacer). Toast de aviso con el texto de la API, como los de la
 * agenda (`announceAppointmentWarnings`).
 */
export function announceClinicalEntryWarnings(warnings: ClinicalEntryWarning[] | undefined): void {
  for (const w of warnings ?? []) {
    if (w.code === 'PROFESSIONAL_LICENSE_MISSING') {
      toast.warning(copy.savedWithout, { description: w.message, duration: WARNING_DURATION_MS });
    }
  }
}
