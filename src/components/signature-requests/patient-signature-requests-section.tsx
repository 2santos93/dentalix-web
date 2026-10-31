'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileSignature, Link2Off, MailCheck, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { notifyError } from '@/components/errors/notify';
import { startDownload } from '@/lib/patient-documents/download';
import { getPatientDocumentUrl } from '@/lib/patient-documents/patient-documents-api';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { useSedeClock, type SedeClock } from '@/lib/locations/sede-clock';
import {
  canRevokeSignatureRequest,
  signatureStatusLabel,
  listSignatureRequests,
  resendSignedConsentPdfCopy,
  retrySignedConsentPdf,
  revokeSignatureRequest,
  type SignatureRequest,
  type SignatureRequestCreated,
} from '@/lib/signature-requests/signature-requests-api';
import { StatusBadge } from '@/components/ui/status-badge';
import { Callout } from '@/components/ui/callout';
import { SectionHeader } from '@/components/ui/section-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { SendToSignModal } from './send-to-sign-modal';

const copy = {
  heading: 'Firma a distancia',
  support:
    'Consentimientos enviados al paciente por email. Solo cuentan como completos cuando además firma el profesional.',
  send: 'Enviar a firmar',
  empty: 'Aún no se ha enviado ningún consentimiento a firmar a distancia.',
  emptyHint:
    'Usa «Enviar a firmar» para que el paciente o su responsable lo firme desde el móvil antes de la cita.',
  loadError: 'No pudimos cargar los envíos a firmar.',
  loading: 'Cargando envíos a firmar',
  listLabel: 'Consentimientos enviados a firmar',
  sent: (when: string, to: string, by: string | null) =>
    by ? `Enviado el ${when} a ${to} por ${by}` : `Enviado el ${when} a ${to}`,
  signer: (name: string, guardian: boolean) =>
    guardian ? `Firma ${name}, responsable del paciente` : `Firma ${name}`,
  professional: (name: string) => `Profesional: ${name}`,
  expires: (when: string) => `Caduca el ${when}`,
  opened: (when: string) => `Abierto el ${when}`,
  verified: (when: string) => `Código verificado el ${when}`,
  attempts: (n: number) => (n === 1 ? '1 código incorrecto' : `${n} códigos incorrectos`),
  locked: (when: string) =>
    `Bloqueado el ${when} tras 5 códigos incorrectos: anúlalo y envía otro.`,
  signedBy: (guardian: boolean, name: string) =>
    guardian ? `Firmado por el responsable (${name})` : 'Firmado por el paciente',
  signed: (by: string, when: string, ip: string | null) => (ip ? `${by} el ${when} desde la IP ${ip}` : `${by} el ${when}`),
  pendingProfessional: (name: string) => `Falta la firma de ${name} como profesional: la hará en la app.`,
  pendingSelf:
    'Falta tu firma como profesional: pulsa «Firmar como profesional» en la lista de consentimientos de abajo.',
  completed: (when: string) => `Completo: el profesional firmó el ${when}`,
  revoked: (when: string) => `Anulado el ${when}`,
  revoke: 'Anular enlace',
  actionsOf: (title: string) => `Acciones de ${title}`,
  revokeTitle: '¿Anular el enlace?',
  revokeDescription: (title: string, to: string) =>
    `El enlace de «${title}» enviado a ${to} dejará de servir. Si hace falta, puedes enviar otro.`,
  revokeError: 'No pudimos anular el enlace. Intenta de nuevo.',
  revokedToast: 'Enlace anulado: ya no sirve.',
  sentToast: (to: string) => `Enlace enviado a ${to}.`,
  notQueued:
    'La solicitud quedó registrada, pero el email no salió. Anúlala y envíala de nuevo.',
  // DX-422: el PDF firmado que genera la API al quedar completo.
  pdfReady: 'PDF firmado archivado en Documentos del paciente.',
  pdfPending: 'Generando el PDF firmado: aparecerá aquí y en Documentos del paciente.',
  pdfFailed: 'No pudimos generar el PDF firmado tras varios intentos.',
  downloadPdf: 'Descargar PDF',
  retryPdf: 'Reintentar PDF',
  pdfFor: (title: string) => ` de ${title}`,
  downloadPdfError: 'No pudimos descargar el PDF firmado. Intenta de nuevo.',
  retryPdfError: 'No pudimos volver a generar el PDF firmado. Intenta de nuevo.',
  // DX-443: la copia del PDF al paciente por un enlace de un solo uso.
  copySent: (when: string) => `Copia enviada al paciente el ${when} (enlace de un solo uso).`,
  copyNotSent: 'Aún no se ha enviado la copia al paciente.',
  resendCopy: 'Reenviar copia',
  resentToast: (to: string) => `Copia enviada a ${to}. El enlace anterior ya no sirve.`,
  resendCopyError: 'No pudimos reenviar la copia. Intenta de nuevo.',
};


