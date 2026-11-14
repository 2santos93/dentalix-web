'use client';
import Link from 'next/link';
import * as React from 'react';
import { Check, Copy, Download, ScanLine } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SectionError } from '@/components/errors/section-error';
import type { RowAction } from '@/components/shared/row-actions';
import { apiErrorMessage } from '@/lib/api/error-message';
import { saveBlob } from '@/lib/files/save-blob';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  canExportImaging,
  fetchPatientImagingExport,
  imagingExportFileName,
} from '@/lib/patients/patients-api';
import { cn } from '@/lib/utils';

/** Ruta de la página de ayuda (DX-484). */
export const IMAGING_HELP_HREF = '/ayuda/software-de-imagen';

// Copy as constants (i18n-ready).
export const imagingExportCopy = {
  action: 'Datos para el software de imagen',
  title: 'Datos para el software de imagen',
  description: 'Con estos datos das de alta al paciente en el software de imagen de la clínica.',
  loading: 'Preparando los datos del paciente…',
  errorTitle: 'No se pudieron preparar los datos',
  errorFallback: 'La API no devolvió los datos del paciente.',
  textLabel: 'Datos del paciente',
  copy: 'Copiar',
  copied: 'Datos copiados',
  copyFailed: 'No se pudo copiar: selecciona el texto y cópialo a mano.',
  download: 'Descargar .txt',
  note: 'Dentalix no se conecta con el software de imagen: da de alta al paciente allí con este código.',
  helpLink: 'Cómo darlo de alta en Sidexis, Romexis, Dexis o CS Imaging',
};

/**
 * La entrada del menú «⋯» de la ficha, solo para los roles clínicos (DENTIST,
 * ASSISTANT, ADMIN: los mismos que la API). `null` para recepción o sin rol.
 */
export function imagingExportMenuAction(
  role: ClinicRole | null,
  onSelect: () => void,
): RowAction | null {
  if (!canExportImaging(role)) return null;
  return {
    label: imagingExportCopy.action,
    icon: <ScanLine aria-hidden />,
    onSelect,
  };
}

interface ImagingExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  patientCode: string;
}

/**
 * DX-484: los datos del paciente para darlo de alta A MANO en el software de
 * imagen (Dentalix no se integra con ninguno). El cuerpo se monta solo
 * abierto: cada apertura pide el .txt UNA vez (cada petición es un EXPORT
 * auditado en la API) y al cerrar se descarta.
 */
export function ImagingExportDialog({ open, onOpenChange, token, patientId, patientCode }: ImagingExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{imagingExportCopy.title}</DialogTitle>
            <DialogDescription>{imagingExportCopy.description}</DialogDescription>
          </DialogHeader>
          <ImagingExportBody token={token} patientId={patientId} patientCode={patientCode} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; text: string }
  | { status: 'error'; message: string };

function ImagingExportBody({ token, patientId, patientCode }: Omit<ImagingExportDialogProps, 'open' | 'onOpenChange'>) {
  const [load, setLoad] = React.useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  // El intento ya pedido: el doble efecto de StrictMode o un token renovado
  // no repiten la petición (cada una se audita como una exportación).
  const requested = React.useRef<number | null>(null);
  const { state: copyState, copy: copyText } = useCopyToClipboard();
  const labelId = React.useId();
  const statusId = React.useId();

  React.useEffect(() => {
    if (requested.current === attempt) return;
    requested.current = attempt;
    fetchPatientImagingExport(token, patientId).then(
      (text) => {
        if (requested.current === attempt) setLoad({ status: 'ready', text });
      },
      (err: unknown) => {
        if (requested.current === attempt) {
          setLoad({ status: 'error', message: apiErrorMessage(err, imagingExportCopy.errorFallback) });
        }
      },
    );
  }, [attempt, token, patientId]);

  function retry() {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }

  function download(text: string) {
    saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), imagingExportFileName(patientCode));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {load.status === 'loading' ? (
        <p role="status" className="text-sm text-muted">
          {imagingExportCopy.loading}
        </p>
      ) : null}
      {load.status === 'error' ? (
        <SectionError
          title={imagingExportCopy.errorTitle}
          description={load.message}
          onRetry={retry}
          className="py-10"
        />
      ) : null}
      {load.status === 'ready' ? (
        <>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p id={labelId} className="t-label text-ink">
              {imagingExportCopy.textLabel}
            </p>
            {/* Solo lectura y seleccionable; se parte en vez de ensanchar el diálogo a 390 px. */}
            <pre
              aria-labelledby={labelId}
              tabIndex={0}
              data-testid="imaging-export-text"
              className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-sunken p-3 font-mono text-xs leading-5 text-ink select-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
            >
              {load.text}
            </pre>
            <p
              id={statusId}
              role="status"
              aria-live="polite"
              className={cn('text-xs', copyState === 'failed' ? 'text-danger-text' : 'sr-only')}
            >
              {copyState === 'copied'
                ? imagingExportCopy.copied
                : copyState === 'failed'
                  ? imagingExportCopy.copyFailed
                  : ''}
            </p>
          </div>
          <p className="text-sm text-muted">{imagingExportCopy.note}</p>
          <Link
            href={IMAGING_HELP_HREF}
            className="self-start rounded-sm text-sm font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
          >
            {imagingExportCopy.helpLink}
          </Link>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => download(load.text)} className="max-sm:min-h-11">
              <Download aria-hidden /> {imagingExportCopy.download}
            </Button>
            <Button
              type="button"
              aria-describedby={copyState === 'failed' ? statusId : undefined}
              onClick={() => void copyText(load.text)}
              className="max-sm:min-h-11"
            >
              {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {imagingExportCopy.copy}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </div>
  );
}
