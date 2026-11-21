'use client';
import * as React from 'react';
import { useId, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Plus, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createWaitingRoomScreen,
  updateWaitingRoomScreen,
  WAITING_ROOM_LIMITS,
  waitingRoomScreenUrl,
  type CreatedWaitingRoomScreen,
  type WaitingRoomNameMode,
  type WaitingRoomScreen,
} from '@/lib/waiting-room/waiting-room-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';

export const screenFormCopy = {
  createTitle: 'Nueva pantalla de sala de espera',
  editTitle: 'Editar pantalla',
  createdTitle: 'Pantalla creada',
  description:
    'El televisor mostrará quién espera y a quién llaman en esta sede. Nunca enseña motivos, tratamientos ni datos de contacto.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Televisor de recepción',
  nameHint: 'Para reconocerla en esta lista; no sale en el televisor. Hasta 60 caracteres.',
  location: 'Sede',
  nameMode: 'Cómo se nombra a cada paciente',
  nameInitial: 'Nombre e inicial',
  nameInitialHint: 'Primer nombre y la inicial del apellido: «Ana R.»',
  turnNumber: 'Número de turno',
  turnNumberHint: '«Turno 7», sin ningún nombre. Recepción le dice su turno a cada paciente al llegar.',
  messages: 'Mensajes en la franja inferior (opcional)',
  messagesHint: `Rotan cada 10 segundos: horario, avisos, la red wifi… Hasta ${WAITING_ROOM_LIMITS.messagesMax}, de ${WAITING_ROOM_LIMITS.messageMax} caracteres cada uno.`,
  messageLabel: (n: number) => `Mensaje ${n}`,
  messagePlaceholder: 'Por ejemplo, Horario: lunes a viernes de 8:00 a 17:00',
  addMessage: 'Añadir mensaje',
  removeMessage: (n: number) => `Quitar el mensaje ${n}`,
  sound: 'Aviso sonoro al llamar',
  soundHint: 'Un pitido corto cuando alguien pasa a consulta. Algunos televisores silencian el sonido del navegador.',
  create: 'Crear pantalla',
  save: 'Guardar cambios',
  done: 'Listo',
  invalidName: `Escribe un nombre de hasta ${WAITING_ROOM_LIMITS.nameMax} caracteres.`,
  invalidMessage: `Cada mensaje admite hasta ${WAITING_ROOM_LIMITS.messageMax} caracteres.`,
  genericError: 'No pudimos guardar la pantalla. Intenta de nuevo.',
  onceTitle: 'Copia el enlace ahora: no se podrá volver a ver',
  onceMessage: 'Por seguridad solo se muestra una vez. Si lo pierdes, revoca esta pantalla y crea otra.',
  linkLabel: 'Enlace de la pantalla',
  copyLink: 'Copiar enlace',
  copied: 'Enlace copiado.',
  copyFailed: 'No pudimos copiarlo: selecciona el enlace y cópialo a mano.',
  qrLabel: 'Código QR con el enlace de la pantalla',
  qrHint: 'Escanéalo con el televisor o con el móvil para abrir el enlace sin teclearlo.',
};
const copy = screenFormCopy;

interface WaitingRoomScreenFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  locations: ClinicLocation[];
  /** La sede elegida en la lista (alta). */
  locationId: string;
  /** Sin pantalla: alta. Con pantalla: edición. */
  screen?: WaitingRoomScreen | null;
  onSaved: (screen: WaitingRoomScreen) => void;
}

/**
 * Alta y edición de una pantalla de sala de espera (DX-588, solo ADMIN). Al
 * crearla, el enlace ENTERO sale una sola vez (con copiar y QR): la API solo
 * guarda su hash. El padre lo monta con una `key` por apertura.
 */
