'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Download, Eye, FileText, Upload } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import { isFdiToothNumber } from '@/lib/odontogram/fdi';
import { startDownload } from '@/lib/patient-documents/download';
import { createLimiter } from '@/lib/patient-documents/limit';
import { convertHeicToJpeg, HEIC_CONVERSION_ERROR, isHeicFile } from '@/lib/patient-documents/heic';
import {
  canUploadPatientDocuments,
  canVoidPatientDocument,
  formatFileSize,
  getPatientDocumentUrl,
  listPatientDocuments,
  PATIENT_DOCUMENT_ACCEPT,
  PATIENT_DOCUMENT_CATEGORIES,
  PATIENT_DOCUMENT_CATEGORY_LABELS,
  patientDocumentFileCopy,
  uploadPatientDocument,
  validatePatientDocumentFile,
  type PatientDocument,
  type PatientDocumentCategory,
} from '@/lib/patient-documents/patient-documents-api';
import { notifyError } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { DocumentViewerDialog } from './document-viewer-dialog';
import { ToothChipsInput } from './tooth-chips-input';
import { VoidDocumentModal } from './void-document-modal';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';

const copy = {
  heading: 'Documentos',
  support:
    'Radiografías, fotos, remisiones, consentimientos firmados en papel e informes del paciente. Un documento subido no se edita ni se borra: se anula con motivo.',
  dropTitle: 'Arrastra aquí los archivos',
  dropOr: 'o',
  choose: 'Elegir archivos',
  inputLabel: 'Archivos para subir',
  dropActive: 'Suelta para añadirlos a la cola',
  queueHeading: 'Por subir',
  queueLabel: 'Archivos por subir',
  uploadAll: (n: number) => (n === 1 ? 'Subir 1 archivo' : `Subir ${n} archivos`),
  clearDone: 'Quitar los subidos',
  category: 'Categoría',
  teeth: 'Dientes (opcional)',
  clinicalDate: 'Fecha clínica (opcional)',
  notes: 'Notas (opcional)',
  upload: 'Subir',
  remove: 'Quitar',
  retry: 'Reintentar',
  cancel: 'Cancelar',
  uploaded: 'Subido',
  failed: 'Error',
  converting: 'Convirtiendo la foto HEIC a JPG…',
  waiting: 'En espera…',
  announceDone: (name: string) => `${name} subido`,
  announceError: (name: string) => `${name}: error`,
  uploadFailedToast: (name: string, reason: string) => `No se subió «${name}». ${reason}`,
  fixTeeth: 'Corrige los dientes antes de subir.',
  progressLabel: (name: string) => `Progreso de subida de ${name}`,
  uploadError: 'No pudimos subir el archivo.',
  storageBusy: 'El almacén de archivos no responde o hay muchas subidas en curso. Inténtalo de nuevo en unos minutos.',
  fileFor: (name: string) => ` ${name}`,
  filtersLabel: 'Filtrar documentos',
  allCategories: 'Todas las categorías',
  tooth: 'Diente',
  allTeeth: 'Todos los dientes',
  loading: 'Cargando documentos',
  loadError: 'No pudimos cargar los documentos.',
  empty: 'Sin documentos',
  emptyHint: 'Sube radiografías, fotos, remisiones o consentimientos firmados desde la zona de arriba.',
  emptyFiltered: 'Ningún documento con estos filtros',
  emptyFilteredHint: 'Cambia la categoría o el diente para ver otros documentos.',
  colCategory: 'Categoría',
  colName: 'Documento',
  colDate: 'Fecha clínica',
  colTeeth: 'Dientes',
  colAuthor: 'Subido por',
  colActions: 'Acciones',
  noDate: 'Sin fecha',
  noTeeth: '—',
  uploadedBy: (who: string, when: string) => `${who} · ${when}`,
  voided: 'Anulado',
  voidedDetail: (when: string, who: string, reason: string) =>
    `Anulado el ${when} por ${who}. Motivo: ${reason}`,
  unknownUser: 'un usuario',
  view: 'Ver',
  download: 'Descargar',
  void: 'Anular',
  downloadError: 'No pudimos descargar el documento.',
};

