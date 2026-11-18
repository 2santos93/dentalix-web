'use client';
import { useEffect, useState } from 'react';
import { Laptop, MonitorSmartphone, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import {
  listMySessions,
  listStaffSessions,
  revokeAllStaffSessions,
  revokeMyOtherSessions,
  revokeMySession,
  revokeStaffSession,
  type UserSession,
} from '@/lib/auth/sessions-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';

export const sessionListCopy = {
  loading: 'Cargando sesiones…',
  loadError: 'No pudimos cargar las sesiones.',
  thisDevice: 'Este dispositivo',
  network: (prefix: string) => `Red ${prefix}`,
  lastActivity: (when: string) => `Última actividad: ${when}`,
  since: (when: string) => `Entró: ${when}`,
  close: 'Cerrar',
  closeNamed: (label: string) => `Cerrar la sesión de ${label}`,
  closeThis: 'Cerrar sesión',
  closeOthers: 'Cerrar todas las demás',
  closeAll: 'Cerrar todas',
  closed: 'Sesión cerrada. Ese dispositivo tendrá que volver a entrar.',
  closedMany: (n: number) => (n === 1 ? 'Cerramos 1 sesión.' : `Cerramos ${n} sesiones.`),
  closeError: 'No pudimos cerrar la sesión. Intenta de nuevo.',
  emptySelf: 'No hay otras sesiones abiertas.',
  emptyMember: 'No tiene sesiones abiertas en esta clínica.',
  emptyMemberHelp: 'Cuando entre desde un navegador, aparecerá aquí.',
};

function DeviceIcon({ label }: { label: string }) {
  const Icon = /iOS|Android/.test(label) ? Smartphone : /Windows|macOS|Linux/.test(label) ? Laptop : MonitorSmartphone;
  return <Icon aria-hidden className="size-4 shrink-0 text-muted" />;
}

type SessionListProps =
  | {
      /** «Mi perfil › Sesiones»: las propias. */
      mode: 'self';
      token: string;
      /** Cerrar la actual es salir (el mismo cierre que el menú de cuenta). */
      onCloseCurrent: () => void;
    }
  | {
      /** Ficha de un miembro (solo ADMIN). */
      mode: 'member';
      token: string;
      userId: string;
      memberName: string;
    };

/**
 * DX-137: las sesiones abiertas EN ESTA clínica — navegador y sistema, la red
 * (IP truncada) y la última actividad en el reloj de la sede —, con
 * «Este dispositivo» marcado. Cerrar una la corta en su próxima renovación.
 * Estados: carga (esqueleto), vacío, error (escalón 1, con «Reintentar»).
 */
export function SessionList(props: SessionListProps) {
  const { token } = props;
  const memberId = props.mode === 'member' ? props.userId : null;
  const stamp = useSedeStamp(token);
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset antes de pedir: setState-en-effect intencional (patrón de profile-view).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false);
    setSessions(null);
    (memberId ? listStaffSessions(token, memberId) : listMySessions(token))
      .then((res) => {
        if (!cancelled) setSessions(res);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // El token se renueva cada pocos minutos y no cambia la lista: solo al
    // montar, al reintentar y si cambia el miembro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, reloadKey]);

  async function closeOne(session: UserSession) {
    if (props.mode === 'self' && session.current) {
      props.onCloseCurrent();
      return;
    }
    setBusy(session.id);
    try {
      if (memberId) await revokeStaffSession(token, memberId, session.id);
      else await revokeMySession(token, session.id);
      setSessions((list) => (list ?? []).filter((s) => s.id !== session.id));
      toast.success(sessionListCopy.closed);
    } catch (err) {
      notifyError(apiErrorMessage(err, sessionListCopy.closeError));
    } finally {
      setBusy(null);
    }
  }

  async function closeMany() {
    setBusy('all');
    try {
      const closed = memberId ? await revokeAllStaffSessions(token, memberId) : await revokeMyOtherSessions(token);
      setSessions((list) => (memberId ? [] : (list ?? []).filter((s) => s.current)));
      toast.success(sessionListCopy.closedMany(closed));
    } catch (err) {
      notifyError(apiErrorMessage(err, sessionListCopy.closeError));
    } finally {
      setBusy(null);
    }
  }

  if (failed) {
    return <SectionError description={sessionListCopy.loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (sessions === null) {
    return (
      <div role="status" aria-label={sessionListCopy.loading} className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  const others = sessions.filter((s) => !s.current);
  if (sessions.length === 0) {
    return (
      <EmptyState
        size="inline"
        title={props.mode === 'member' ? sessionListCopy.emptyMember : sessionListCopy.emptySelf}
        description={props.mode === 'member' ? sessionListCopy.emptyMemberHelp : undefined}
      />
    );
  }
  const manyLabel = props.mode === 'member' ? sessionListCopy.closeAll : sessionListCopy.closeOthers;

  return (
    <div className="flex flex-col gap-3">
      <SedeStampNote stamp={stamp} />
      <SettingRows>
        {sessions.map((session) => {
          const meta = [
            session.ipPrefix ? sessionListCopy.network(session.ipPrefix) : null,
            sessionListCopy.lastActivity(stamp.dateTime(session.lastSeenAt)),
            sessionListCopy.since(stamp.dateTime(session.firstSeenAt)),
          ].filter(Boolean);
          return (
            <SettingRow
              key={session.id}
              label={
                <span className="flex flex-wrap items-center gap-2">
                  <DeviceIcon label={session.deviceLabel} />
                  {session.deviceLabel}
                  {session.current ? <Badge variant="primary">{sessionListCopy.thisDevice}</Badge> : null}
                </span>
              }
              description={<span className="tnum">{meta.join(' · ')}</span>}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={
                    session.current && props.mode === 'self'
                      ? sessionListCopy.closeThis
                      : sessionListCopy.closeNamed(session.deviceLabel)
                  }
                  loading={busy === session.id}
                  disabled={busy !== null}
                  onClick={() => void closeOne(session)}
                >
                  {session.current && props.mode === 'self' ? sessionListCopy.closeThis : sessionListCopy.close}
                </Button>
              }
            />
          );
        })}
      </SettingRows>
      {(props.mode === 'member' ? sessions.length > 0 : others.length > 0) ? (
        <div>
          <Button
            type="button"
            variant="destructive-ghost"
            loading={busy === 'all'}
            disabled={busy !== null}
            onClick={() => void closeMany()}
          >
            {manyLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
