'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Lock, MessageCircle, Phone } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  listPendingFollowUp,
  type PendingFollowUpItem,
  type PendingFollowUpPage,
} from '@/lib/treatment-plans/plan-options-api';
import { followUpWhatsAppHref } from '@/lib/treatment-plans/plan-options';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { fetchClinicName } from '@/lib/clinic-branding';
import { formatCurrency } from '@/lib/format/currency';
import { formatDate } from '@/lib/format/date';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { PageHeader } from '@/components/shared/page-header';
import { ResultCount, toolbarFieldClass } from '@/components/shared/list-toolbar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RejectPlanModal } from './reject-plan-modal';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Presupuestos por seguir',
  description:
    'Presupuestos presentados que el paciente aún no acepta y sin cita agendada: llámalo o escríbele antes de que se enfríen.',
  scopeAll: 'Todas las sedes',
  scopeLocation: (name: string) => `Presentados en ${name}`,
  ageLabel: 'Presentados hace más de',
  ageOption: (days: number) => `${days} días`,
  countNoun: 'presupuesto',
  countNounPlural: 'presupuestos',
  tableLabel: 'Presupuestos presentados sin aceptar',
  colPatient: 'Paciente',
  colOption: 'Opción',
  colAmount: 'Monto',
  colPresented: 'Presentado',
  colPhone: 'Teléfono',
  colActions: 'Acciones',
  noOption: 'Plan único',
  daysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
  call: (name: string, phone: string) => `Llamar a ${name}: ${phone}`,
  noPhone: 'Sin teléfono',
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `WhatsApp a ${name}`,
  noWhatsApp: 'El teléfono no sirve para WhatsApp',
  reject: 'Marcar rechazado',
  rejectLabel: (name: string) => `Marcar rechazado: ${name}`,
  rejectSubject: (label: string | null, name: string) => `${label ?? 'Plan único'} · ${name}`,
  rejected: 'Presupuesto marcado como rechazado.',
  // Sin «Intenta de nuevo.»: `AsyncSection` → `SectionError` trae su botón.
  loadError: 'No pudimos cargar los presupuestos por seguir.',
  badRequest: 'La antigüedad elegida no es válida.',
  forbiddenTitle: 'Tu rol no tiene acceso a esta lista.',
  forbiddenHint:
    'Los presupuestos por seguir son para administración y recepción. Pídele acceso a quien administra la clínica.',
  empty: 'No hay presupuestos por seguir.',
  emptyHint: 'Cada presupuesto presentado sin respuesta y sin cita aparece aquí pasado el plazo elegido.',
};

const AGE_OPTIONS = [7, 15, 30, 60] as const;

interface PendingFollowUpViewProps {
  token: string;
}

/** `tel:` sin espacios ni guiones (el `+` se conserva). */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * «Presupuestos por seguir» (DX-040): la lista de llamadas de recepción. Planes
 * presentados hace más de N días, sin aceptar y sin cita futura, de la sede
 * activa o de toda la clínica, con el monto en la moneda de cada plan, el
 * teléfono, un WhatsApp prellenado y «Marcar rechazado» con motivo. Mismo
 * patrón de lista que la caja (`CashRegisterView`).
 */
