'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import {
  canRegisterImplants,
  canVoidImplant,
  formatImplantSize,
  groupImplantsByTooth,
  IMPLANT_KIND_LABELS,
  implantCardPrintHref,
  listPatientImplants,
  type PatientImplant,
} from '@/lib/implants/implants-api';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RegisterImplantModal } from './register-implant-modal';
import { VoidImplantModal } from './void-implant-modal';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';

const copy = {
  heading: 'Implantes',
  support:
    'Ficha de cada implante, pilar, injerto o membrana colocado, por diente. Un registro guardado no se edita: se anula con motivo. La tarjeta de implante se imprime para entregarla al paciente.',
  register: 'Registrar implante',
  empty: 'Sin implantes registrados',
  emptyHint: 'Regístralo al terminar la cirugía con la etiqueta del envase, o desde el odontograma.',
  emptyHintReadOnly: 'Los implantes los registran odontología y administración.',
  loadError: 'No pudimos cargar los implantes.',
  loading: 'Cargando implantes',
  toothHeading: (tooth: string) => `Diente ${tooth}`,
  listLabel: (tooth: string) => `Implantes del diente ${tooth}`,
  reference: 'REF',
  lot: 'Lote',
  placedBy: (date: string, who: string) => `${date} · ${who}`,
  voided: 'Anulado',
  delivered: (when: string) => `Tarjeta entregada el ${when}`,
  voidedDetail: (when: string, who: string, reason: string) =>
    `Anulado el ${when} por ${who}. Motivo: ${reason}`,
  unknownUser: 'un usuario',
  card: 'Tarjeta de implante',
  cardHint: (date: string) => `de la intervención del ${date} (se abre en otra pestaña)`,
  void: 'Anular',
  voidHint: (kind: string, tooth: string) => `${kind.toLowerCase()} del diente ${tooth}`,
};

interface PatientImplantsTabProps {
  token: string;
  patientId: string;
  /** Diente del acceso directo (odontograma o plan): abre el formulario con él. */
  registerTooth?: string | null;
  /** Ítem del plan del acceso directo. */
  registerPlanItemId?: string | null;
  /** Avisa de que el acceso directo ya se usó (la página limpia la URL). */
  onShortcutConsumed?: () => void;
}

function TabSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

/**
 * Sección «Implantes» de la ficha (DX-191), para los cuatro roles: la lista por
 * diente con fecha, REF y lote (los anulados, tachados con quién, cuándo y por
 * qué) y la tarjeta imprimible de cada intervención. Registrar y anular, solo
 * odontólogo y ADMIN. Sin editar ni borrar: el registro es inalterable.
 */
