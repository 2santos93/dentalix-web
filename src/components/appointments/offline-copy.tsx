'use client';
import { useCallback, useEffect, useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  declineOfflineCopy,
  enableOfflineCopy,
  offlineCopyDeclined,
  offlineCopyStatus,
  onOfflineCopyChange,
  removeOfflineCopy,
  unlockOfflineCopy,
  type VaultStatus,
} from '@/lib/offline/offline-agenda';
import { isTrivialPin, isValidPin } from '@/lib/offline/offline-vault';

export const offlineCopyText = {
  offerTitle: '¿Ver la agenda sin conexión?',
  offerShort: 'Se guarda cifrada en este equipo y se abre con un PIN, por si se va internet o la luz.',
  activate: 'Activar con PIN',
  notNow: 'Ahora no',
  activeLine: 'Copia sin conexión activa en este equipo.',
  lockedLine: 'Copia sin conexión bloqueada en esta pestaña.',
  offLine: 'Sin copia sin conexión en este equipo.',
  unlock: 'Desbloquear',
  remove: 'Quitar copia sin conexión',
  enable: 'Activar copia sin conexión',
  setupTitle: 'PIN de la agenda sin conexión',
  setupDescription:
    'Con este PIN se abre la copia de la agenda cuando no hay conexión. Si se equivoca 5 veces, la copia se borra. No es tu contraseña: elige 4 a 6 dígitos.',
  pin: 'PIN (4 a 6 dígitos)',
  pinRepeat: 'Repite el PIN',
  save: 'Guardar PIN',
  pinInvalid: 'El PIN son 4 a 6 dígitos, solo números.',
  pinMismatch: 'Los dos PIN no coinciden.',
  pinTrivial: 'Ese PIN es fácil de adivinar (números repetidos, seguidos o alternos, como 1111, 1234 o 1212). Elige otro.',
  setupFailed: 'No se pudo activar la copia sin conexión. Intenta de nuevo.',
  unlockTitle: 'Abre la agenda sin conexión',
  unlockBody: 'Escribe el PIN de la copia sin conexión de este equipo.',
  open: 'Abrir',
  wrongPin: (remaining: number) =>
    `PIN incorrecto. ${remaining === 1 ? 'Te queda 1 intento' : `Te quedan ${remaining} intentos`} antes de que se borre la copia.`,
  wiped: 'Por seguridad se borró la copia sin conexión.',
  wipedBody: 'Se agotaron los intentos de PIN. Cuando vuelva la conexión, entra y actívala de nuevo desde la agenda.',
};

function useVaultStatus(token: string | null): VaultStatus | null {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void offlineCopyStatus(token).then((s) => {
        if (!cancelled) setStatus(s);
      });
    refresh();
    const stop = onOfflineCopyChange(refresh);
    return () => {
      cancelled = true;
      stop();
    };
  }, [token]);
  return status;
}

/** Campo de PIN: numérico, oculto, sin autocompletar. */
function PinInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      className="tabular-nums tracking-[0.3em]"
      {...props}
    />
  );
}

/** Diálogo para fijar el PIN y activar la copia (con sesión y red). */
export function PinSetupDialog({
  token,
  open,
  onOpenChange,
}: {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<{ pin?: string; repeat?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const pinId = useId();
  const repeatId = useId();

  const close = (next: boolean) => {
    if (!next) {
      setPin('');
      setRepeat('');
      setErrors({});
    }
    onOpenChange(next);
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidPin(pin)) return setErrors({ pin: offlineCopyText.pinInvalid });
    if (isTrivialPin(pin)) return setErrors({ pin: offlineCopyText.pinTrivial });
    if (repeat !== pin) return setErrors({ repeat: offlineCopyText.pinMismatch });
    setBusy(true);
    const ok = await enableOfflineCopy(token, pin);
    setBusy(false);
    if (!ok) return setErrors({ form: offlineCopyText.setupFailed });
    close(false);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={close}
      title={offlineCopyText.setupTitle}
      description={offlineCopyText.setupDescription}
      onSubmit={(e) => void submit(e)}
      submitLabel={offlineCopyText.save}
      submitting={busy}
      error={errors.form ?? null}
      fullScreenOnMobile={false}
      ownValidation
    >
      <FormField htmlFor={pinId} label={offlineCopyText.pin} error={errors.pin}>
        <PinInput
          id={pinId}
          name="pin"
          value={pin}
          aria-invalid={errors.pin ? true : undefined}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
      </FormField>
      <FormField htmlFor={repeatId} label={offlineCopyText.pinRepeat} error={errors.repeat}>
        <PinInput
          id={repeatId}
          name="pin-repeat"
          value={repeat}
          aria-invalid={errors.repeat ? true : undefined}
          onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ''))}
        />
      </FormField>
    </FormModal>
  );
}