export function PendingFollowUpView({ token }: PendingFollowUpViewProps) {
  const [olderThanDays, setOlderThanDays] = useState<number>(AGE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PendingFollowUpPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingFollowUpItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listPendingFollowUp(token, { olderThanDays, page });
        if (cancelled) return;
        // La página pedida se quedó vacía (p. ej. se rechazó la única fila de
        // la última): se pasa a la última que existe.
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        const status = err instanceof ApiError ? err.status : null;
        setForbidden(status === 403);
        setLoadError(status === 400 ? copy.badRequest : copy.loadError);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, olderThanDays, page, reloadKey]);

  // Nombre de la clínica (para el mensaje) y la sede activa (para el alcance):
  // fallan en silencio, solo afinan el texto.
  useEffect(() => {
    let cancelled = false;
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => {
        /* sin nombre, el mensaje dice «la clínica» */
      });
    listLocations(token)
      .then((list) => {
        if (cancelled) return;
        setLocations(list ?? []);
        setActiveLocationId(getActiveLocationId());
      })
      .catch(() => {
        /* sin sedes no se nombra ninguna */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function changeAge(days: number) {
    setOlderThanDays(days);
    setPage(1);
  }

  const items = data?.items ?? [];
  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null;

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={
          <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted">
            <Building2 aria-hidden className="size-4 shrink-0 text-muted/80" />
            <span>{activeLocation ? copy.scopeLocation(activeLocation.name) : copy.scopeAll}</span>
          </p>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex min-w-0 flex-col gap-1.5 text-sm text-muted sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0">{copy.ageLabel}</span>
            <select
              value={olderThanDays}
              onChange={(e) => changeAge(Number(e.target.value))}
              className={cn(toolbarFieldClass, 'sm:w-40')}
            >
              {AGE_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {copy.ageOption(days)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
          {notice}
        </p>

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={copy.forbiddenTitle}
            description={copy.forbiddenHint}
          />
        ) : (
          <>
            {!loading && !loadError && data ? (
              <ResultCount total={data.total} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
            ) : null}

            <AsyncSection
              loading={loading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={copy.empty}
              emptyDescription={copy.emptyHint}
              skeleton={<TableSkeleton rows={4} />}
            >
              <Card className="overflow-hidden p-0">
                <Table aria-label={copy.tableLabel}>
                  <caption className="sr-only">{copy.tableLabel}</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">{copy.colPatient}</TableHead>
                      <TableHead scope="col">{copy.colOption}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {copy.colAmount}
                      </TableHead>
                      <TableHead scope="col">{copy.colPresented}</TableHead>
                      <TableHead scope="col">{copy.colPhone}</TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">{copy.colActions}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((row) => {
                      const whatsapp = followUpWhatsAppHref(row, clinicName);
                      return (
                        <TableRow key={row.planId}>
                          <TableCell data-label={copy.colPatient}>
                            <Link
                              href={`/patients/${row.patientId}`}
                              className="font-medium text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {row.patientName}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted" data-label={copy.colOption}>
                            {row.optionLabel ?? copy.noOption}
                          </TableCell>
                          <TableCell
                            className="text-right font-medium tabular-nums text-ink"
                            data-label={copy.colAmount}
                          >
                            {formatCurrency(row.total, row.currency)}
                          </TableCell>
                          <TableCell className="tabular-nums" data-label={copy.colPresented}>
                            {formatDate(row.presentedAt)}
                            <span className="block text-xs text-muted">
                              {copy.daysAgo(row.daysSincePresented)}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums" data-label={copy.colPhone}>
                            {row.patientPhone ? (
                              <a
                                href={telHref(row.patientPhone)}
                                aria-label={copy.call(row.patientName, row.patientPhone)}
                                className="inline-flex min-h-11 items-center gap-1.5 text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                <Phone aria-hidden className="size-4 text-muted" />
                                {row.patientPhone}
                              </a>
                            ) : (
                              <span className="text-muted">{copy.noPhone}</span>
                            )}
                          </TableCell>
                          <TableCell data-label={copy.colActions}>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              {whatsapp ? (
                                <Button asChild variant="outline" size="sm">
                                  <a
                                    href={whatsapp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={copy.whatsappLabel(row.patientName)}
                                  >
                                    <MessageCircle aria-hidden />
                                    {copy.whatsapp}
                                  </a>
                                </Button>
                              ) : row.patientPhone ? (
                                <span className="text-xs text-muted">{copy.noWhatsApp}</span>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={copy.rejectLabel(row.patientName)}
                                onClick={() => {
                                  setNotice(null);
                                  setRejecting(row);
                                }}
                              >
                                {copy.reject}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </AsyncSection>

            {!loadError ? (
              <Pagination
                page={page}
                pageSize={data?.pageSize ?? 0}
                total={data?.total ?? 0}
                onPageChange={setPage}
                disabled={loading}
              />
            ) : null}
          </>
        )}
      </div>

      {rejecting ? (
        <RejectPlanModal
          key={rejecting.planId}
          open
          onOpenChange={(open) => {
            if (!open) setRejecting(null);
          }}
          token={token}
          planId={rejecting.planId}
          subject={copy.rejectSubject(rejecting.optionLabel, rejecting.patientName)}
          onRejected={() => {
            setRejecting(null);
            setNotice(copy.rejected);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}
