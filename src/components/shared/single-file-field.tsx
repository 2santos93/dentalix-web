'use client';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Paperclip, RotateCw, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  prepareSingleFile,
  uploadSingleFile,
  validateSingleFile,
  type SingleFileRules,
  type SingleFileUploadRequest,
  type SingleFileUploadTicket,
} from '@/lib/files/upload-single-file';
import { HEIC_CONVERSION_ERROR } from '@/lib/patient-documents/heic';
import { formatFileSize } from '@/lib/patient-documents/patient-documents-api';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { RegionalFormat } from '@/lib/format/regional-format';

export const singleFileFieldCopy = {
  choose: 'Elegir archivo',
  chooseOther: 'Elegir otro',
  preparing: 'Preparando la foto…',
  uploading: 'Subiendo…',
  uploaded: 'Subido',
  cancel: 'Cancelar la subida',
  remove: 'Quitar el archivo',
  retry: 'Reintentar',
  progressLabel: (name: string) => `Subida de ${name}`,
  // Sin «Intenta de nuevo.»: el campo trae «Reintentar».
  uploadError: 'No pudimos subir el archivo.',
  storageBusy: 'El almacén de archivos no responde o hay muchas subidas en curso. Inténtalo de nuevo en unos minutos.',
};

export type SingleFileUploadState =
  | { status: 'idle' }
  | { status: 'preparing'; file: File }
  | { status: 'uploading'; file: File; progress: number }
  | { status: 'done'; file: File; uploadId: string }
  /** `file` null: no pasó la validación y no hay nada que reintentar. */
  | { status: 'error'; file: File | null; message: string };

export interface SingleFileUpload {
  state: SingleFileUploadState;
  select: (file: File) => void;
  retry?: () => void;
  clear: () => void;
  /** El `uploadId` cuando el fichero ya está en el almacén. */
  uploadId: string | undefined;
  /** Convirtiendo o subiendo: el formulario espera. */
  busy: boolean;
}

/**
 * La subida de UN fichero al elegirlo (validar → HEIC a JPG → autorización →
 * almacén), con progreso, cancelar y reintento. Quien llama entrega después
 * `uploadId` (el alta de un gasto, por ejemplo). `requestTicket` debe ser
 * estable (`useCallback`). Cancelar, quitar o desmontar abortan la subida.
 */
export function useSingleFileUpload(
  rules: SingleFileRules,
  requestTicket: (request: SingleFileUploadRequest) => Promise<SingleFileUploadTicket>,
): SingleFileUpload {
  const [state, setState] = useState<SingleFileUploadState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const select = useCallback(
    (original: File) => {
      controllerRef.current?.abort();
      const invalid = validateSingleFile(original, rules);
      if (invalid) {
        setState({ status: 'error', file: null, message: invalid });
        return;
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;
      setState({ status: 'preparing', file: original });
      void (async () => {
        let file: File;
        try {
          file = await prepareSingleFile(original);
        } catch {
          if (!signal.aborted) setState({ status: 'error', file: original, message: HEIC_CONVERSION_ERROR });
          return;
        }
        if (signal.aborted) return;
        setState({ status: 'uploading', file, progress: 0 });
        try {
          const uploadId = await uploadSingleFile(file, requestTicket, {
            signal,
            onProgress: (progress) =>
              setState((s) => (s.status === 'uploading' && s.file === file ? { ...s, progress } : s)),
          });
          if (!signal.aborted) setState({ status: 'done', file, uploadId });
        } catch (err) {
          if (signal.aborted) return;
          setState({
            status: 'error',
            file: original,
            message: apiErrorMessage(err, {
              fallback: singleFileFieldCopy.uploadError,
              byStatus: { 503: singleFileFieldCopy.storageBusy },
            }),
          });
        }
      })();
    },
    [rules, requestTicket],
  );

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: 'idle' });
  }, []);

  const failedFile = state.status === 'error' ? state.file : null;
  return {
    state,
    select,
    retry: failedFile ? () => select(failedFile) : undefined,
    clear,
    uploadId: state.status === 'done' ? state.uploadId : undefined,
    busy: state.status === 'preparing' || state.status === 'uploading',
  };
}