/**
 * QA D3: errores que no se arreglan reintentando el mismo fichero: duplicado
 * (409), más de 20 MB (413) y contenido no admitido (400 con
 * `DOCUMENT_CONTENT_REJECTED`). Un 400 del formulario sí se corrige y reintenta.
 */
function isDefinitiveUploadError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.status === 409 || err.status === 413 || err.code === 'DOCUMENT_CONTENT_REJECTED')
  );
}

type QueueStatus = 'converting' | 'ready' | 'waiting' | 'uploading' | 'done' | 'error';

/** Subidas simultáneas como mucho; el resto queda «En espera». */
const MAX_PARALLEL_UPLOADS = 3;

interface QueueItem {
  key: string;
  file: File;
  category: PatientDocumentCategory;
  teeth: string[];
  clinicalDate: string;
  notes: string;
  status: QueueStatus;
  progress: number;
  error: string | null;
  /**
   * Un fallo de la subida se reintenta; uno del pre-chequeo o uno definitivo
   * (duplicado, contenido no admitido, más de 20 MB: QA D3), no.
   */
  retryable: boolean;
  /**
   * El fichero ya llegó al almacén con este id (falta o faltó el `complete`):
   * «Reintentar» repite primero ese `complete` (revisión M-6).
   */
  storedDocumentId: string | null;
  /** El campo de dientes tiene un código no válido sin confirmar: no se sube. */
  teethInvalid: boolean;
}

interface PatientDocumentsTabProps {
  token: string;
  patientId: string;
  /** Diente del `?tooth=`: filtro inicial por diente. */
  initialTooth?: string | null;
  /**
   * Se llegó con «Documentos del diente» (odontograma): los archivos nuevos de
   * la cola traen ese diente puesto. Sin ello, solo se preselecciona el filtro.
   */
  tagUploadsWithTooth?: boolean;
  /**
   * Avisa de si la cola tiene archivos que no están subidos (listos, en espera,
   * subiendo o con error). La página mantiene el panel montado mientras tanto.
   */
  onPendingChange?: (pending: boolean) => void;
}

/** Los códigos FDI en el orden de la carta: permanentes y luego temporales. */
const FDI_OPTIONS: string[] = [
  ...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((t) => `${q}${t}`)),
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((t) => `${q}${t}`)),
];

/** Hoy (YYYY-MM-DD) en la zona del navegador: tope de la fecha clínica. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function TabSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

let queueSeq = 0;

/**
 * Pestaña «Documentos» de la ficha (DX-151), para los cuatro roles. Arriba, la
 * zona de subida: arrastrar y soltar o «Elegir archivos», con pre-chequeo de
 * tamaño y tipo en el navegador (sin pedir nada a la API), conversión de HEIC
 * a JPG y una fila por archivo con su categoría, dientes, fecha clínica,
 * notas y progreso. DX-259: cada archivo sube DIRECTO al almacén (POST
 * prefirmado), no por el proxy de la web ni por la API. Debajo, la lista filtrable por categoría y diente con
 * «Ver», «Descargar» y «Anular» (quien lo subió o un ADMIN).
 */
