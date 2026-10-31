'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageLocationCalendar } from '@/lib/locations/location-calendar';
import { countryName } from '@/lib/locations/countries';
import { locationCurrency, locationTimeZone } from '@/lib/locations/location-settings';
import { canonicalLocale, HOUR_CYCLE_LABELS, isHourCycle } from '@/lib/locations/regional-settings';
import { localeLabel, timeZoneLabel } from '@/lib/locations/regional-options';
import { phoneRegionLabel } from '@/lib/locations/phone-regions';
import { displayPhone } from '@/lib/phone/display-phone';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SettingRow, SettingRows, SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { LocationFormModal } from './location-form-modal';
import { LocationRegistrationForm } from './location-registration-form';
import { CancellationPolicySettings } from './cancellation-policy-settings';
import { isUnconfigured, locationsListCopy } from './locations-list';
import { needsRegionalReview } from './regional-review-notice';

export const locationDetailCopy = {
  back: { href: '/settings/sedes', label: 'Sedes' },
  loadingTitle: 'Sede',
  description: 'Sus datos, su configuración regional, su registro sanitario y, para administración, su política de cancelación.',
  loadError: 'No pudimos cargar la sede.',
  notFound: 'No encontramos esta sede',
  notFoundBody: 'Puede que la hayan borrado o que el enlace esté incompleto. Elígela en la lista de sedes.',
  backToList: 'Ver las sedes',
  dataHeading: 'Datos de la sede',
  dataSupport: 'Dirección y teléfono, y el país, la moneda, la zona, el formato y el reloj con los que trabaja.',
  address: 'Dirección',
  phone: 'Teléfono',
  phoneRegion: 'Prefijo telefónico por defecto',
  none: '—',
  calendarHeading: 'Calendario',
  calendarLabel: 'Días hábiles y festivos',
  calendarHelp: 'Para los plazos que se cuentan en días hábiles.',
  calendarOpen: 'Abrir',
  calendarFor: (name: string) => `Calendario ${name}`,
};

const copy = locationDetailCopy;
const listCopy = locationsListCopy;

/**
 * B6: la ficha de UNA sede (`/settings/sedes/[id]`). Sustituye la matriz
 * «atributo × sede» de antes —cuatro secciones que repetían todas las sedes,
 * cada fila con su «Guardar»—: aquí está todo lo de la sede, una sección por
 * tema, cada una con UN modelo de guardado (el modal de la sede, la barra
 * «Cambios sin guardar» del registro, el diálogo versionado de la política).
 */
