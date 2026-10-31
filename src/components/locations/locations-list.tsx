'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { countryName } from '@/lib/locations/countries';
import { locationCurrency, locationTimeZone } from '@/lib/locations/location-settings';
import { canonicalLocale, HOUR_CYCLE_LABELS, isHourCycle } from '@/lib/locations/regional-settings';
import { localeName, timeZoneLabel } from '@/lib/locations/regional-options';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocationFormModal } from './location-form-modal';
import { needsRegionalReview } from './regional-review-notice';
import { DescriptionItem } from '@/components/ui/description-list';

export const locationsListCopy = {
  // La página ya se titula «Sedes»: la sección no lo repite.
  heading: 'Sedes de la clínica',
  open: (name: string) => `Abrir ${name}`,
  create: 'Nueva sede',
  edit: 'Editar',
  editFor: (name: string) => `Editar ${name}`,
  review: 'Revisar',
  reviewFor: (name: string) => `Revisar ${name}`,
  pendingReview: 'Por revisar',
  country: 'País',
  currency: 'Moneda',
  timeZone: 'Zona horaria',
  locale: 'Formato regional',
  hourCycle: 'Reloj',
  missing: 'Por configurar',
  unusable: (value: string) => `${value} (no válido)`,
  linkNotFound: 'No encontramos la sede del enlace: elígela en la lista.',
  unconfigured: 'Por configurar',
  active: 'Activa',
  inactive: 'Inactiva',
  loadError: 'No pudimos cargar las sedes.',
  empty: 'Todavía no hay sedes.',
};

const copy = locationsListCopy;

/**
 * Una sede sin moneda, zona, formato o reloj utilizables: le falta alguno
 * (fila de una réplica antigua) o el navegador no lo reconoce (zona de otro
 * ICU, spec §5). La misma regla que las pantallas que muestran `SedeConfigError`.
 */
export function isUnconfigured(location: ClinicLocation): boolean {
  return (
    locationCurrency(location) === null ||
    locationTimeZone(location) === null ||
    canonicalLocale(location.locale) === null ||
    !isHourCycle(location.hourCycle)
  );
}

interface LocationsListProps {
  token: string;
  /** Solo ADMIN da de alta y edita (la API responde 403 al resto). */
  canEdit: boolean;
  /** Abre el modal de esa sede al cargar (enlace «Configurar sede», solo ADMIN). */
  initialEditId?: string | null;
  /** El enlace ya se usó: la página lo quita de la URL (volver atrás no reabre el modal). */
  onInitialEditConsumed?: () => void;
}

/** Modal abierto: `null` = cerrado; `'new'` = alta; una sede = edición. */
type ModalTarget = null | 'new' | ClinicLocation;

/**
 * Sección «Sedes» de Ajustes → Sedes (G1, spec §6.3): la lista con su país,
 * moneda, zona y formato, y para ADMIN «Nueva sede» y «Editar». Una sede sin
 * configurar sale «Por configurar» y su modal la completa; una activa sin
 * confirmar (aviso D5) sale «Por revisar» y su botón «Revisar» abre el modal.
 */