interface SingleFileFieldProps {
  id: string;
  label: string;
  hint?: string;
  /** El `accept` del selector. */
  accept: string;
  upload: SingleFileUpload;
  disabled?: boolean;
  /** Formato de la sede de la pantalla, para el tamaño del fichero; sin él, «—». */
  fmt: RegionalFormat | null;
  /**
   * El aviso que acompaña al «—» cuando no hay `fmt` (G1-B R11: nunca «—» sin
   * aviso), p. ej. `SedeConfigError kind="locale" variant="note"`. Se muestra
   * solo con un fichero elegido, que es cuando hay un tamaño que pintar.
   */
  formatNotice?: React.ReactNode;
}

/**
 * El campo de un fichero dentro de un formulario: el selector, y una vez
 * elegido su nombre, la barra de progreso y «Cancelar», «Quitar» o
 * «Reintentar». El error va junto al campo (escalón 4).
 */
export function SingleFileField({
  id,
  label,
  hint,
  accept,
  upload,
  disabled = false,
  fmt,
  formatNotice,
}: SingleFileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { state } = upload;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // El input de fichero va oculto; los botones dicen a qué campo sirven.
  const describedBy = [labelId, state.status === 'error' ? errorId : hint ? hintId : null].filter(Boolean).join(' ');
  const file = state.status === 'idle' ? null : state.file;
  const progress = state.status === 'uploading' ? state.progress : state.status === 'done' ? 1 : 0;

  function pick() {
    inputRef.current?.click();
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id={labelId} htmlFor={id}>
        {label}
      </Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-describedby={state.status === 'error' ? errorId : hint ? hintId : undefined}
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = '';
          if (chosen) upload.select(chosen);
        }}
      />

      {file ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
              <Paperclip aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{file.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted">
              {formatFileSize(file.size, fmt)}
              {state.status === 'done' ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 aria-hidden className="size-3.5" />
                  {singleFileFieldCopy.uploaded}
                </span>
              ) : null}
            </span>
          </div>
          {state.status === 'preparing' ? (
            <p className="text-xs text-muted">{singleFileFieldCopy.preparing}</p>
          ) : null}
          {state.status === 'uploading' || state.status === 'done' ? (
            <div
              role="progressbar"
              aria-label={singleFileFieldCopy.progressLabel(file.name)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none',
                  state.status === 'done' ? 'bg-success' : 'bg-primary',
                )}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {file && !fmt ? formatNotice : null}

      {state.status === 'error' ? (
        <InlineError id={errorId} className="text-xs">
          {state.message}
        </InlineError>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {state.status === 'idle' || (state.status === 'error' && !state.file) ? (
          <Button type="button" variant="secondary" size="sm" onClick={pick} disabled={disabled} aria-describedby={describedBy} className="max-sm:min-h-11">
            <Paperclip aria-hidden />
            {singleFileFieldCopy.choose}
          </Button>
        ) : null}
        {upload.busy ? (
          <Button type="button" variant="ghost" size="sm" onClick={upload.clear} className="max-sm:min-h-11">
            <X aria-hidden />
            {singleFileFieldCopy.cancel}
          </Button>
        ) : null}
        {state.status === 'error' && upload.retry ? (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={upload.retry} disabled={disabled} aria-describedby={describedBy} className="max-sm:min-h-11">
              <RotateCw aria-hidden />
              {singleFileFieldCopy.retry}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={pick} disabled={disabled} className="max-sm:min-h-11">
              {singleFileFieldCopy.chooseOther}
            </Button>
          </>
        ) : null}
        {state.status === 'done' || (state.status === 'error' && state.file) ? (
          <Button type="button" variant="ghost" size="sm" onClick={upload.clear} disabled={disabled} className="max-sm:min-h-11">
            <X aria-hidden />
            {singleFileFieldCopy.remove}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