export function LocationDetail({ token, locationId }: { token: string; locationId: string }) {
  const role = getTokenRole(token);
  const canEdit = role === 'ADMIN';
  const canOpenCalendar = canManageLocationCalendar(role);
  const requestLocations = useSessionLocations(token);
  const [location, setLocation] = useState<ClinicLocation | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await requestLocations();
        if (cancelled) return;
        const found = data.find((l) => l.id === locationId) ?? null;
        setLocation(found);
        setMissing(found === null);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [requestLocations, locationId, reloadKey]);

  const title = location?.name ?? copy.loadingTitle;
  const review = location ? needsRegionalReview(location) : false;

  return (
    <SettingsPage
      title={title}
      description={copy.description}
      back={copy.back}
      scope={
        location && (!location.isActive || isUnconfigured(location) || review) ? (
          <span className="flex flex-wrap gap-2">
            {location.isActive ? null : <Badge variant="neutral">{listCopy.inactive}</Badge>}
            {isUnconfigured(location) ? <Badge variant="warning">{listCopy.unconfigured}</Badge> : null}
            {review ? <Badge variant="warning">{listCopy.pendingReview}</Badge> : null}
          </span>
        ) : undefined
      }
    >
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
      >
        {missing || !location ? (
          <EmptyState
            title={copy.notFound}
            description={copy.notFoundBody}
            action={
              <Button asChild variant="secondary">
                <Link href={copy.back.href}>{copy.backToList}</Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-10">
            <SettingsSection
              title={copy.dataHeading}
              description={copy.dataSupport}
              actions={
                canEdit ? (
                  // Aviso D5: guardar el modal, aunque no cambie nada, confirma la sede.
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditing(true)}
                    aria-label={review ? listCopy.reviewFor(location.name) : listCopy.editFor(location.name)}
                    className="max-sm:w-full"
                  >
                    <Pencil aria-hidden />
                    {review ? listCopy.review : listCopy.edit}
                  </Button>
                ) : null
              }
            >
              <LocationFacts location={location} />
            </SettingsSection>

            <LocationRegistrationForm
              key={location.id}
              token={token}
              location={location}
              canEdit={canEdit}
              onSaved={(saved) => setLocation(saved)}
            />

            {/* DX-279: solo ADMIN (la API responde 403 al resto). */}
            {canEdit ? <CancellationPolicySettings token={token} locationId={location.id} /> : null}

            {/* DX-316: el calendario sigue su propia regla (la de la API). */}
            {canOpenCalendar ? (
              <SettingsSection title={copy.calendarHeading}>
                <SettingRows>
                  <SettingRow
                    label={copy.calendarLabel}
                    description={copy.calendarHelp}
                    action={
                      <Button asChild variant="secondary" className="max-sm:w-full">
                        <Link
                          href={`/settings/calendario?sede=${encodeURIComponent(location.id)}`}
                          aria-label={copy.calendarFor(location.name)}
                        >
                          {copy.calendarOpen}
                        </Link>
                      </Button>
                    }
                  />
                </SettingRows>
              </SettingsSection>
            ) : null}
          </div>
        )}
      </AsyncSection>
      {editing && location ? (
        <LocationFormModal
          open
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
          token={token}
          location={location}
          onSaved={(saved) => setLocation(saved)}
        />
      ) : null}
    </SettingsPage>
  );
}

/** Los datos de la sede con nombres legibles (zona con su desfase y ciudad, formato con su idioma), no códigos. */
function LocationFacts({ location }: { location: ClinicLocation }) {
  const zoneOk = locationTimeZone(location) !== null;
  const localeOk = canonicalLocale(location.locale) !== null;
  const value = (raw: string | null, usable: boolean, format: (v: string) => string) =>
    raw === null ? listCopy.missing : usable ? format(raw) : listCopy.unusable(raw);
  const warn = (raw: string | null, usable: boolean) => (raw === null || !usable ? 'text-warning-text' : undefined);
  return (
    <DescriptionList columns={2} className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <DescriptionItem label={copy.address}>{location.address || copy.none}</DescriptionItem>
      <DescriptionItem label={copy.phone} numeric>
        {displayPhone(location) ?? copy.none}
      </DescriptionItem>
      <DescriptionItem label={copy.phoneRegion}>
        {phoneRegionLabel(location.defaultPhoneRegion ?? null) ?? copy.none}
      </DescriptionItem>
      <DescriptionItem label={listCopy.country}>{countryName(location.country) ?? listCopy.missing}</DescriptionItem>
      <DescriptionItem
        label={listCopy.currency}
        valueClassName={warn(location.currency, locationCurrency(location) !== null)}
      >
        {value(location.currency, locationCurrency(location) !== null, (v) => v)}
      </DescriptionItem>
      <DescriptionItem label={listCopy.timeZone} valueClassName={warn(location.timeZone, zoneOk)}>
        {value(location.timeZone, zoneOk, (v) => timeZoneLabel(v))}
      </DescriptionItem>
      <DescriptionItem label={listCopy.locale} valueClassName={warn(location.locale, localeOk)}>
        {value(location.locale, localeOk, (v) => localeLabel(v))}
      </DescriptionItem>
      <DescriptionItem label={listCopy.hourCycle}>
        {isHourCycle(location.hourCycle) ? HOUR_CYCLE_LABELS[location.hourCycle] : listCopy.missing}
      </DescriptionItem>
    </DescriptionList>
  );
}