export function WaitingRoomScreenFormModal({
  open,
  onOpenChange,
  token,
  locations,
  locationId: initialLocationId,
  screen,
  onSaved,
}: WaitingRoomScreenFormModalProps) {
  const ids = useId();
  const editing = !!screen;
  const [name, setName] = useState(screen?.name ?? '');
  const [locationId, setLocationId] = useState(screen?.locationId ?? initialLocationId);
  const [nameMode, setNameMode] = useState<WaitingRoomNameMode>(screen?.nameMode ?? 'NAME_INITIAL');
  const [messages, setMessages] = useState<string[]>(screen?.messages.length ? screen.messages : []);
  const [soundEnabled, setSoundEnabled] = useState(screen?.soundEnabled ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWaitingRoomScreen | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > WAITING_ROOM_LIMITS.nameMax) {
      setNameError(copy.invalidName);
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    const cleanMessages = messages.map((m) => m.trim()).filter((m) => m !== '');
    if (cleanMessages.some((m) => m.length > WAITING_ROOM_LIMITS.messageMax)) return setError(copy.invalidMessage);
    setSubmitting(true);
    try {
      const input = { name: trimmed, nameMode, messages: cleanMessages, soundEnabled };
      if (editing) {
        onSaved(await updateWaitingRoomScreen(token, screen.id, input));
        onOpenChange(false);
      } else {
        const result = await createWaitingRoomScreen(token, { ...input, locationId });
        const { token: _secret, ...saved } = result; // eslint-disable-line @typescript-eslint/no-unused-vars
        onSaved(saved);
        setCreated(result);
      }
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={(next) => {
        // Al cerrar, el token se olvida: no queda en memoria del componente.
        if (!next) setCreated(null);
        onOpenChange(next);
      }}
      title={created ? copy.createdTitle : editing ? copy.editTitle : copy.createTitle}
      description={created ? undefined : copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      hideSubmit={created !== null}
      cancelLabel={created ? copy.done : undefined}
      error={error}
      ownValidation
    >
      {created ? (
        <CreatedScreenPanel screenToken={created.token} />
      ) : (
        <>
          <FormField htmlFor={`${ids}-name`} label={copy.name} hint={copy.nameHint} error={nameError}>
            <Input
              id={`${ids}-name`}
              ref={nameRef}
              value={name}
              maxLength={WAITING_ROOM_LIMITS.nameMax}
              placeholder={copy.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          {!editing && locations.length > 1 ? (
            <FormField htmlFor={`${ids}-location`} label={copy.location}>
              <NativeSelect id={`${ids}-location`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}
          <RadioGroup
            id={`${ids}-mode`}
            legend={copy.nameMode}
            value={nameMode}
            onValueChange={(v) => setNameMode(v as WaitingRoomNameMode)}
            optionsClassName="grid gap-2 sm:grid-cols-2"
          >
            <RadioCard
              id={`${ids}-mode`}
              value="NAME_INITIAL"
              title={copy.nameInitial}
              description={copy.nameInitialHint}
            />
            <RadioCard value="TURN_NUMBER" title={copy.turnNumber} description={copy.turnNumberHint} />
          </RadioGroup>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="t-label mb-1 text-ink">{copy.messages}</legend>
            <p id={`${ids}-messages-hint`} className="text-xs text-muted">
              {copy.messagesHint}
            </p>
            {messages.map((message, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  id={`${ids}-message-${index}`}
                  aria-label={copy.messageLabel(index + 1)}
                  aria-describedby={`${ids}-messages-hint`}
                  value={message}
                  maxLength={WAITING_ROOM_LIMITS.messageMax}
                  placeholder={copy.messagePlaceholder}
                  onChange={(e) => setMessages((prev) => prev.map((m, i) => (i === index ? e.target.value : m)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={copy.removeMessage(index + 1)}
                  onClick={() => setMessages((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            {messages.length < WAITING_ROOM_LIMITS.messagesMax ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => setMessages((prev) => [...prev, ''])}
              >
                <Plus aria-hidden /> {copy.addMessage}
              </Button>
            ) : null}
          </fieldset>
          <Checkbox
            id={`${ids}-sound`}
            label={copy.sound}
            description={copy.soundHint}
            checked={soundEnabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
          />
        </>
      )}
    </FormModal>
  );
}

/** El enlace recién creado, entero y una sola vez: copiar y QR. */
function CreatedScreenPanel({ screenToken }: { screenToken: string }) {
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const url = waitingRoomScreenUrl(window.location.origin, screenToken);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      inputRef.current?.select();
      setCopyState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="waiting-room-screen-created">
      <Callout tone="warning" title={copy.onceTitle}>
        {copy.onceMessage}
      </Callout>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-url`} className="t-label text-ink">
          {copy.linkLabel}
        </label>
        <Input
          id={`${ids}-url`}
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
          data-testid="waiting-room-screen-url"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleCopy()}
          className="w-full sm:w-auto sm:self-start"
        >
          {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copyLink}
        </Button>
        <p role="status" aria-live="polite" className="text-xs text-muted empty:hidden">
          {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
        </p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-lg border border-border bg-white p-3">
          <QRCodeSVG value={url} size={176} level="M" title={copy.qrLabel} />
        </div>
        <p className="text-center text-xs text-muted">{copy.qrHint}</p>
      </div>
    </div>
  );
}
