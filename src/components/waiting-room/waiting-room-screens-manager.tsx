'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Ban, Lock, MonitorPlay, Pencil, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listWaitingRoomScreens,
  revokeWaitingRoomScreen,
  type WaitingRoomNameMode,
  type WaitingRoomScreen,
} from '@/lib/waiting-room/waiting-room-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { AsyncSection } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { SettingsSection } from '@/components/settings/settings-page';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { WaitingRoomScreenFormModal } from './waiting-room-screen-form-modal';

export const screensManagerCopy = {
  location: 'Sede',
  newScreen: 'Nueva pantalla',
  count: (n: number) => (n === 1 ? '1 pantalla activa' : `${n} pantallas activas`),
  empty: 'Esta sede no tiene pantallas',
  emptyHint:
    'Crea una para poner en el televisor de la sala quién espera y a quién llaman. Se abre con un enlace propio, sin iniciar sesión.',
  createScreen: 'Crear pantalla',
  loadError: 'No pudimos cargar las pantallas de la sede.',
  forbiddenTitle: 'Solo administración gestiona las pantallas de sala de espera.',
  forbiddenHint: 'Pide a un administrador que cree el enlace para el televisor.',
  noLocations: 'Todavía no hay sedes.',
  noLocationsHint: 'Crea una sede para configurar sus pantallas.',
  tableLabel: 'Pantallas de la sede',
  colName: 'Pantalla',
  colMode: 'Nombre visible',
  colDetails: 'Franja y sonido',
  modes: { NAME_INITIAL: 'Nombre e inicial', TURN_NUMBER: 'Número de turno' } satisfies Record<
    WaitingRoomNameMode,
    string
  >,
  details: (messages: number, sound: boolean) =>
    [
      messages === 0 ? 'Sin mensajes' : messages === 1 ? '1 mensaje' : `${messages} mensajes`,
      sound ? 'con aviso sonoro' : 'sin sonido',
    ].join(' · '),
  edit: 'Editar',
  revoke: 'Revocar',
  revokeTitle: (name: string) => `¿Revocar «${name}»?`,
  revokeHint:
    'El enlace deja de funcionar al momento: el televisor mostrará «Esta pantalla ya no está activa» en su siguiente actualización. No se puede deshacer; para volver a usar el televisor, crea otra pantalla.',
  revokeConfirm: 'Revocar pantalla',
  revokeError: (name: string) => `No pudimos revocar «${name}».`,
  revoked: (name: string) => `«${name}» revocada.`,
  saved: (name: string) => `Pantalla «${name}» guardada.`,
  revokedSection: 'Revocadas',
  revokedSectionHint: 'Ya no muestran nada; quedan aquí como registro.',
  revokedTableLabel: 'Pantallas revocadas',
  revokedBadge: 'Revocada',
  revokedOn: (date: string) => `Revocada el ${date}`,
  helpTitle: 'Cómo ponerla en el televisor',
  helpHint: 'Lo recomendado arranca solo cada mañana y no deja que el televisor apague la pantalla.',
  helpSteps: [
    'Recomendado: un Fire TV Stick o un Google TV con un navegador en modo quiosco (por ejemplo, Fully Kiosk Browser) que abra el enlace al encender.',
    'Alternativas: el navegador del propio Smart TV, o un mini PC con Chrome en modo quiosco.',
    'Abre el enlace escaneando el QR o pegándolo al crear la pantalla. Se ve a pantalla completa, sin ratón ni teclado.',
    'No lo transmitas desde el ordenador de recepción: se cortaría al usarlo y podría enseñar otras pantallas.',
  ],
};
const copy = screensManagerCopy;

interface WaitingRoomScreensManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol). */
  allowed: boolean;
  locations: ClinicLocation[];
  /** La sede activa del selector del shell, si hay una. */
  initialLocationId: string | null;
}

/**
 * Ajustes › Pantallas de sala de espera (DX-588): las pantallas de una sede
 * (se elige arriba si hay varias): crear (el enlace se ve una vez), editar
 * nombre, modo, mensajes y sonido, y revocar. Las revocadas van aparte.
 */
