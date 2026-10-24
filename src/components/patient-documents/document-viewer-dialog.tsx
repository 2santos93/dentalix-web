'use client';
import { useCallback } from 'react';
import {
  getPatientDocumentUrl,
  isImageDocument,
  PATIENT_DOCUMENT_CATEGORY_LABELS,
  type PatientDocument,
} from '@/lib/patient-documents/patient-documents-api';
import { SignedFileViewerDialog } from '@/components/shared/signed-file-viewer-dialog';

interface DocumentViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  document: PatientDocument;
}

/** Visor de un documento de la ficha (DX-151). El padre lo monta con `key`. */
export function DocumentViewerDialog({ open, onOpenChange, token, document }: DocumentViewerDialogProps) {
  const { patientId, id } = document;
  const loadUrl = useCallback(() => getPatientDocumentUrl(token, patientId, id, 'inline'), [token, patientId, id]);
  return (
    <SignedFileViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      name={document.originalName}
      description={PATIENT_DOCUMENT_CATEGORY_LABELS[document.category]}
      image={isImageDocument(document)}
      loadUrl={loadUrl}
    />
  );
}