/**
 * Pide el PIN y abre la copia en esta pestaña. Tras `MAX_PIN_ATTEMPTS` fallos
 * la copia se borra (`onWiped`).
 */
export function PinUnlockForm({
  onUnlocked,
  onWiped,
  framed = true,
}: {
  onUnlocked: () => void;
  onWiped: () => void;
  /** `false` dentro de un diálogo, que ya lleva título y descripción. */
  framed?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const result = await unlockOfflineCopy(pin);
    setBusy(false);
    setPin('');
    if (result.ok) return onUnlocked();
    if ('wiped' in result) return onWiped();
    setError(offlineCopyText.wrongPin(result.remaining));
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void submit(e)}
      data-testid="offline-pin-form"
      className={
        framed ? 'flex max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-6' : 'flex flex-col gap-3'
      }
    >
      {framed ? (
        <>
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden className="size-4 text-muted" />
            <h2 className="t-title text-ink">{offlineCopyText.unlockTitle}</h2>
          </div>
          <p className="text-sm text-muted">{offlineCopyText.unlockBody}</p>
        </>
      ) : null}
      <FormField htmlFor={id} label={offlineCopyText.pin} error={error}>
        <PinInput
          id={id}
          name="pin"
          value={pin}
          autoFocus
          aria-invalid={error ? true : undefined}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
      </FormField>
      <Button type="submit" disabled={busy || pin.length < 4} className="max-sm:w-full sm:self-start">
        {offlineCopyText.open}
      </Button>
    </form>
  );
}

/** Aviso tras agotar los intentos: la copia ya no existe. */
export function OfflineCopyWiped() {
  return (
    <Callout tone="danger" role="alert" title={offlineCopyText.wiped} data-testid="offline-wiped">
      <p>{offlineCopyText.wipedBody}</p>
    </Callout>
  );
}

/**
 * Con red y sesión, sobre la agenda: ofrece activar la copia sin conexión (una
 * vez, hasta «Ahora no»), dice si está activa y permite quitarla, o pide el
 * PIN si está bloqueada en esta pestaña.
 */
export function OfflineCopyControl({ token }: { token: string }) {
  const status = useVaultStatus(token);
  const [setupOpen, setSetupOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [wiped, setWiped] = useState(false);
  const [declined, setDeclined] = useState(() => offlineCopyDeclined(token));

  const decline = useCallback(() => {
    declineOfflineCopy(token);
    setDeclined(true);
  }, [token]);

  if (status === null) return null;

  // Va en la ranura de acciones de la cabecera (a la derecha en escritorio):
  // compacto, para no empujar la rejilla de la agenda.
  return (
    <div
      data-testid="offline-copy-control"
      data-status={status}
      className="flex max-w-sm flex-col gap-1.5 text-xs text-muted sm:items-end sm:text-right"
    >
      {wiped ? <OfflineCopyWiped /> : null}
      {status === 'off' && !declined ? (
        <>
          <p className="flex items-center gap-1.5">
            <KeyRound aria-hidden className="size-3.5 shrink-0" />
            <span>
              <span className="font-medium text-ink">{offlineCopyText.offerTitle}.</span> {offlineCopyText.offerShort}
            </span>
          </p>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSetupOpen(true)}>
              {offlineCopyText.activate}
            </Button>
            <Button size="sm" variant="ghost" onClick={decline}>
              {offlineCopyText.notNow}
            </Button>
          </span>
        </>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 sm:justify-end">
          <KeyRound aria-hidden className="size-3.5" />
          <span>
            {status === 'ready'
              ? offlineCopyText.activeLine
              : status === 'locked'
                ? offlineCopyText.lockedLine
                : offlineCopyText.offLine}
          </span>
          {status === 'locked' ? (
            <Button size="sm" variant="link" className="h-auto px-0" onClick={() => setUnlockOpen(true)}>
              {offlineCopyText.unlock}
            </Button>
          ) : null}
          {status === 'off' ? (
            <Button size="sm" variant="link" className="h-auto px-0" onClick={() => setSetupOpen(true)}>
              {offlineCopyText.enable}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="link"
              className="h-auto px-0"
              onClick={() => {
                setDeclined(true);
                void removeOfflineCopy(token);
              }}
            >
              {offlineCopyText.remove}
            </Button>
          )}
        </p>
      )}
      <PinSetupDialog token={token} open={setupOpen} onOpenChange={setSetupOpen} />
      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{offlineCopyText.unlockTitle}</DialogTitle>
            <DialogDescription>{offlineCopyText.unlockBody}</DialogDescription>
          </DialogHeader>
          <PinUnlockForm
            framed={false}
            onUnlocked={() => setUnlockOpen(false)}
            onWiped={() => {
              setUnlockOpen(false);
              setWiped(true);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

