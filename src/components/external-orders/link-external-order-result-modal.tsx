'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { FileSearch, Paperclip } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { linkExternalOrderResult, type ExternalOrder } from '@/lib/external-orders/external-orders-api';
import {
  listPatientDocuments,
  PATIENT_DOCUMENT_ACCEPT,
  PATIENT_DOCUMENT_CATEGORY_LABELS,
  patientDocumentFileCopy,
  uploadPatientDocument,
  validatePatientDocumentFile,
  type PatientDocument,
  type PatientDocumentCategory,
} from '@/lib/patient-documents/patient-documents-api';
import { convertHeicToJpeg, isHeicFile } from '@/lib/patient-documents/heic';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { EmptyState } from '@/components/shared/empty-state';
import { FormModal } from '@/components/shared/form-modal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioCard, RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';

/** Lo que se sube como resultado: una radiografía o un informe. */
export const RESULT_UPLOAD_CATEGORIES = ['XRAY', 'REPORT'] as const satisfies readonly PatientDocumentCategory[];
type ResultCategory = (typeof RESULT_UPLOAD_CATEGORIES)[number];

export const linkExternalOrderResultCopy = {
  title: 'Ligar resultado',
  description: (number: string) =>
    `Orden nº ${number}. Liga el estudio o el informe que llegó del centro: la orden pasa a «Resultado recibido» y sale de «Órdenes sin resultado».`,
  modeLabel: 'De dónde sale el resultado',
  modeExisting: 'Elegir un documento',
  modeUpload: 'Subir uno nuevo',
  loading: 'Cargando los documentos del paciente',
  loadError: 'No pudimos cargar los documentos del paciente.',
  noDocuments: 'El paciente no tiene documentos vigentes.',
  noDocumentsHint: 'Sube el resultado desde aquí con «Subir uno nuevo».',
  documentLegend: 'Documento del paciente',
  documentHint: 'Los más recientes primero; los anulados no aparecen.',
  documentMeta: (category: string, when: string) => `${category} · subido el ${when}`,
  documentRequired: 'Elige el documento del resultado.',
  fileLabel: 'Archivo',
  choose: 'Elegir archivo',
  chooseOther: 'Elegir otro',
  fileRequired: 'Elige el archivo del resultado.',
  categoryLegend: 'Qué es',
  submit: 'Ligar resultado',
  uploading: 'Subiendo el archivo…',
  genericError: 'No pudimos ligar el resultado. Intenta de nuevo.',
  uploadedNotLinked:
    'El archivo quedó en «Documentos», pero no pudimos ligarlo a la orden. Elígelo en «Elegir un documento» e intenta de nuevo.',
};

const copy = linkExternalOrderResultCopy;

interface LinkExternalOrderResultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  order: ExternalOrder;
  onLinked: (order: ExternalOrder) => void;
}

/**
 * «Ligar resultado» (DX-572, los cuatro roles: recepción suele subir la
 * radiografía): elegir un documento vigente del paciente o subir uno nuevo
 * (Radiografía o Informe) con la subida de Documentos (DX-151) y ligarlo
 * después. Un fallo del envío (409 orden anulada o ya con resultado, documento
 * anulado) es del formulario (escalón 4). Si la subida llegó pero el ligado
 * falló, lo dice: el archivo ya está en Documentos y se elige en la otra vista.
 */