export function PatientDocumentsTab({
  token,
  patientId,
  initialTooth = null,
  tagUploadsWithTooth = false,
  onPendingChange,
}: PatientDocumentsTabProps) {
  const role = getTokenRole(token);
  const userId = getTokenUserId(token);
  const canUpload = canUploadPatientDocuments(role);
  const ids = useId();
  const hintId = `${ids}-allowed`;
  const inputRef = useRef<HTMLInputElement>(null);

  const startTooth = initialTooth && isFdiToothNumber(initialTooth) ? initialTooth : '';
  const [category, setCategory] = useState<PatientDocumentCategory | ''>('');
  const [tooth, setTooth] = useState(startTooth);
  const [docs, setDocs] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // La cola vigente para el «Reintentar» del toast, que se ejecuta después de
  // que la persona haya podido editar (o quitar) la fila.
  const queueRef = useRef<QueueItem[]>(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<PatientDocument | null>(null);
  const [voiding, setVoiding] = useState<PatientDocument | null>(null);
  const [downloading, setDownloading] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [runLimited] = useState(() => createLimiter(MAX_PARALLEL_UPLOADS));
  // G1-B: los tamaños con el formato de la sede de la pantalla; sin él, «—» y el aviso.
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  /** El `AbortController` de cada subida en curso, para «Cancelar» (QA D2). */
  const uploadControllers = useRef(new Map<string, AbortController>());

  const pending = queue.some((item) => item.status !== 'done');
  const inFlight = queue.some((item) => item.status === 'uploading' || item.status === 'waiting');

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  // Al desmontar (otro paciente, otra página) la cola ya no retiene el panel.
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);

  // Cerrar o recargar la pestaña del navegador con subidas en curso las
  // cortaría: el navegador pregunta antes.
  useEffect(() => {
    if (!inFlight) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inFlight]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientDocuments(token, patientId, {
          category: category || null,
          tooth: tooth || null,
        });
        if (cancelled) return;
        setDocs(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, category, tooth, reloadKey]);

  function updateItem(key: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function convertHeic(key: string, file: File) {
    try {
      const jpeg = await convertHeicToJpeg(file);
      const tooBig = validatePatientDocumentFile(jpeg);
      updateItem(key, tooBig ? { file: jpeg, status: 'error', error: tooBig } : { file: jpeg, status: 'ready' });
    } catch {
      updateItem(key, { status: 'error', error: HEIC_CONVERSION_ERROR });
    }
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    const added: QueueItem[] = Array.from(list).map((file) => {
      queueSeq += 1;
      const problem = validatePatientDocumentFile(file);
      const heic = !problem && isHeicFile(file);
      return {
        key: `q${queueSeq}`,
        file,
        category: 'OTHER',
        // Solo desde «Documentos del diente» el diente viene puesto.
        teeth: tagUploadsWithTooth && startTooth ? [startTooth] : [],
        clinicalDate: '',
        notes: '',
        status: problem ? 'error' : heic ? 'converting' : 'ready',
        progress: 0,
        error: problem,
        retryable: false,
        storedDocumentId: null,
        teethInvalid: false,
      };
    });
    setQueue((prev) => [...prev, ...added]);
    for (const item of added) {
      if (item.status === 'converting') void convertHeic(item.key, item.file);
    }
  }

  function matchesFilters(doc: PatientDocument): boolean {
    return (!category || doc.category === category) && (!tooth || doc.toothNumbers.includes(tooth));
  }

  async function upload(item: QueueItem) {
    if (item.teethInvalid) return;
    const name = item.file.name;
    updateItem(item.key, { status: 'waiting', progress: 0, error: null });
    const controller = new AbortController();
    uploadControllers.current.set(item.key, controller);
    try {
      const doc = await runLimited(() => {
        updateItem(item.key, { status: 'uploading' });
        return uploadPatientDocument(
          token,
          patientId,
          {
            file: item.file,
            category: item.category,
            clinicalDate: item.clinicalDate || null,
            toothNumbers: item.teeth,
            notes: item.notes,
          },
          {
            onProgress: (progress) => updateItem(item.key, { progress }),
            signal: controller.signal,
            resumeDocumentId: item.storedDocumentId,
            onStored: (documentId) => updateItem(item.key, { storedDocumentId: documentId }),
          },
        );
      });
      updateItem(item.key, { status: 'done', progress: 1 });
      setAnnouncement(copy.announceDone(name));
      if (matchesFilters(doc)) setDocs((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)]);
    } catch (err) {
      if (controller.signal.aborted) {
        // «Cancelar» (QA D2): la fila vuelve a estar lista, sin error.
        updateItem(item.key, { status: 'ready', progress: 0, error: null });
        return;
      }
      const reason = apiErrorMessage(err, { fallback: copy.uploadError, byStatus: { 503: copy.storageBusy } });
      const retryable = !isDefinitiveUploadError(err);
      updateItem(item.key, { status: 'error', error: reason, retryable });
      setAnnouncement(copy.announceError(name));
      // El toast sobrevive aunque la fila no esté a la vista (otra pestaña).
      if (!retryable) {
        notifyError(copy.uploadFailedToast(name, reason));
        return;
      }
      notifyError(copy.uploadFailedToast(name, reason), {
        onRetry: () => {
          // La fila de ahora, no la del fallo: la categoría o los dientes pudieron
          // cambiar. Si ya se quitó de la cola, no se sube.
          const current = queueRef.current.find((q) => q.key === item.key);
          if (current) void upload(current);
        },
      });
    } finally {
      if (uploadControllers.current.get(item.key) === controller) uploadControllers.current.delete(item.key);
    }
  }

  async function download(doc: PatientDocument) {
    setDownloading((prev) => new Set(prev).add(doc.id));
    try {
      const { url } = await getPatientDocumentUrl(token, patientId, doc.id, 'attachment');
      startDownload(url);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.downloadError), { onRetry: () => void download(doc) });
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  }

  const ready = queue.filter((item) => item.status === 'ready');
  const filtered = category !== '' || tooth !== '';

  function queueRow(item: QueueItem) {
    const name = item.file.name;
    const locked =
      item.status === 'uploading' ||
      item.status === 'waiting' ||
      item.status === 'done' ||
      item.status === 'converting';
    const editable = item.status === 'ready' || (item.status === 'error' && item.retryable);
    const field = (suffix: string) => `${ids}-${item.key}-${suffix}`;
    return (
      <li
        key={item.key}
        data-status={item.status}
        aria-label={name}
        className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3 last:border-0"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{name}</span>
          <span className="flex items-center gap-2 text-sm tabular-nums text-muted">
            {formatFileSize(item.file.size, fmt)}
            {item.status === 'done' ? <Badge variant="success">{copy.uploaded}</Badge> : null}
            {item.status === 'error' ? <Badge variant="danger">{copy.failed}</Badge> : null}
          </span>
        </div>

        {editable || item.status === 'uploading' || item.status === 'waiting' ? (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={field('category')} className="t-label text-muted">
                {copy.category}
              </label>
              <select
                id={field('category')}
                value={item.category}
                disabled={locked}
                onChange={(e) =>
                  updateItem(item.key, { category: e.target.value as PatientDocumentCategory })
                }
                className={cn(fieldClass, 'h-11 sm:h-10')}
              >
                {PATIENT_DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PATIENT_DOCUMENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={field('date')} className="t-label text-muted">
                {copy.clinicalDate}
              </label>
              <input
                id={field('date')}
                type="date"
                max={todayLocal()}
                value={item.clinicalDate}
                disabled={locked}
                onChange={(e) => updateItem(item.key, { clinicalDate: e.target.value })}
                className={cn(fieldClass, 'h-11 sm:h-10')}
              />
            </div>
            <ToothChipsInput
              id={field('teeth')}
              label={copy.teeth}
              value={item.teeth}
              disabled={locked}
              onChange={(teeth) => updateItem(item.key, { teeth })}
              onInvalidChange={(teethInvalid) => updateItem(item.key, { teethInvalid })}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={field('notes')} className="t-label text-muted">
                {copy.notes}
              </label>
              <input
                id={field('notes')}
                type="text"
                maxLength={500}
                value={item.notes}
                disabled={locked}
                onChange={(e) => updateItem(item.key, { notes: e.target.value })}
                className={cn(fieldClass, 'h-11 sm:h-10')}
              />
            </div>
          </div>
        ) : null}

        {item.status === 'converting' || item.status === 'waiting' ? (
          <p className="text-sm text-muted">{item.status === 'converting' ? copy.converting : copy.waiting}</p>
        ) : null}

        {item.teethInvalid && editable ? <p className="text-sm text-danger-text">{copy.fixTeeth}</p> : null}

        {item.status === 'uploading' || item.status === 'done' ? (
          <div
            role="progressbar"
            aria-label={copy.progressLabel(name)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(item.progress * 100)}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none',
                item.status === 'done' ? 'bg-success' : 'bg-primary',
              )}
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
        ) : null}

        {item.status === 'error' && item.error ? <InlineError>{item.error}</InlineError> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {item.status === 'ready' ? (
            <Button
              type="button"
              size="sm"
              className="max-sm:min-h-11"
              disabled={item.teethInvalid}
              onClick={() => void upload(item)}
            >
              <Upload aria-hidden />
              {copy.upload}
              <span className="sr-only">{copy.fileFor(name)}</span>
            </Button>
          ) : null}
          {item.status === 'uploading' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-sm:min-h-11"
              onClick={() => uploadControllers.current.get(item.key)?.abort()}
            >
              {copy.cancel}
              <span className="sr-only">{copy.fileFor(name)}</span>
            </Button>
          ) : null}
          {item.status === 'error' && item.retryable ? (
            <Button
              type="button"
              size="sm"
              className="max-sm:min-h-11"
              disabled={item.teethInvalid}
              onClick={() => void upload(item)}
            >
              {copy.retry}
              <span className="sr-only">{copy.fileFor(name)}</span>
            </Button>
          ) : null}
          {item.status !== 'uploading' && item.status !== 'waiting' && item.status !== 'converting' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-sm:min-h-11"
              onClick={() => setQueue((prev) => prev.filter((q) => q.key !== item.key))}
            >
              {copy.remove}
              <span className="sr-only">{copy.fileFor(name)}</span>
            </Button>
          ) : null}
        </div>
      </li>
    );
  }

  function documentRow(doc: PatientDocument) {
    const voided = doc.voidedAt !== null;
    const isDownloading = downloading.has(doc.id);
    return (
      <TableRow key={doc.id} data-status={voided ? 'VOIDED' : 'ACTIVE'}>
        <TableCell data-label={copy.colCategory}>
          <Badge variant={voided ? 'muted' : 'secondary'}>{PATIENT_DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
        </TableCell>
        <TableCell data-label={copy.colName} className="min-w-0 max-sm:flex-wrap">
          <div className="flex min-w-0 flex-col gap-1 max-sm:items-end max-sm:text-right">
            <div className="flex flex-wrap items-center gap-2 max-sm:justify-end">
              <span className={cn('font-medium [overflow-wrap:anywhere]', voided ? 'text-muted line-through' : 'text-ink')}>
                {doc.originalName}
              </span>
              {voided ? <StatusBadge kind="clinicalRecord" status="VOIDED" /> : null}
            </div>
            <span className="text-xs tabular-nums text-muted">{formatFileSize(doc.sizeBytes, fmt)}</span>
            {doc.notes ? <span className="text-xs text-muted [overflow-wrap:anywhere]">{doc.notes}</span> : null}
            {voided ? (
              <span className="text-xs text-ink [overflow-wrap:anywhere]">
                {copy.voidedDetail(
                  formatDateTime(doc.voidedAt),
                  doc.voidedByName ?? copy.unknownUser,
                  doc.voidReason ?? '',
                )}
              </span>
            ) : null}
          </div>
        </TableCell>
        <TableCell data-label={copy.colDate} className="tabular-nums">
          {doc.clinicalDate ? formatCivilDate(doc.clinicalDate) : <span className="text-muted">{copy.noDate}</span>}
        </TableCell>
        <TableCell data-label={copy.colTeeth} className="tabular-nums">
          {doc.toothNumbers.length > 0 ? doc.toothNumbers.join(', ') : <span className="text-muted">{copy.noTeeth}</span>}
        </TableCell>
        <TableCell data-label={copy.colAuthor} className="text-sm max-sm:text-right">
          {copy.uploadedBy(doc.uploadedByName ?? copy.unknownUser, formatDateTime(doc.uploadedAt))}
        </TableCell>
        <TableCell data-label={copy.colActions} className="max-sm:block max-sm:before:hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {doc.inlineViewable ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="max-sm:min-h-11"
                onClick={() => setViewing(doc)}
              >
                <Eye aria-hidden />
                {copy.view}
                <span className="sr-only">{copy.fileFor(doc.originalName)}</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="max-sm:min-h-11"
              loading={isDownloading}
              disabled={isDownloading}
              onClick={() => void download(doc)}
            >
              <Download aria-hidden />
              {copy.download}
              <span className="sr-only">{copy.fileFor(doc.originalName)}</span>
            </Button>
            {canVoidPatientDocument(role, doc, userId) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-sm:min-h-11"
                onClick={() => setVoiding(doc)}
              >
                {copy.void}
                <span className="sr-only">{copy.fileFor(doc.originalName)}</span>
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
        <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
      </div>

      {canUpload ? (
        <section aria-label={copy.queueLabel} className="flex flex-col gap-3">
          <div
            data-testid="documents-drop-zone"
            data-dragging={dragging || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(e) => {
              // Pasar por encima de un hijo (el botón, el texto) también dispara
              // dragleave: solo se apaga al salir de verdad de la zona.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
              dragging ? 'border-primary-border bg-primary-subtle' : 'border-border bg-surface',
            )}
          >
            <Upload className="size-6 text-muted" aria-hidden />
            <p className="text-sm font-medium text-ink">{dragging ? copy.dropActive : copy.dropTitle}</p>
            <p className="text-sm text-muted">{copy.dropOr}</p>
            <Button
              type="button"
              variant="secondary"
              className="max-sm:min-h-11 max-sm:w-full"
              aria-describedby={hintId}
              onClick={() => inputRef.current?.click()}
            >
              {copy.choose}
            </Button>
            <p id={hintId} className="max-w-[60ch] text-xs text-muted">
              {patientDocumentFileCopy.allowed}
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={PATIENT_DOCUMENT_ACCEPT}
              aria-label={copy.inputLabel}
              tabIndex={-1}
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {queue.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="t-label text-muted">{copy.queueHeading}</h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {queue.some((item) => item.status === 'done') ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-sm:min-h-11"
                      onClick={() => setQueue((prev) => prev.filter((item) => item.status !== 'done'))}
                    >
                      {copy.clearDone}
                    </Button>
                  ) : null}
                  {ready.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      className="max-sm:min-h-11"
                      onClick={() => ready.filter((item) => !item.teethInvalid).forEach((item) => void upload(item))}
                    >
                      <Upload aria-hidden />
                      {copy.uploadAll(ready.length)}
                    </Button>
                  ) : null}
                </div>
              </div>
              {/* Resultado de cada archivo para el lector de pantalla. */}
              <p role="status" aria-live="polite" className="sr-only">
                {announcement}
              </p>
              <ul aria-label={copy.queueLabel} className="overflow-hidden rounded-lg border border-border bg-surface text-sm">
                {queue.map(queueRow)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-col gap-3">
        <div role="group" aria-label={copy.filtersLabel} className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,12rem)]">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${ids}-filter-category`} className="t-label text-muted">
              {copy.category}
            </label>
            <select
              id={`${ids}-filter-category`}
              value={category}
              onChange={(e) => setCategory(e.target.value as PatientDocumentCategory | '')}
              className={cn(fieldClass, 'h-11 sm:h-10')}
            >
              <option value="">{copy.allCategories}</option>
              {PATIENT_DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PATIENT_DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${ids}-filter-tooth`} className="t-label text-muted">
              {copy.tooth}
            </label>
            <select
              id={`${ids}-filter-tooth`}
              value={tooth}
              onChange={(e) => setTooth(e.target.value)}
              className={cn(fieldClass, 'h-11 tabular-nums sm:h-10')}
            >
              <option value="">{copy.allTeeth}</option>
              {FDI_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sedeFormat.status === 'error' ? (
          <SedeConfigError kind="locale" variant="note" onRetry={sedeFormat.retry} description={sedeFormat.message} locationId={sedeFormat.locationId} />
        ) : null}

        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={docs.length === 0}
          emptyTitle={filtered ? copy.emptyFiltered : copy.empty}
          emptyDescription={filtered ? copy.emptyFilteredHint : copy.emptyHint}
          emptyIcon={<FileText aria-hidden />}
          skeleton={<TabSkeleton />}
        >
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <Table aria-label={copy.heading}>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.colCategory}</TableHead>
                  <TableHead>{copy.colName}</TableHead>
                  <TableHead>{copy.colDate}</TableHead>
                  <TableHead>{copy.colTeeth}</TableHead>
                  <TableHead>{copy.colAuthor}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{copy.colActions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{docs.map(documentRow)}</TableBody>
            </Table>
          </div>
        </AsyncSection>
      </div>

      {viewing ? (
        <DocumentViewerDialog
          key={viewing.id}
          open
          onOpenChange={(open) => {
            if (!open) setViewing(null);
          }}
          token={token}
          document={viewing}
        />
      ) : null}
      {voiding ? (
        <VoidDocumentModal
          key={voiding.id}
          open
          onOpenChange={(open) => {
            if (!open) setVoiding(null);
          }}
          token={token}
          document={voiding}
          onVoided={(updated) => setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))}
        />
      ) : null}
    </div>
  );
}
