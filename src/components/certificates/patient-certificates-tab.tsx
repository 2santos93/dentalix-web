'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { BedDouble, FileCheck2, Plus, Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import {
  canPrintCertificate,
  canVoidCertificate,
  CERTIFICATE_KIND_LABELS,
  getCertificateIssuer,
  listPatientCertificates,
  type CertificateKind,
  type PatientCertificate,
} from '@/lib/certificates/certificates-api';
import { openCertificatePdf } from '@/lib/certificates/open-certificate-pdf';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection } from '@/components/shared/async-section';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import { IssueCertificateModal } from './issue-certificate-modal';
import { VoidCertificateModal } from './void-certificate-modal';

export const patientCertificatesCopy = {
  heading: 'Certificados',
  support:
    'Justificantes de asistencia y certificados de reposo de citas atendidas. Uno emitido no se edita: solo se anula con motivo.',
  issueAttendance: 'Emitir justificante',
  issueRest: 'Certificado de reposo',
  empty: 'Este paciente no tiene certificados.',
  emptyHint: 'Emite un justificante de asistencia desde una cita atendida; el PDF queda en «Documentos».',
  loadError: 'No pudimos cargar los certificados.',
  loading: 'Cargando certificados',
  tableLabel: 'Certificados del paciente',
  colKind: 'Certificado',
  colAttendance: 'Atención',
  colIssued: 'Emitido',
  colStatus: 'Estado',
  colDocument: 'Documento',
  number: (n: string) => `nº ${n}`,
  attended: (date: string, from: string, until: string) => `${date} · ${from}–${until}`,
  scheduledTimes: 'Con las horas programadas: no se registró la llegada y la salida.',
  restDays: (days: number) => (days === 1 ? '1 día de reposo' : `${days} días de reposo`),
  restRange: (from: string, until: string) => `del ${from} al ${until}`,
  issuedBy: (who: string) => `por ${who}`,
  unknownUser: 'un usuario',
  voidedDetail: (when: string, who: string, reason: string) => `Anulado el ${when} por ${who}. Motivo: ${reason}`,
  print: 'Imprimir',
  printHint: (label: string, number: string) => `${label} nº ${number} (se abre en otra pestaña)`,
  printError: 'No pudimos abrir el PDF del certificado.',
  noPrintDiagnosis: 'Lleva diagnóstico: lo imprime odontología o administración.',
  void: 'Anular',
  rowLabel: (label: string, number: string) => `${label} nº ${number}`,
};

const copy = patientCertificatesCopy;

interface PatientCertificatesTabProps {
  token: string;
  patientId: string;
}

function TabSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/**
 * Pestaña «Certificados» de la ficha (DX-306), los cuatro roles. Lista los
 * justificantes y reposos (los anulados, con quién, cuándo y por qué), los
 * imprime (PDF con la sesión, en otra pestaña) y, para quien lo emitió o un
 * ADMIN, «Anular». «Emitir justificante» para todos; «Certificado de reposo»
 * solo si `GET /certificates/issuer` lo permite (DENTIST o ADMIN). Fechas y
 * horas con el reloj de la sede de cada certificado.
 */