function at(iso: string | null | undefined, clock: SedeClock | null): string {
  if (!iso) return NO_SEDE_FORMAT;
  return clock ? clock.fmt.dateTime(new Date(iso), clock.timeZone) : NO_SEDE_FORMAT;
}

/** Las líneas de evidencia de una solicitud, en orden de lo que pasó. */
function evidence(r: SignatureRequest, clock: SedeClock | null, userId: string | null): string[] {
  const lines = [
    copy.sent(at(r.sentAt, clock), r.destinationMasked, r.sentByName),
    copy.signer(r.signerName, r.signerType === 'GUARDIAN'),
    copy.professional(r.professionalName),
  ];
  if (r.openedAt) lines.push(copy.opened(at(r.openedAt, clock)));
  if (r.verifiedAt) lines.push(copy.verified(at(r.verifiedAt, clock)));
  if (r.failedAttempts > 0 && r.status !== 'LOCKED') lines.push(copy.attempts(r.failedAttempts));
  if (r.status === 'LOCKED') lines.push(copy.locked(at(r.lockedAt, clock)));
  if (r.signedAt) {
    const by = copy.signedBy(r.signerType === 'GUARDIAN', r.signerName);
    lines.push(copy.signed(by, at(r.signedAt, clock), r.signedIpAddress));
  }
  if (r.status === 'SIGNED_BY_PATIENT') {
    lines.push(r.professionalUserId === userId ? copy.pendingSelf : copy.pendingProfessional(r.professionalName));
  }
  if (r.countersignedAt) lines.push(copy.completed(at(r.countersignedAt, clock)));
  if (r.status === 'REVOKED') lines.push(copy.revoked(at(r.revokedAt, clock)));
  if (r.status === 'SENT' || r.status === 'OPENED' || r.status === 'EXPIRED') {
    lines.push(copy.expires(at(r.expiresAt, clock)));
  }
  return lines;
}

/**
 * DX-422: dónde está el PDF firmado de un envío completo. «Generando» es un
 * estado vivo (role=status) para los lectores de pantalla; el fallo, en el
 * color de peligro con el botón «Reintentar PDF» al lado.
 */
/** B1: mientras algún PDF se genera, se relee la lista cada 5 s, como mucho ~2 min. */
const PDF_POLL_MS = 5_000;
const PDF_POLL_MAX = 24;

/** Clave de «ocupado» del botón «Reenviar copia» (aparte de la del PDF). */
function copyBusyKey(id: string): string {
  return `${id}:copy`;
}

function hasPendingPdf(rows: readonly SignatureRequest[]): boolean {
  return rows.some((r) => r.status === 'COMPLETE' && r.signedPdfStatus === 'PENDING');
}

function SignedPdfStatusLine({
  status,
  copySentAt,
  clock,
  retry,
}: {
  status: SignatureRequest['signedPdfStatus'];
  copySentAt: string | null;
  clock: SedeClock | null;
  /** «Reintentar PDF», junto al aviso del fallo. */
  retry?: React.ReactNode;
}) {
  if (status === 'READY') {
    return (
      <>
        <p className="text-sm text-muted">{copy.pdfReady}</p>
        <p className="text-sm tabular-nums text-muted">
          {copySentAt ? copy.copySent(at(copySentAt, clock)) : copy.copyNotSent}
        </p>
      </>
    );
  }
  if (status === 'PENDING') {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.pdfPending}
      </p>
    );
  }
  if (status === 'FAILED') {
    // Aviso de esta fila con su salida al lado (DESIGN.md → Callout).
    return (
      <Callout tone="danger" role="alert" action={retry}>
        {copy.pdfFailed}
      </Callout>
    );
  }
  return null;
}

interface PatientSignatureRequestsSectionProps {
  token: string;
  patientId: string;
  /** Quien mira: si es el profesional elegido, se le pide su firma a él. */
  userId: string | null;
  /** Cambia cuando la ficha sabe que algo cambió (p. ej. firmó el profesional). */
  refreshKey?: number;
}

/**
 * Bloque «Firma a distancia» de la pestaña de consentimientos (DX-243): el
 * botón «Enviar a firmar» y cada envío con su estado (Enviado · Abierto ·
 * Bloqueado · Firmado por paciente · Completo, o Caducado / Anulado) y sus
 * evidencias (destino enmascarado, horas en la zona y el formato de la sede,
 * intentos, IP de la firma). Lo ven los cuatro roles: recepción también envía
 * y ve si quedó bloqueado. Anular (con confirmación) deja el enlace sin efecto.
 */
