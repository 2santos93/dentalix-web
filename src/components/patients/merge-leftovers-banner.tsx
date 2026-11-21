'use client';
import { useEffect, useState } from 'react';
import { FileStack } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import {
  leftoverLines,
  listMergeLeftovers,
  moveMergeLeftovers,
  type MergeLeftover,
} from '@/lib/patients/patient-merge-api';
import { notifySuccess } from '@/components/errors/notify';
import { SectionError } from '@/components/errors/section-error';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

const records = (n: number) => `${n} ${n === 1 ? 'registro' : 'registros'}`;
const joinLines = (lines: string[]) =>
  lines.length <= 1 ? (lines[0] ?? '') : `${lines.slice(0, -1).join(', ')} y ${lines[lines.length - 1]}`;

export const mergeLeftoversCopy = {
  title: (n: number, name: string) =>
    `${n === 1 ? 'Quedó' : 'Quedaron'} ${records(n)} en la ficha de ${name}, que se fusionó con esta`,
  body: (lines: string, date: string | null) =>
    `Se guardaron allí en el mismo momento de la fusión${date ? ` del ${date}` : ''}: ${lines}. ` +
    'Pásalos a esta ficha para que se vean aquí.',
  action: 'Pasar a esta ficha',
  confirmTitle: '¿Pasar los registros a esta ficha?',
  confirmDescription: (lines: string, name: string) =>
    `${lines[0].toUpperCase()}${lines.slice(1)} de la ficha fusionada de ${name} pasan a esta ficha, sin cambiar ` +
    'su contenido. Si desde esa ficha se envió un enlace (receta, firma, pago…), deja de funcionar: vuelve a ' +
    'enviarlo desde aquí.',
  confirm: 'Pasar a esta ficha',
  confirming: 'Pasando…',
  moved: (n: number) => `${n === 1 ? 'Se pasó' : 'Se pasaron'} ${records(n)} a esta ficha.`,
  nothing: 'Ya no quedaba nada por pasar: todo está en esta ficha.',
  loadError: 'No pudimos comprobar si quedaron registros en una ficha fusionada con esta.',
  moveError: 'No pudimos pasar los registros. Intenta de nuevo.',
};
const copy = mergeLeftoversCopy;

type State =
  | { key: string; kind: 'loading' }
  | { key: string; kind: 'error'; message: string }
  | { key: string; kind: 'ready'; items: MergeLeftover[] };

interface MergeLeftoversBannerProps {
  token: string;
  /** El paciente de la ficha: el que se conservó en la fusión. */
  patientId: string;
  stamp: SedePainters;
  /** Tras pasar los registros: la ficha se vuelve a leer entera. */
  onMoved: () => void;
}

/**
 * DX-266-bis: solo ADMIN (la página no lo monta para otros roles y la API da
 * 403). Una escritura que llegó en el mismo instante que una fusión se quedó
 * en la ficha absorbida, que ya no se ve (redirige aquí): este aviso lo dice
 * y la pasa a esta ficha. Casi siempre no pinta nada. Un 403/404 no pinta
 * nada; otro fallo, el aviso de error con «Reintentar» (escalón 1).
 */
export function MergeLeftoversBanner({ token, patientId, stamp, onMoved }: MergeLeftoversBannerProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${patientId}:${reloadKey}`;
  const [state, setState] = useState<State>({ key, kind: 'loading' });
  const [confirming, setConfirming] = useState<MergeLeftover | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMergeLeftovers(token, patientId)
      .then((items) => {
        if (!cancelled) setState({ key, kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setState({ key, kind: 'ready', items: [] });
        } else {
          setState({ key, kind: 'error', message: apiErrorMessage(err, { fallback: copy.loadError }) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, key]);

  async function move(item: MergeLeftover) {
    setBusy(true);
    setMoveError(null);
    try {
      const result = await moveMergeLeftovers(token, item.absorbedPatientId);
      // Los recomendados (DX-172) cuentan en `resolved` (referralsMoved).
      const moved =
        result.moved.reduce((sum, m) => sum + m.count, 0) + result.resolved.reduce((sum, r) => sum + r.count, 0);
      setConfirming(null);
      notifySuccess(moved > 0 ? copy.moved(moved) : copy.nothing);
      onMoved();
    } catch (err) {
      setMoveError(apiErrorMessage(err, { fallback: copy.moveError }));
    } finally {
      setBusy(false);
    }
  }

  const current: State = state.key === key ? state : { key, kind: 'loading' };
  if (current.kind === 'error') {
    return <SectionError description={current.message} onRetry={() => setReloadKey((k) => k + 1)} className="py-8" />;
  }
  if (current.kind !== 'ready' || current.items.length === 0) return null;

  return (
    <>
      {current.items.map((item) => {
        const name = `${item.firstName} ${item.lastName}`;
        const lines = joinLines(leftoverLines(item.categories));
        return (
          <Callout
            key={item.absorbedPatientId}
            tone="warning"
            icon={FileStack}
            titleAs="h2"
            title={copy.title(item.total, name)}
            data-testid="merge-leftovers-banner"
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMoveError(null);
                  setConfirming(item);
                }}
                className="max-sm:min-h-11 max-sm:w-full"
              >
                {copy.action}
              </Button>
            }
          >
            {copy.body(lines, stamp.maybe.date(item.mergedAt))}
          </Callout>
        );
      })}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirming(null);
        }}
        title={copy.confirmTitle}
        description={
          confirming
            ? copy.confirmDescription(
                joinLines(leftoverLines(confirming.categories)),
                `${confirming.firstName} ${confirming.lastName}`,
              )
            : undefined
        }
        confirmLabel={copy.confirm}
        confirmingLabel={copy.confirming}
        confirming={busy}
        destructive={false}
        error={moveError}
        onConfirm={() => {
          if (confirming) void move(confirming);
        }}
      />
    </>
  );
}