export function PatientImplantsTab({
  token,
  patientId,
  registerTooth = null,
  registerPlanItemId = null,
  onShortcutConsumed,
}: PatientImplantsTabProps) {
  const role = getTokenRole(token);
  const userId = getTokenUserId(token);
  const canRegister = canRegisterImplants(role);
  const [implants, setImplants] = useState<PatientImplant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const shortcut = canRegister && (registerTooth !== null || registerPlanItemId !== null);
  const [registering, setRegistering] = useState(shortcut);
  const [modalKey, setModalKey] = useState(0);
  const [prefill, setPrefill] = useState({
    tooth: shortcut ? registerTooth : null,
    planItemId: shortcut ? registerPlanItemId : null,
  });
  const [voiding, setVoiding] = useState<PatientImplant | null>(null);
  // G1-B: las medidas van con el formato de la sede de la pantalla; sin él, «—» y el aviso.
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientImplants(token, patientId);
        if (cancelled) return;
        setImplants(data);
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

  function openRegister() {
    setPrefill({ tooth: null, planItemId: null });
    setModalKey((k) => k + 1);
    setRegistering(true);
  }

  function handleRegisterOpenChange(open: boolean) {
    setRegistering(open);
    if (!open && (prefill.tooth !== null || prefill.planItemId !== null)) {
      onShortcutConsumed?.();
    }
  }

  function replace(updated: PatientImplant) {
    setImplants((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  const groups = groupImplantsByTooth(implants);

  function row(implant: PatientImplant) {
    const voided = implant.voidedAt !== null;
    const kind = IMPLANT_KIND_LABELS[implant.kind];
    const placed = formatCivilDate(implant.placedOn);
    const size = formatImplantSize(implant.diameterMm, implant.lengthMm, fmt);
    return (
      <li
        key={implant.id}
        data-status={voided ? 'VOIDED' : 'ACTIVE'}
        className="flex flex-col gap-3 border-b border-hairline px-4 py-3 [overflow-wrap:anywhere] last:border-0 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('font-medium text-ink', voided && 'text-muted line-through')}>
              {kind} · {implant.manufacturer}
              {implant.system ? ` ${implant.system}` : ''}
            </span>
            {voided ? <Badge variant="danger">{copy.voided}</Badge> : null}
          </div>
          <dl
            className={cn(
              'flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums',
              voided ? 'text-muted line-through' : 'text-ink',
            )}
          >
            <div className="flex gap-1">
              <dt className="text-muted">{copy.reference}</dt>
              <dd className="break-all">{implant.reference}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted">{copy.lot}</dt>
              <dd className="break-all">{implant.lot}</dd>
            </div>
            {size ? <dd>{size}</dd> : null}
          </dl>
          <p className="text-sm text-muted tabular-nums">
            {copy.placedBy(placed, implant.professionalName)}
          </p>
          {implant.cardDeliveredAt && !voided ? (
            <p className="text-xs text-muted">
              {copy.delivered(formatDateTime(implant.cardDeliveredAt))}
            </p>
          ) : null}
          {voided ? (
            <p className="text-xs text-ink">
              {copy.voidedDetail(
                formatDateTime(implant.voidedAt),
                implant.voidedByName ?? copy.unknownUser,
                implant.voidReason ?? '',
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
            <a href={implantCardPrintHref(patientId, implant.placedOn)} target="_blank" rel="noopener">
              <CreditCard aria-hidden />
              {copy.card}
              <span className="sr-only"> {copy.cardHint(placed)}</span>
            </a>
          </Button>
          {canVoidImplant(implant, { role, userId }) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setVoiding(implant)}
            >
              {copy.void}
              <span className="sr-only"> · {copy.voidHint(kind, implant.toothNumber)}</span>
            </Button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
        </div>
        {canRegister ? (
          <Button type="button" onClick={openRegister} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.register}
          </Button>
        ) : null}
      </div>

      {sedeFormat.status === 'error' ? (
        <SedeConfigError kind="locale" variant="note" onRetry={sedeFormat.retry} description={sedeFormat.message} locationId={sedeFormat.locationId} />
      ) : null}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={implants.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={canRegister ? copy.emptyHint : copy.emptyHintReadOnly}
        emptyIcon={<CreditCard aria-hidden />}
        skeleton={<TabSkeleton />}
      >
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section
              key={group.toothNumber}
              aria-labelledby={`implants-tooth-${group.toothNumber}`}
              className="flex flex-col gap-2"
            >
              <h3
                id={`implants-tooth-${group.toothNumber}`}
                className="t-label text-muted tabular-nums"
              >
                {copy.toothHeading(group.toothNumber)}
              </h3>
              <ul
                aria-label={copy.listLabel(group.toothNumber)}
                className="overflow-hidden rounded-lg border border-border bg-surface text-sm"
              >
                {group.implants.map(row)}
              </ul>
            </section>
          ))}
        </div>
      </AsyncSection>

      {canRegister ? (
        <RegisterImplantModal
          key={modalKey}
          open={registering}
          onOpenChange={handleRegisterOpenChange}
          token={token}
          patientId={patientId}
          initialTooth={prefill.tooth}
          treatmentPlanItemId={prefill.planItemId}
          onRegistered={(implant) => setImplants((prev) => [implant, ...prev])}
        />
      ) : null}
      {voiding ? (
        <VoidImplantModal
          key={voiding.id}
          open
          onOpenChange={(open) => {
            if (!open) setVoiding(null);
          }}
          token={token}
          implantId={voiding.id}
          onVoided={replace}
        />
      ) : null}
    </div>
  );
}