export function PatientSignatureRequestsSection({
  token,
  patientId,
  userId,
  refreshKey = 0,
}: PatientSignatureRequestsSectionProps) {
  const ids = useId();
  const sede = useSedeClock(token);
  const screenClock = sede.status === 'ready' ? sede.clock : null;
  const [rows, setRows] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmRevoke, setConfirmRevoke] = useState<SignatureRequest | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const revokedRef = useRef(false);
  const sendRef = useRef<HTMLButtonElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pdfBusy, setPdfBusy] = useState<ReadonlySet<string>>(new Set());
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listSignatureRequests(token, patientId)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey, refreshKey]);

  // B1: mientras haya un PDF «Generando», relee la lista cada 5 s (en pausa
  // con la pestaña oculta, sin contar) hasta ~2 min; un reintento reinicia la cuenta.
  const pendingPdf = hasPendingPdf(rows);
  useEffect(() => {
    if (!pendingPdf) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    const tick = () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(tick, PDF_POLL_MS);
        return;
      }
      polls += 1;
      listSignatureRequests(token, patientId)
        .then((data) => {
          if (!cancelled) setRows(data);
        })
        .catch(() => {
          // Silencioso: la lista que se ve sigue valiendo; se reintenta al siguiente tick.
        })
        .finally(() => {
          if (!cancelled && polls < PDF_POLL_MAX) timer = setTimeout(tick, PDF_POLL_MS);
        });
    };
    timer = setTimeout(tick, PDF_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingPdf, token, patientId, pollKey]);

  async function handleRevoke(id: string) {
    setRevoking(true);
    setRevokeError(null);
    try {
      const updated = await revokeSignatureRequest(token, patientId, id);
      setRows((current) => current.map((r) => (r.id === updated.id ? updated : r)));
      // Su botón desaparece: al cerrar, el foco va a «Enviar a firmar».
      revokedRef.current = true;
      setConfirmRevoke(null);
      toast.success(copy.revokedToast);
    } catch (err) {
      setRevokeError(apiErrorMessage(err, copy.revokeError));
    } finally {
      setRevoking(false);
    }
  }

  function setBusy(id: string, busy: boolean) {
    setPdfBusy((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** DX-422: el PDF archivado se descarga como cualquier documento (URL firmada, auditada). */
  async function handleDownloadPdf(r: SignatureRequest) {
    if (!r.signedPdfDocumentId) return;
    setBusy(r.id, true);
    try {
      const { url } = await getPatientDocumentUrl(token, patientId, r.signedPdfDocumentId, 'attachment');
      startDownload(url);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.downloadPdfError), { onRetry: () => void handleDownloadPdf(r) });
    } finally {
      setBusy(r.id, false);
    }
  }

  async function handleRetryPdf(r: SignatureRequest) {
    if (!r.consentId) return;
    setBusy(r.id, true);
    try {
      await retrySignedConsentPdf(token, patientId, r.consentId);
      setRows((current) =>
        current.map((row) => (row.id === r.id ? { ...row, signedPdfStatus: 'PENDING' } : row)),
      );
      setPollKey((k) => k + 1);
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.retryPdfError), { onRetry: () => void handleRetryPdf(r) });
    } finally {
      setBusy(r.id, false);
    }
  }

  /**
   * DX-443: «Reenviar copia» — la API envía un enlace nuevo de un solo uso al
   * email de la firma e invalida el anterior. La fila se actualiza con la hora.
   */
  async function handleResendCopy(r: SignatureRequest) {
    if (!r.consentId) return;
    const key = copyBusyKey(r.id);
    setBusy(key, true);
    try {
      const resent = await resendSignedConsentPdfCopy(token, patientId, r.consentId);
      setRows((current) =>
        current.map((row) => (row.id === r.id ? { ...row, signedPdfCopySentAt: resent.sentAt } : row)),
      );
      toast.success(copy.resentToast(resent.destinationMasked));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.resendCopyError), { onRetry: () => void handleResendCopy(r) });
    } finally {
      setBusy(key, false);
    }
  }

  function handleSent(created: SignatureRequestCreated) {
    if (created.emailQueued) toast.success(copy.sentToast(created.destinationMasked));
    else toast.warning(copy.notQueued);
    // Un envío nuevo anula el anterior del mismo documento: se relee la lista.
    setReloadKey((k) => k + 1);
  }

  const clockOf = (locationId: string) => screenClock?.of(locationId) ?? screenClock;

  function rowActions(r: SignatureRequest): RowAction[] {
    const list: RowAction[] = [];
    if (r.status === 'COMPLETE' && r.signedPdfStatus === 'READY' && r.signedPdfDocumentId) {
      list.push({
        label: copy.downloadPdf,
        icon: <Download aria-hidden />,
        disabled: pdfBusy.has(r.id),
        onSelect: () => void handleDownloadPdf(r),
      });
      if (r.consentId) {
        list.push({
          label: copy.resendCopy,
          icon: <MailCheck aria-hidden />,
          disabled: pdfBusy.has(copyBusyKey(r.id)),
          onSelect: () => void handleResendCopy(r),
        });
      }
    }
    if (canRevokeSignatureRequest(r.status)) {
      list.push({
        label: copy.revoke,
        icon: <Link2Off aria-hidden />,
        destructive: true,
        separatorBefore: list.length > 0,
        onSelect: () => {
          setRevokeError(null);
          setConfirmRevoke(r);
        },
      });
    }
    return list;
  }

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      data-testid="patient-signature-requests"
      className="flex flex-col gap-4"
    >
      {/* B7: sin tarjeta propia (la pestaña ya es la superficie) y «Enviar a
          firmar» secundaria: la primaria de la pestaña es «Nuevo consentimiento». */}
      <SectionHeader
        as="h3"
        titleId={`${ids}-heading`}
        title={copy.heading}
        description={copy.support}
        actions={
          <Button
            ref={sendRef}
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => {
              setModalKey((k) => k + 1);
              setModalOpen(true);
            }}
          >
            <Send aria-hidden />
            {copy.send}
          </Button>
        }
      />

      {loading ? (
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      ) : error ? (
        <SectionError
          description={error}
          className="py-8"
          onRetry={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : rows.length === 0 ? (
        <div data-testid="signature-requests-empty">
          <EmptyState
            role="status"
            icon={<FileSignature aria-hidden />}
            title={copy.empty}
            description={copy.emptyHint}
          />
        </div>
      ) : (
        <ul
          aria-label={copy.listLabel}
          className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border bg-surface"
        >
          {rows.map((r) => {
            const actions = rowActions(r);
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-6">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words font-medium text-ink">{r.title}</span>
                    <StatusBadge kind="signatureRequest" status={r.status}>
                      {signatureStatusLabel(r.status, r.signerType)}
                    </StatusBadge>
                  </div>
                  <ul className="flex flex-col gap-0.5 text-sm text-muted tabular-nums">
                    {evidence(r, clockOf(r.locationId), userId).map((line) => (
                      <li key={line} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <SignedPdfStatusLine
                    status={r.status === 'COMPLETE' ? r.signedPdfStatus : null}
                    copySentAt={r.signedPdfCopySentAt}
                    clock={clockOf(r.locationId)}
                    retry={
                      r.status === 'COMPLETE' && r.signedPdfStatus === 'FAILED' && r.consentId ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="min-h-11 sm:min-h-9"
                          loading={pdfBusy.has(r.id)}
                          disabled={pdfBusy.has(r.id)}
                          onClick={() => void handleRetryPdf(r)}
                        >
                          <RotateCcw aria-hidden />
                          {copy.retryPdf}
                          <span className="sr-only">{copy.pdfFor(r.title)}</span>
                        </Button>
                      ) : null
                    }
                  />
                </div>
                {actions.length > 0 ? (
                  <RowActions
                    label={copy.actionsOf(r.title)}
                    actions={actions}
                    busy={pdfBusy.has(r.id) || pdfBusy.has(copyBusyKey(r.id))}
                    // 44 px bajo sm, como el «⋯» de las tarjetas de DataList.
                    className="size-11 shrink-0 sm:size-9"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) setConfirmRevoke(null);
        }}
        title={copy.revokeTitle}
        description={confirmRevoke ? copy.revokeDescription(confirmRevoke.title, confirmRevoke.destinationMasked) : undefined}
        confirmLabel={copy.revoke}
        onConfirm={() => {
          if (confirmRevoke) void handleRevoke(confirmRevoke.id);
        }}
        confirming={revoking}
        error={revokeError}
        onCloseAutoFocus={(event) => {
          if (!revokedRef.current) return;
          revokedRef.current = false;
          event.preventDefault();
          sendRef.current?.focus();
        }}
      />

      <SendToSignModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        patientId={patientId}
        userId={userId}
        clock={screenClock}
        onSent={handleSent}
      />
    </section>
  );
}