export function LinkExternalOrderResultModal({
  open,
  onOpenChange,
  token,
  patientId,
  order,
  onLinked,
}: LinkExternalOrderResultModalProps) {
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'existing' | 'upload'>('existing');
  const [documents, setDocuments] = useState<PatientDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [category, setCategory] = useState<ResultCategory>('XRAY');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = (documents ?? []).filter((d) => d.voidedAt === null);
  const stamp = useSedeStamp(
    token,
    live.map((d) => d.locationId),
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listPatientDocuments(token, patientId)
      .then((list) => {
        if (cancelled) return;
        setDocuments(list);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, reloadKey]);

  function chooseFile(chosen: File) {
    const invalid = validatePatientDocumentFile(chosen);
    setFile(invalid ? null : chosen);
    setFileError(invalid);
    setError(null);
  }

  async function submit() {
    setError(null);
    if (mode === 'existing') {
      if (!documentId) {
        setDocumentError(copy.documentRequired);
        return;
      }
      setSubmitting(true);
      try {
        const linked = await linkExternalOrderResult(token, order.id, documentId);
        onOpenChange(false);
        onLinked(linked);
      } catch (err) {
        setError(apiErrorMessage(err, copy.genericError));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!file) {
      setFileError(copy.fileRequired);
      return;
    }
    setSubmitting(true);
    setUploading(true);
    let uploaded: PatientDocument | null = null;
    try {
      const ready = isHeicFile(file) ? await convertHeicToJpeg(file) : file;
      uploaded = await uploadPatientDocument(token, patientId, { file: ready, category });
    } catch (err) {
      setUploading(false);
      setSubmitting(false);
      setError(apiErrorMessage(err, copy.genericError));
      return;
    }
    setUploading(false);
    try {
      const linked = await linkExternalOrderResult(token, order.id, uploaded.id);
      onOpenChange(false);
      onLinked(linked);
    } catch {
      // El archivo ya está en Documentos: se ofrece en la otra vista, elegido.
      setDocuments((prev) => (prev ? [uploaded!, ...prev.filter((d) => d.id !== uploaded!.id)] : [uploaded!]));
      setDocumentId(uploaded.id);
      setFile(null);
      setMode('existing');
      setError(copy.uploadedNotLinked);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  let existingBody: React.ReactNode;
  if (loadError) {
    existingBody = (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  } else if (documents === null) {
    existingBody = (
      <div role="status" aria-label={copy.loading} className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (live.length === 0) {
    existingBody = (
      <EmptyState
        role="status"
        icon={<FileSearch aria-hidden />}
        title={copy.noDocuments}
        description={copy.noDocumentsHint}
      />
    );
  } else {
    existingBody = (
      <div className="flex flex-col gap-3">
        <SedeStampNote stamp={stamp} />
        <RadioGroup
          id={`${ids}-document`}
          legend={copy.documentLegend}
          hint={copy.documentHint}
          value={documentId ?? undefined}
          onValueChange={(value) => {
            setDocumentId(value);
            setDocumentError(null);
            setError(null);
          }}
          error={documentError}
          disabled={submitting}
          optionsClassName="flex max-h-72 flex-col gap-2 overflow-y-auto overscroll-contain p-0.5"
        >
          {live.map((doc) => (
            <RadioCard
              key={doc.id}
              value={doc.id}
              title={<span className="[overflow-wrap:anywhere]">{doc.originalName}</span>}
              description={
                <span className="t-data">
                  {copy.documentMeta(
                    PATIENT_DOCUMENT_CATEGORY_LABELS[doc.category],
                    stamp.date(doc.uploadedAt, doc.locationId),
                  )}
                </span>
              }
            />
          ))}
        </RadioGroup>
      </div>
    );
  }

  const uploadBody = (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${ids}-file`}>{copy.fileLabel}</Label>
        <input
          ref={fileRef}
          id={`${ids}-file`}
          type="file"
          accept={PATIENT_DOCUMENT_ACCEPT}
          disabled={submitting}
          className="sr-only"
          tabIndex={-1}
          aria-describedby={`${ids}-file-hint`}
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = '';
            if (chosen) chooseFile(chosen);
          }}
        />
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={submitting}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip aria-hidden />
            {file ? copy.chooseOther : copy.choose}
          </Button>
          {file ? <span className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{file.name}</span> : null}
        </div>
        <p id={`${ids}-file-hint`} className="text-xs text-muted">
          {patientDocumentFileCopy.allowed}
        </p>
        {fileError ? <InlineError>{fileError}</InlineError> : null}
      </div>
      <RadioGroup
        id={`${ids}-category`}
        legend={copy.categoryLegend}
        value={category}
        onValueChange={(value) => setCategory(value as ResultCategory)}
        disabled={submitting}
      >
        {RESULT_UPLOAD_CATEGORIES.map((c) => (
          <RadioOption key={c} value={c} label={PATIENT_DOCUMENT_CATEGORY_LABELS[c]} />
        ))}
      </RadioGroup>
      {uploading ? (
        <p role="status" className="text-sm text-muted">
          {copy.uploading}
        </p>
      ) : null}
    </div>
  );

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(order.numberLabel)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      touchTargets
      ownValidation
    >
      <div className="flex flex-col gap-4">
        <span id={`${ids}-mode`} className="text-sm font-medium text-ink">
          {copy.modeLabel}
        </span>
        <SegmentedControl
          aria-labelledby={`${ids}-mode`}
          value={mode}
          onValueChange={(value) => {
            setMode(value);
            setError(null);
          }}
          options={[
            { value: 'existing', label: copy.modeExisting },
            { value: 'upload', label: copy.modeUpload },
          ]}
          fullWidthOnMobile
          disabled={submitting}
        />
        {mode === 'existing' ? existingBody : uploadBody}
      </div>
    </FormModal>
  );
}