export function PatientCertificatesTab({ token, patientId }: PatientCertificatesTabProps) {
  const role = getTokenRole(token);
  const userId = getTokenUserId(token);
  const [certificates, setCertificates] = useState<PatientCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [canIssueRest, setCanIssueRest] = useState(false);
  const [issuing, setIssuing] = useState<{ kind: CertificateKind; key: number } | null>(null);
  const [voiding, setVoiding] = useState<PatientCertificate | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const stamp = useSedeStamp(
    token,
    certificates.map((c) => c.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientCertificates(token, patientId);
        if (cancelled) return;
        setCertificates(data);
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
  }, [token, patientId, reloadKey]);

  // Qué puede emitir: el reposo solo DENTIST o ADMIN. Si no responde, no se ofrece
  // (el justificante sí: lo emiten los cuatro roles).
  useEffect(() => {
    let cancelled = false;
    getCertificateIssuer(token)
      .then((issuer) => {
        if (!cancelled) setCanIssueRest(issuer.canIssueRest);
      })
      .catch(() => {
        if (!cancelled) setCanIssueRest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function openIssue(kind: CertificateKind) {
    setIssuing((prev) => ({ kind, key: (prev?.key ?? 0) + 1 }));
  }

  function replace(updated: PatientCertificate) {
    setCertificates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function print(cert: PatientCertificate) {
    setPrintingId(cert.id);
    try {
      await openCertificatePdf(token, patientId, cert.id);
    } catch (err) {
      // Escalón 3: la lista sigue correcta; el reintento repite ESTA impresión.
      notifyError(apiErrorMessage(err, copy.printError), { onRetry: () => void print(cert) });
    } finally {
      setPrintingId(null);
    }
  }

  function kindCell(cert: PatientCertificate) {
    return (
      <span className={cn('flex flex-col', cert.voidedAt && 'text-muted line-through')}>
        <span className="font-medium">{CERTIFICATE_KIND_LABELS[cert.kind]}</span>
        <span className="t-id t-caption text-muted">{copy.number(cert.numberLabel)}</span>
      </span>
    );
  }

  function attendanceCell(cert: PatientCertificate) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="t-data">
          {copy.attended(
            stamp.date(cert.attendedFrom, cert.locationId),
            stamp.time(cert.attendedFrom, cert.locationId),
            stamp.time(cert.attendedUntil, cert.locationId),
          )}
        </span>
        {cert.timesSource === 'SCHEDULED' ? <span className="t-caption text-muted">{copy.scheduledTimes}</span> : null}
        {cert.kind === 'REST' && cert.restDays !== null ? (
          <span className="t-data text-ink">
            {copy.restDays(cert.restDays)}
            {cert.restStartDate && cert.restEndDate
              ? ` ${copy.restRange(
                  stamp.civilDate(cert.restStartDate, cert.locationId),
                  stamp.civilDate(cert.restEndDate, cert.locationId),
                )}`
              : null}
          </span>
        ) : null}
      </div>
    );
  }

  function issuedCell(cert: PatientCertificate) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="t-data">{stamp.dateTime(cert.issuedAt, cert.locationId)}</span>
        <span className="t-caption text-muted">{copy.issuedBy(cert.issuedByName ?? copy.unknownUser)}</span>
      </div>
    );
  }

  function statusCell(cert: PatientCertificate) {
    // `data-status`: la fila de la tabla no admite atributos propios; el e2e localiza el anulado por aquí.
    return (
      <div data-status={cert.voidedAt ? 'VOIDED' : 'LIVE'} className="flex min-w-0 flex-col gap-1">
        <StatusBadge kind="certificate" status={cert.voidedAt ? 'VOIDED' : 'LIVE'} />
        {cert.voidedAt ? (
          <p className="t-caption text-ink [overflow-wrap:anywhere]">
            {copy.voidedDetail(
              stamp.dateTime(cert.voidedAt, cert.locationId),
              cert.voidedByName ?? copy.unknownUser,
              cert.voidReason ?? '',
            )}
          </p>
        ) : null}
      </div>
    );
  }

  function documentCell(cert: PatientCertificate) {
    if (!canPrintCertificate(cert)) {
      return <p className="t-caption max-w-[16rem] text-muted">{copy.noPrintDiagnosis}</p>;
    }
    const label = CERTIFICATE_KIND_LABELS[cert.kind];
    const busy = printingId === cert.id;
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="max-sm:min-h-11"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => void print(cert)}
      >
        <Printer aria-hidden />
        {copy.print}
        <span className="sr-only"> · {copy.printHint(label, cert.numberLabel)}</span>
      </Button>
    );
  }

  const columns: DataListColumn<PatientCertificate>[] = [
    { id: 'kind', header: copy.colKind, mobile: 'primary', cell: kindCell, cellClassName: 'align-top' },
    {
      id: 'attendance',
      header: copy.colAttendance,
      cell: attendanceCell,
      mobileCell: (cert) => <span className="block text-ink">{attendanceCell(cert)}</span>,
      cellClassName: 'align-top',
    },
    {
      id: 'issued',
      header: copy.colIssued,
      cell: issuedCell,
      mobileCell: (cert) => {
        const when = stamp.maybe.dateTime(cert.issuedAt, cert.locationId);
        const who = copy.issuedBy(cert.issuedByName ?? copy.unknownUser);
        return when ? `${when} ${who}` : who;
      },
      cellClassName: 'align-top',
      showFrom: 'lg',
    },
    { id: 'status', header: copy.colStatus, mobile: 'trailing', cell: statusCell, cellClassName: 'align-top' },
    {
      id: 'document',
      header: <span className="sr-only">{copy.colDocument}</span>,
      cell: documentCell,
      mobileCell: (cert) => <div className="mt-2">{documentCell(cert)}</div>,
      align: 'end',
      cellClassName: 'align-top',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={copy.heading}
        description={<span className="block max-w-[68ch]">{copy.support}</span>}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canIssueRest ? (
              <Button type="button" variant="secondary" onClick={() => openIssue('REST')} className="w-full sm:w-auto">
                <BedDouble aria-hidden />
                {copy.issueRest}
              </Button>
            ) : null}
            <Button type="button" onClick={() => openIssue('ATTENDANCE')} className="w-full sm:w-auto">
              <Plus aria-hidden />
              {copy.issueAttendance}
            </Button>
          </div>
        }
      />

      <SedeStampNote stamp={stamp} />

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={certificates.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<FileCheck2 aria-hidden />}
        skeleton={<TabSkeleton />}
      >
        {/* Sin «Editar» ni «Borrar»: el certificado emitido es inmutable; solo se anula. */}
        <DataList
          label={copy.tableLabel}
          rows={certificates}
          columns={columns}
          getRowKey={(cert) => cert.id}
          getRowLabel={(cert) => copy.rowLabel(CERTIFICATE_KIND_LABELS[cert.kind], cert.numberLabel)}
          rowActions={(cert) =>
            canVoidCertificate(cert, { role, userId })
              ? [{ label: copy.void, onSelect: () => setVoiding(cert), destructive: true }]
              : []
          }
        />
      </AsyncSection>

      {issuing ? (
        <IssueCertificateModal
          key={issuing.key}
          open
          onOpenChange={(open) => {
            if (!open) setIssuing(null);
          }}
          token={token}
          patientId={patientId}
          kind={issuing.kind}
          onIssued={(cert) => setCertificates((prev) => [cert, ...prev.filter((c) => c.id !== cert.id)])}
        />
      ) : null}
      {voiding ? (
        <VoidCertificateModal
          key={voiding.id}
          open
          onOpenChange={(open) => {
            if (!open) setVoiding(null);
          }}
          token={token}
          patientId={patientId}
          certificate={voiding}
          onVoided={replace}
        />
      ) : null}
    </div>
  );
}