export function WaitingRoomScreensManager({
  token,
  allowed,
  locations,
  initialLocationId,
}: WaitingRoomScreensManagerProps) {
  const [locationId, setLocationId] = useState(
    () => locations.find((l) => l.id === initialLocationId)?.id ?? locations[0]?.id ?? '',
  );
  const [screens, setScreens] = useState<WaitingRoomScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<WaitingRoomScreen | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [revoking, setRevoking] = useState<WaitingRoomScreen | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const stamp = useSedeStamp(token);

  useEffect(() => {
    if (!allowed || !locationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listWaitingRoomScreens(token, locationId);
        if (cancelled) return;
        setScreens(data);
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
  }, [token, allowed, locationId, reloadKey]);

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }
  if (locations.length === 0) {
    return <EmptyState title={copy.noLocations} description={copy.noLocationsHint} />;
  }

  const active = screens.filter((s) => s.revokedAt === null);
  const revoked = screens.filter((s) => s.revokedAt !== null);

  function openModal(screen: WaitingRoomScreen | null) {
    setEditing(screen);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: WaitingRoomScreen) {
    // Una pantalla creada en otra sede (el modal deja elegirla) no es de esta lista.
    if (saved.locationId === locationId) {
      setScreens((prev) => {
        const exists = prev.some((s) => s.id === saved.id);
        return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
      });
    }
    setAnnouncement(copy.saved(saved.name));
  }

  async function confirmRevoke() {
    if (!revoking) return;
    const screen = revoking;
    setRevoking(null);
    setPendingId(screen.id);
    try {
      const saved = await revokeWaitingRoomScreen(token, screen.id);
      setScreens((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      setAnnouncement(copy.revoked(saved.name));
    } catch {
      notifyError(copy.revokeError(screen.name), { onRetry: () => setRevoking(screen) });
    } finally {
      setPendingId(null);
    }
  }

  const columns: DataListColumn<WaitingRoomScreen>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (s) => <span className="font-medium">{s.name}</span>,
    },
    { id: 'mode', header: copy.colMode, cell: (s) => copy.modes[s.nameMode] },
    {
      id: 'details',
      header: copy.colDetails,
      cell: (s) => <span className="text-muted">{copy.details(s.messages.length, s.soundEnabled)}</span>,
    },
  ];

  const revokedColumns: DataListColumn<WaitingRoomScreen>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (s) => <span className="text-muted">{s.name}</span>,
    },
    {
      id: 'revokedAt',
      header: copy.revokedBadge,
      mobile: 'trailing',
      cell: (s) => (
        <Badge variant="neutral" className="tabular-nums">
          {s.revokedAt ? copy.revokedOn(stamp.date(s.revokedAt, s.locationId)) : copy.revokedBadge}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {locations.length > 1 ? (
            <FormField htmlFor="waiting-room-location" label={copy.location} className="sm:w-72">
              <NativeSelect
                id="waiting-room-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : (
            <span />
          )}
          <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newScreen}
          </Button>
        </div>
        <p className="text-sm text-muted tabular-nums empty:hidden">
          {loading || error || active.length === 0 ? '' : copy.count(active.length)}
        </p>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={active.length === 0}
          emptyTitle={copy.empty}
          emptyDescription={copy.emptyHint}
          emptyIcon={<MonitorPlay aria-hidden />}
          emptyAction={
            <Button type="button" onClick={() => openModal(null)}>
              <Plus aria-hidden /> {copy.createScreen}
            </Button>
          }
        >
          <DataList
            label={copy.tableLabel}
            rows={active}
            columns={columns}
            getRowKey={(s) => s.id}
            getRowLabel={(s) => s.name}
            rowActions={(s) => [
              { label: copy.edit, icon: <Pencil />, onSelect: () => openModal(s) },
              {
                label: copy.revoke,
                icon: <Ban />,
                onSelect: () => setRevoking(s),
                destructive: true,
                disabled: pendingId !== null,
                separatorBefore: true,
              },
            ]}
          />
        </AsyncSection>
      </div>

      {!loading && !error && revoked.length > 0 ? (
        <SettingsSection title={copy.revokedSection} description={copy.revokedSectionHint}>
          <DataList
            label={copy.revokedTableLabel}
            rows={revoked}
            columns={revokedColumns}
            getRowKey={(s) => s.id}
            getRowLabel={(s) => s.name}
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title={copy.helpTitle} description={copy.helpHint}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink marker:text-muted">
          {copy.helpSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </SettingsSection>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={revoking ? copy.revokeTitle(revoking.name) : ''}
        description={copy.revokeHint}
        confirmLabel={copy.revokeConfirm}
        onConfirm={() => void confirmRevoke()}
        destructive
      />

      <WaitingRoomScreenFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        locations={locations}
        locationId={locationId}
        screen={editing}
        onSaved={upsert}
      />
    </div>
  );
}
