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
import { getTokenAllowedLocationIds } from '@/lib/auth/token-role';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { fetchClinicName } from '@/lib/clinic-branding';
import { formatCurrency } from '@/lib/format/currency';
import { formatDate } from '@/lib/format/date';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { FormField } from '@/components/shared/form-field';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { ResultCount } from '@/components/shared/list-toolbar';
import { RejectPlanModal } from './reject-plan-modal';

export const pendingFollowUpCopy = {
  scopeAll: 'Todas las sedes',
  scopeMine: 'Mis sedes',
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

const copy = pendingFollowUpCopy;

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

  // Nombre de la clínica (para el mensaje): falla en silencio, solo afina el texto.
  useEffect(() => {
    let cancelled = false;
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => {
        /* sin nombre, el mensaje dice «la clínica» */
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

  const columns: DataListColumn<PendingFollowUpItem>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (row) => (
        <Link
          href={`/patients/${row.patientId}`}
          className="font-medium text-ink underline-offset-4 hover:text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
        >
          {row.patientName}
        </Link>
      ),
    },
    {
      id: 'option',
      header: copy.colOption,
      cell: (row) => <span className="text-muted">{row.optionLabel ?? copy.noOption}</span>,
      mobileCell: (row) => row.optionLabel ?? copy.noOption,
    },
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      mobile: 'trailing',
      cell: (row) => <span className="font-medium text-ink">{formatCurrency(row.total, row.currency)}</span>,
    },
    {
      id: 'presented',
      header: copy.colPresented,
      cell: (row) => (
        <span className="tabular-nums">
          {formatDate(row.presentedAt)}
          <span className="t-caption block text-muted">{copy.daysAgo(row.daysSincePresented)}</span>
        </span>
      ),
      // En el teléfono, la antigüedad es lo que decide a quién llamar.
      mobileCell: (row) => copy.daysAgo(row.daysSincePresented),
    },
    {
      id: 'contact',
      header: copy.colPhone,
      cell: (row) => <ContactLinks row={row} clinicName={clinicName} />,
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
          <FormField htmlFor="follow-up-age" label={copy.ageLabel} className="sm:w-56">
            <NativeSelect
              id="follow-up-age"
              size="sm"
              value={olderThanDays}
              onChange={(e) => changeAge(Number(e.target.value))}
            >
              {AGE_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {copy.ageOption(days)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
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
              {/* Tabla desde \`sm\`, tarjeta compacta en el teléfono (paciente +
                  monto / opción · antigüedad · llamar · WhatsApp). «Marcar
                  rechazado» cierra la conversación: va en el «⋯», con su motivo. */}
              <DataList
                label={copy.tableLabel}
                rows={items}
                columns={columns}
                getRowKey={(row) => row.planId}
                getRowLabel={(row) => row.patientName}
                rowActions={(row) => [
                  {
                    label: copy.reject,
                    destructive: true,
                    onSelect: () => {
                      setNotice(null);
                      setRejecting(row);
                    },
                  },
                ]}
              />
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

/** Llamar (\`tel:\`) y WhatsApp prellenado: el bloque de contacto de la fila. */
function ContactLinks({ row, clinicName }: { row: PendingFollowUpItem; clinicName: string | null }) {
  if (!row.patientPhone) return <span className="text-muted">{copy.noPhone}</span>;
  const whatsapp = followUpWhatsAppHref(row, clinicName);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      <a
        href={telHref(row.patientPhone)}
        aria-label={copy.call(row.patientName, row.patientPhone)}
        className={contactLinkClass}
      >
        <Phone aria-hidden className="size-4 text-muted" />
        <span className="tabular-nums">{row.patientPhone}</span>
      </a>
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={copy.whatsappLabel(row.patientName)}
          className={contactLinkClass}
        >
          <MessageCircle aria-hidden className="size-4 text-muted" />
          {copy.whatsapp}
        </a>
      ) : (
        <span className="t-caption text-muted">{copy.noWhatsApp}</span>
      )}
    </span>
  );
}

const contactLinkClass =
  'relative z-10 inline-flex min-h-11 items-center gap-1.5 text-ink underline-offset-4 hover:text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text sm:min-h-0';

/**
 * Alcance de «Presupuestos por seguir» para el hueco \`meta\` del \`PageHeader\`
 * de la página: la sede activa, «Mis sedes» (rol restringido) o «Todas las
 * sedes». Lee las sedes en el cliente y falla en silencio (solo afina el texto).
 */
export function FollowUpScopeMarker({ token }: { token: string }) {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
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
  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null;
  return (
    <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-sunken px-3 py-1.5 text-sm text-muted">
      <Building2 aria-hidden className="size-4 shrink-0 text-muted" />
      <span>
        {activeLocation
          ? copy.scopeLocation(activeLocation.name)
          : getTokenAllowedLocationIds(token) !== null
            ? copy.scopeMine
            : copy.scopeAll}
      </span>
    </p>
  );
}