export function LocationsList({
  token,
  canEdit,
  initialEditId = null,
  onInitialEditConsumed,
}: LocationsListProps) {
  const requestLocations = useSessionLocations(token);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [target, setTarget] = useState<ModalTarget>(null);
  // Cada apertura estrena el estado del modal.
  const [modalKey, setModalKey] = useState(0);
  const deepLinkUsed = useRef(false);
  const [linkNotFound, setLinkNotFound] = useState(false);
  const consumedRef = useRef(onInitialEditConsumed);
  useEffect(() => {
    consumedRef.current = onInitialEditConsumed;
  });

  useEffect(() => {
    let cancelled = false;
    // Sin «cargando» al releer tras guardar: la lista sigue a la vista.
    async function load() {
      try {
        const data = await requestLocations();
        if (cancelled) return;
        setLocations(data);
        setError(null);
        if (canEdit && initialEditId && !deepLinkUsed.current) {
          deepLinkUsed.current = true;
          const linked = data.find((l) => l.id === initialEditId);
          if (linked) {
            setModalKey((k) => k + 1);
            setTarget(linked);
          } else {
            setLinkNotFound(true);
          }
          consumedRef.current?.();
        }
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
  }, [requestLocations, reloadKey, canEdit, initialEditId]);

  function openModal(next: Exclude<ModalTarget, null>) {
    setModalKey((k) => k + 1);
    setTarget(next);
  }

  function handleSaved(saved: ClinicLocation) {
    // El modal también invalida la lectura de la sesión (el selector de sede se
    // entera); esto deja la lista al día aunque no haya proveedor.
    setLocations((prev) =>
      prev.some((l) => l.id === saved.id) ? prev.map((l) => (l.id === saved.id ? saved : l)) : [...prev, saved],
    );
  }

  return (
    <section aria-labelledby="locations-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="locations-heading" className="t-title text-ink">
            {copy.heading}
          </h2>
        </div>
        {canEdit ? (
          <Button type="button" onClick={() => openModal('new')} className="w-full sm:w-auto">
            <Plus aria-hidden="true" className="size-4" />
            {copy.create}
          </Button>
        ) : null}
      </div>
      {linkNotFound ? (
        <p role="status" className="text-sm text-muted">
          {copy.linkNotFound}
        </p>
      ) : null}
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
        isEmpty={locations.length === 0}
        emptyTitle={copy.empty}
      >
        <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
          {locations.map((location) => (
            <li
              key={location.id}
              className="relative flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* El nombre abre la ficha de la sede; el enlace se estira
                      sobre la fila (el botón de editar queda por encima). */}
                  <Link
                    href={`/settings/sedes/${encodeURIComponent(location.id)}`}
                    aria-label={copy.open(location.name)}
                    className="font-medium text-ink after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                  >
                    {location.name}
                  </Link>
                  {/* Solo la excepción lleva chip: «Activa» en todas no dice nada. */}
                  {location.isActive ? null : <Badge variant="neutral">{copy.inactive}</Badge>}
                  {isUnconfigured(location) ? <Badge variant="warning">{copy.unconfigured}</Badge> : null}
                  {needsRegionalReview(location) ? <Badge variant="warning">{copy.pendingReview}</Badge> : null}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-5">
                  <Detail label={copy.country} value={countryName(location.country)} />
                  <Detail label={copy.currency} value={location.currency} usable={locationCurrency(location) !== null} />
                  <Detail
                    label={copy.timeZone}
                    value={location.timeZone}
                    usable={locationTimeZone(location) !== null}
                    format={timeZoneLabel}
                  />
                  <Detail
                    label={copy.locale}
                    value={location.locale}
                    usable={canonicalLocale(location.locale) !== null}
                    format={(v) => localeName(canonicalLocale(v) ?? v)}
                  />
                  <Detail
                    label={copy.hourCycle}
                    value={isHourCycle(location.hourCycle) ? HOUR_CYCLE_LABELS[location.hourCycle] : null}
                  />
                </dl>
              </div>
              <div className="relative z-10 flex shrink-0 items-center gap-2 self-start sm:self-center">
                {canEdit ? (
                  // Aviso D5: guardar el modal, aunque no cambie nada, confirma la sede.
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openModal(location)}
                    aria-label={needsRegionalReview(location) ? copy.reviewFor(location.name) : copy.editFor(location.name)}
                    className="max-sm:min-h-11"
                  >
                    {needsRegionalReview(location) ? copy.review : copy.edit}
                  </Button>
                ) : null}
                <ChevronRight aria-hidden className="hidden size-4 text-muted sm:block" />
              </div>
            </li>
          ))}
        </ul>
      </AsyncSection>
      {target !== null ? (
        <LocationFormModal
          key={modalKey}
          open
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
          token={token}
          location={target === 'new' ? null : target}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}

function Detail({
  label,
  value,
  usable = true,
  format,
}: {
  label: string;
  value: string | null;
  usable?: boolean;
  /** Nombre legible del valor (la zona con su desfase y ciudad, el idioma del formato), no el código. */
  format?: (value: string) => string;
}) {
  // Un valor guardado que no se puede usar se enseña tal cual, en tono de aviso.
  const text = value === null ? copy.missing : usable ? (format ? format(value) : value) : copy.unusable(value);
  return (
    <DescriptionItem
      label={label}
      className="gap-0"
      valueClassName={value !== null && usable ? 'break-words' : 'text-warning-text'}
    >
      {text}
    </DescriptionItem>
  );
}
