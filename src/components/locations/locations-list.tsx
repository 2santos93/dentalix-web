'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { COUNTRY_LABELS } from '@/lib/prescriptions/prescriptions-api';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocationFormModal } from './location-form-modal';

export const locationsListCopy = {
  heading: 'Sedes',
  support: 'País, moneda, zona horaria y formato de cada sede. Deciden la caja, la agenda y los documentos.',
  create: 'Nueva sede',
  edit: 'Editar',
  editFor: (name: string) => `Editar ${name}`,
  country: 'País',
  currency: 'Moneda',
  timeZone: 'Zona horaria',
  locale: 'Formato',
  missing: 'Por configurar',
  unconfigured: 'Por configurar',
  active: 'Activa',
  inactive: 'Inactiva',
  loadError: 'No pudimos cargar las sedes.',
  empty: 'Todavía no hay sedes.',
};

const copy = locationsListCopy;

/** Una sede a la que le falta moneda, zona o formato (fila de una réplica antigua, spec §5). */
export function isUnconfigured(location: ClinicLocation): boolean {
  return location.currency === null || location.timeZone === null || location.locale === null;
}

interface LocationsListProps {
  token: string;
  /** Solo ADMIN da de alta y edita (la API responde 403 al resto). */
  canEdit: boolean;
  /** Abre el modal de esa sede al cargar (enlace «Configurar sede», solo ADMIN). */
  initialEditId?: string | null;
}

/** Modal abierto: `null` = cerrado; `'new'` = alta; una sede = edición. */
type ModalTarget = null | 'new' | ClinicLocation;

/**
 * Sección «Sedes» de Ajustes → Sedes (G1, spec §6.3): la lista con su país,
 * moneda, zona y formato, y para ADMIN «Nueva sede» y «Editar». Una sede sin
 * configurar sale «Por configurar» y su modal la completa.
 */
export function LocationsList({ token, canEdit, initialEditId = null }: LocationsListProps) {
  const requestLocations = useSessionLocations(token);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [target, setTarget] = useState<ModalTarget>(null);
  // Cada apertura estrena el estado del modal.
  const [modalKey, setModalKey] = useState(0);
  const deepLinkUsed = useRef(false);

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
          }
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
        <div>
          <h2 id="locations-heading" className="text-lg font-semibold text-ink">
            {copy.heading}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={() => openModal('new')} className="w-full sm:w-auto">
            <Plus aria-hidden="true" className="size-4" />
            {copy.create}
          </Button>
        ) : null}
      </div>
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
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface">
          {locations.map((location) => (
            <li
              key={location.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{location.name}</span>
                  <Badge variant={location.isActive ? 'secondary' : 'muted'}>
                    {location.isActive ? copy.active : copy.inactive}
                  </Badge>
                  {isUnconfigured(location) ? <Badge variant="warning">{copy.unconfigured}</Badge> : null}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <Detail label={copy.country} value={COUNTRY_LABELS[location.country]} />
                  <Detail label={copy.currency} value={location.currency} />
                  <Detail label={copy.timeZone} value={location.timeZone} />
                  <Detail label={copy.locale} value={location.locale} />
                </dl>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openModal(location)}
                  aria-label={copy.editFor(location.name)}
                  className="self-start sm:self-center"
                >
                  {copy.edit}
                </Button>
              ) : null}
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

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={value ? 'truncate text-ink' : 'text-warning'}>{value ?? copy.missing}</dd>
    </div>
  );
}
