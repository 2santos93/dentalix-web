'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { RotateCcw, RotateCw, Send } from 'lucide-react';
import {
  messageLength,
  messageTemplateErrorCopy,
  messageTemplateFailure,
  previewMessageTemplate,
  resetMessageTemplate,
  saveMessageTemplate,
  sendMessageTemplateTest,
  type MessageChannel,
  type MessageChannelEntry,
  type MessageDraft,
  type MessageEntry,
  type MessageLanguage,
  type MessageLanguageEntry,
  type MessagePreview,
  type MessageTarget,
  type MessageTemplate,
  type MessageVariable,
} from '@/lib/message-templates/message-templates-api';
import { languageName } from '@/lib/patients/patient-languages';
import { FormModal } from '@/components/shared/form-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CHANNEL_LABELS, GUARDIAN_STANDARD_TEXT, messageStatusCopy } from './message-template-labels';

/** Espera tras la última tecla antes de pedir la vista previa. */
export const PREVIEW_DEBOUNCE_MS = 400;

export const messageEditorCopy = {
  description: 'Cambia el texto en cada idioma. Lo nuevo se usa en los siguientes envíos; lo ya enviado no cambia.',
  channelTabs: 'Canal',
  languageTabs: 'Idioma',
  unsaved: 'sin guardar',
  subject: 'Asunto',
  body: 'Texto del mensaje',
  counter: (length: number, max: number) => `${length} de ${max} caracteres`,
  variables: 'Variables',
  variablesHint: 'Pulsa una para insertarla donde está el cursor.',
  insert: (name: string) => `Insertar {${name}}`,
  required: 'obligatoria',
  syntax:
    'Las variables van entre llaves, como {paciente}. Un tramo entre corchetes sale solo si sus variables tienen valor, como «[ con {profesional}]». Una línea en blanco empieza un párrafo.',
  emailFixed:
    'No se editan: el saludo, el botón con el enlace (el enlace no se escribe aquí), los bloques fijos como la política de cancelación o la lista de fechas, el pie y el enlace para darse de baja.',
  whatsappFixed: (required: boolean) =>
    required
      ? 'El texto tiene que llevar {enlace}: es donde va el enlace del paciente. No admite otros enlaces ni HTML.'
      : 'No admite enlaces ni HTML.',
  confirmationExtras: 'Si toca, se añaden detrás el cuestionario de salud y las indicaciones «Antes de tu cita».',
  guardian: 'A quien responde por un menor le llega siempre el texto estándar.',
  savedBy: (name: string) => `Guardado por ${name}.`,
  saved: 'Texto guardado.',
  noChanges: 'Sin cambios que guardar.',
  reset: 'Restablecer',
  resetTitle: 'Restablecer el texto por defecto',
  resetDescription: (language: string) =>
    `El texto en ${language} vuelve al de por defecto en los siguientes envíos. Lo que escribiste se pierde.`,
  resetConfirm: 'Restablecer',
  resetDone: 'Texto restablecido: vuelve el de por defecto.',
  retiredTitle: 'Idiomas que la clínica ya no ofrece',
  retired: (language: string) =>
    `Queda un texto guardado en ${language}, que ya no está en los idiomas de la clínica: no se usa. Puedes restablecerlo.`,
  retiredReset: (language: string) => `Restablecer ${language}`,
  test: 'Enviarme una prueba',
  testHint: 'Llega a tu correo, con «[Prueba]» en el asunto y datos de ejemplo. Prueba lo que hay escrito, aunque no esté guardado.',
  testSent: (to: string) => `Te enviamos la prueba a ${to}. Llega con «[Prueba]» en el asunto.`,
  preview: 'Vista previa',
  previewHint: 'Con datos de ejemplo (Ana, Sede Altamira, Dra. Laura Gómez) y el nombre de tu clínica.',
  previewLoading: 'Cargando la vista previa',
  previewInvalid: 'Corrige el texto para ver la vista previa.',
  previewRetry: 'Reintentar',
  previewFrame: 'Vista previa del email',
  previewSubject: (subject: string) => `Asunto: ${subject}`,
  whatsappBubble: 'Vista previa del mensaje de WhatsApp',
};

const copy = messageEditorCopy;

type ComboId = `${MessageChannel}:${MessageLanguage}`;
type FieldErrors = { subject?: string; body?: string };

const comboId = (channel: MessageChannel, language: MessageLanguage): ComboId => `${channel}:${language}`;

/** El texto vigente: el guardado o, sin él, el de por defecto. */
function currentText(entry: MessageLanguageEntry): MessageDraft {
  const text = entry.custom ?? entry.default;
  return { subject: text.subject, body: text.body };
}

function sameDraft(a: MessageDraft, b: MessageDraft): boolean {
  return (a.subject ?? '') === (b.subject ?? '') && a.body === b.body;
}

function offeredLanguages(channel: MessageChannelEntry): MessageLanguageEntry[] {
  return channel.languages.filter((l) => l.offered);
}

interface MessageTemplateEditorProps {
  token: string;
  message: MessageEntry;
  onOpenChange: (open: boolean) => void;
  /** Tras guardar o restablecer: el padre actualiza su catálogo. */
  onSaved: (template: MessageTemplate) => void;
}

/**
 * DX-565: el editor de un mensaje (Ajustes › Mensajes). Pestañas de canal y de
 * idioma (solo los que ofrece la clínica); cada combinación tiene su borrador,
 * y «Guardar» guarda la que está abierta. Vista previa en vivo renderizada por
 * la API; «Enviarme una prueba» (email) y «Restablecer» (con confirmación).
 */
export function MessageTemplateEditor({ token, message, onOpenChange, onSaved }: MessageTemplateEditorProps) {
  const firstChannel = message.channels[0];
  const [channel, setChannel] = useState<MessageChannel>(firstChannel.channel);
  const [languageByChannel, setLanguageByChannel] = useState<Partial<Record<MessageChannel, MessageLanguage>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<ComboId, MessageDraft>>>({});
  const [errors, setErrors] = useState<Partial<Record<ComboId, FieldErrors>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [resetTarget, setResetTarget] = useState<MessageTarget | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const channelEntry = message.channels.find((c) => c.channel === channel) ?? firstChannel;
  const offered = offeredLanguages(channelEntry);
  const language: MessageLanguage | null = languageByChannel[channel] ?? offered[0]?.language ?? null;
  const languageEntry = offered.find((l) => l.language === language) ?? null;
  const active = language ? comboId(channel, language) : null;

  const draftOf = useCallback(
    (ch: MessageChannelEntry, entry: MessageLanguageEntry): MessageDraft =>
      drafts[comboId(ch.channel, entry.language)] ?? currentText(entry),
    [drafts],
  );
  const isDirty = (ch: MessageChannelEntry, entry: MessageLanguageEntry) =>
    !sameDraft(draftOf(ch, entry), currentText(entry));

  const draft = languageEntry ? draftOf(channelEntry, languageEntry) : null;
  const dirty = languageEntry ? isDirty(channelEntry, languageEntry) : false;
  const target: MessageTarget | null = language ? { key: message.key, channel, language } : null;

  function setDraft(next: MessageDraft) {
    if (!active) return;
    setDrafts((prev) => ({ ...prev, [active]: next }));
    setSavedNote('');
  }

  function setComboErrors(id: ComboId, next: FieldErrors) {
    setErrors((prev) => ({ ...prev, [id]: next }));
  }

  /** El catálogo del padre ya tiene el texto nuevo: el borrador vuelve a «sin cambios». */
  function applySaved(template: MessageTemplate) {
    const id = comboId(template.channel, template.language);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setComboErrors(id, {});
    onSaved(template);
  }

  async function handleSave() {
    if (!target || !draft || !active) return;
    setSaving(true);
    setFormError(null);
    setSavedNote('');
    try {
      const template = await saveMessageTemplate(token, target, draft);
      applySaved(template);
      setSavedNote(copy.saved);
    } catch (err) {
      const failure = messageTemplateFailure(err, messageTemplateErrorCopy.save);
      if (failure.field) setComboErrors(active, { [failure.field]: failure.text });
      else setFormError(failure.text);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!resetTarget) return;
    setResetting(true);
    setResetError(null);
    try {
      const template = await resetMessageTemplate(token, resetTarget);
      applySaved(template);
      setSavedNote(copy.resetDone);
      setResetTarget(null);
    } catch (err) {
      setResetError(messageTemplateFailure(err, messageTemplateErrorCopy.reset).text);
    } finally {
      setResetting(false);
    }
  }

  const retired = channelEntry.languages.filter((l) => !l.offered && l.custom);

  const panel = (ch: MessageChannelEntry, entry: MessageLanguageEntry) => (
    <MessageTextPanel
      key={comboId(ch.channel, entry.language)}
      token={token}
      message={message}
      channelEntry={ch}
      languageEntry={entry}
      draft={draftOf(ch, entry)}
      errors={errors[comboId(ch.channel, entry.language)] ?? {}}
      onDraftChange={setDraft}
      onErrorsChange={(next) => setComboErrors(comboId(ch.channel, entry.language), next)}
      onReset={() => {
        setResetError(null);
        setResetTarget({ key: message.key, channel: ch.channel, language: entry.language });
      }}
    />
  );

  const languagePicker = (ch: MessageChannelEntry) => {
    const langs = offeredLanguages(ch);
    const current = languageByChannel[ch.channel] ?? langs[0]?.language;
    if (langs.length <= 1) return langs[0] ? panel(ch, langs[0]) : null;
    return (
      <Tabs
        value={current}
        onValueChange={(value) => setLanguageByChannel((prev) => ({ ...prev, [ch.channel]: value as MessageLanguage }))}
      >
        <TabsList aria-label={copy.languageTabs}>
          {langs.map((entry) => (
            <TabsTrigger key={entry.language} value={entry.language}>
              {languageName(entry.language)}
              {isDirty(ch, entry) ? <span className="ml-1 text-muted">({copy.unsaved})</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {langs.map((entry) => (
          <TabsContent key={entry.language} value={entry.language} className="pt-4">
            {panel(ch, entry)}
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const resetLanguage = resetTarget ? languageName(resetTarget.language) : '';

  return (
    <>
      <FormModal
        open
        onOpenChange={onOpenChange}
        title={message.title}
        description={copy.description}
        size="lg"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
        submitting={saving}
        submitDisabled={!dirty || !draft}
        submitHint={dirty ? null : copy.noChanges}
        error={formError}
        ownValidation
      >
        {message.channels.length > 1 ? (
          <Tabs value={channel} onValueChange={(value) => setChannel(value as MessageChannel)}>
            <TabsList aria-label={copy.channelTabs}>
              {message.channels.map((ch) => (
                <TabsTrigger key={ch.channel} value={ch.channel}>
                  {CHANNEL_LABELS[ch.channel]}
                  {offeredLanguages(ch).some((entry) => isDirty(ch, entry)) ? (
                    <span className="ml-1 text-muted">({copy.unsaved})</span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            {message.channels.map((ch) => (
              <TabsContent key={ch.channel} value={ch.channel} className="pt-4">
                {languagePicker(ch)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          languagePicker(channelEntry)
        )}

        {retired.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
            <p className="text-sm font-medium text-ink">{copy.retiredTitle}</p>
            {retired.map((entry) => (
              <div key={entry.language} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">{copy.retired(languageName(entry.language))}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setResetError(null);
                    setResetTarget({ key: message.key, channel: channelEntry.channel, language: entry.language });
                  }}
                >
                  {copy.retiredReset(languageName(entry.language))}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <p role="status" aria-live="polite" className={savedNote ? 'text-sm text-success-text' : 'sr-only'}>
          {savedNote}
        </p>
      </FormModal>
      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(next) => {
          if (!next && !resetting) setResetTarget(null);
        }}
        title={copy.resetTitle}
        description={copy.resetDescription(resetLanguage)}
        confirmLabel={copy.resetConfirm}
        onConfirm={() => void handleReset()}
        confirming={resetting}
        error={resetError}
      />
    </>
  );
}

interface MessageTextPanelProps {
  token: string;
  message: MessageEntry;
  channelEntry: MessageChannelEntry;
  languageEntry: MessageLanguageEntry;
  draft: MessageDraft;
  errors: FieldErrors;
  onDraftChange: (draft: MessageDraft) => void;
  onErrorsChange: (errors: FieldErrors) => void;
  onReset: () => void;
}

type Field = 'subject' | 'body';

/** Asunto (email), cuerpo, variables, avisos de lo fijo, prueba y vista previa de UNA combinación. */
function MessageTextPanel({
  token,
  message,
  channelEntry,
  languageEntry,
  draft,
  errors,
  onDraftChange,
  onErrorsChange,
  onReset,
}: MessageTextPanelProps) {
  const ids = useId();
  const subjectId = `${ids}-subject`;
  const bodyId = `${ids}-body`;
  const subjectCountId = `${ids}-subject-count`;
  const bodyCountId = `${ids}-body-count`;
  const syntaxId = `${ids}-syntax`;
  const isEmail = channelEntry.channel === 'EMAIL';
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Dónde estaba el cursor: los chips se pulsan con el foco ya fuera del campo.
  const caret = useRef<{ field: Field; start: number; end: number } | null>(null);
  const pendingCaret = useRef<{ field: Field; at: number } | null>(null);

  const target: MessageTarget = { key: message.key, channel: channelEntry.channel, language: languageEntry.language };
  const subjectLength = messageLength(draft.subject ?? '');
  const bodyLength = messageLength(draft.body);

  function remember(field: Field, el: HTMLInputElement | HTMLTextAreaElement) {
    caret.current = { field, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length };
  }

  function insert(variable: MessageVariable) {
    const token = `{${variable.name}}`;
    const at = caret.current ?? { field: 'body' as const, start: draft.body.length, end: draft.body.length };
    const field: Field = isEmail ? at.field : 'body';
    const value = field === 'subject' ? (draft.subject ?? '') : draft.body;
    const start = Math.min(at.start, value.length);
    const end = Math.min(Math.max(at.end, start), value.length);
    const next = value.slice(0, start) + token + value.slice(end);
    caret.current = { field, start: start + token.length, end: start + token.length };
    pendingCaret.current = { field, at: start + token.length };
    onDraftChange(field === 'subject' ? { ...draft, subject: next } : { ...draft, body: next });
  }

  // Tras insertar: el foco vuelve al campo, con el cursor detrás de la variable.
  useEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    pendingCaret.current = null;
    const el = pending.field === 'subject' ? subjectRef.current : bodyRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(pending.at, pending.at);
  }, [draft]);

  // Vista previa en vivo: la API renderiza el borrador con datos de ejemplo.
  const [preview, setPreview] = useState<MessagePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewInvalid, setPreviewInvalid] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const sequence = useRef(0);
  const onErrorsChangeRef = useRef(onErrorsChange);
  useEffect(() => {
    onErrorsChangeRef.current = onErrorsChange;
  });
  const draftSubject = draft.subject;
  const draftBody = draft.body;

  useEffect(() => {
    const mine = ++sequence.current;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      previewMessageTemplate(token, target, { subject: draftSubject, body: draftBody })
        .then((result) => {
          if (mine !== sequence.current) return;
          setPreview(result);
          setPreviewError(null);
          setPreviewInvalid(false);
          // La API aceptó este texto: ya no hay nada que señalar en los campos.
          onErrorsChangeRef.current({});
        })
        .catch((err: unknown) => {
          if (mine !== sequence.current) return;
          const failure = messageTemplateFailure(err, messageTemplateErrorCopy.preview);
          if (failure.field) {
            setPreviewInvalid(true);
            setPreviewError(null);
            onErrorsChangeRef.current({ [failure.field]: failure.text });
          } else {
            setPreviewInvalid(false);
            setPreviewError(failure.text);
          }
        })
        .finally(() => {
          if (mine === sequence.current) setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `target` cambia de identidad en cada render: cuentan sus partes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, target.key, target.channel, target.language, draftSubject, draftBody, previewKey]);

  // «Enviarme una prueba»: una cada 5 minutos por persona (la API dice la espera).
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState('');
  const [testError, setTestError] = useState<string | null>(null);
  const [testWaiting, setTestWaiting] = useState(false);
  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (testTimer.current) clearTimeout(testTimer.current);
    },
    [],
  );

  async function sendTest() {
    setTesting(true);
    setTestError(null);
    setTestSent('');
    try {
      const result = await sendMessageTemplateTest(token, target, draft);
      setTestSent(copy.testSent(result.sentTo));
    } catch (err) {
      const failure = messageTemplateFailure(err, messageTemplateErrorCopy.test);
      if (failure.field) onErrorsChange({ [failure.field]: failure.text });
      else setTestError(failure.text);
      if (failure.retryAfterSeconds) {
        setTestWaiting(true);
        if (testTimer.current) clearTimeout(testTimer.current);
        testTimer.current = setTimeout(() => setTestWaiting(false), failure.retryAfterSeconds * 1000);
      }
    } finally {
      setTesting(false);
    }
  }

  const required = new Set<string>(channelEntry.required);
  const describe = (...list: (string | false)[]) => list.filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={languageEntry.custom ? 'info' : 'neutral'} data-testid="message-template-status">
          {languageEntry.custom ? messageStatusCopy.custom : messageStatusCopy.isDefault}
        </Badge>
        {languageEntry.custom?.updatedByName ? (
          <span className="text-xs text-muted">{copy.savedBy(languageEntry.custom.updatedByName)}</span>
        ) : null}
      </div>

      {isEmail && channelEntry.subjectMaxLength !== null ? (
        <FormField htmlFor={subjectId} label={copy.subject} error={errors.subject}>
          <Input
            id={subjectId}
            ref={subjectRef}
            value={draft.subject ?? ''}
            onChange={(e) => {
              onDraftChange({ ...draft, subject: e.target.value });
              remember('subject', e.target);
            }}
            onSelect={(e) => remember('subject', e.currentTarget)}
            onBlur={(e) => remember('subject', e.currentTarget)}
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={describe(subjectCountId, Boolean(errors.subject) && fieldErrorId(subjectId))}
          />
        </FormField>
      ) : null}
      {isEmail && channelEntry.subjectMaxLength !== null ? (
        <p
          id={subjectCountId}
          className={cn('-mt-3 text-xs tnum', subjectLength > channelEntry.subjectMaxLength ? 'text-danger-text' : 'text-muted')}
        >
          {copy.counter(subjectLength, channelEntry.subjectMaxLength)}
        </p>
      ) : null}

      <FormField htmlFor={bodyId} label={copy.body} error={errors.body}>
        <Textarea
          id={bodyId}
          ref={bodyRef}
          rows={8}
          autoGrow
          className="max-h-[50vh]"
          value={draft.body}
          onChange={(e) => {
            onDraftChange({ ...draft, body: e.target.value });
            remember('body', e.target);
          }}
          onSelect={(e) => remember('body', e.currentTarget)}
          onBlur={(e) => remember('body', e.currentTarget)}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={describe(bodyCountId, syntaxId, Boolean(errors.body) && fieldErrorId(bodyId))}
        />
      </FormField>
      <p
        id={bodyCountId}
        className={cn('-mt-3 text-xs tnum', bodyLength > channelEntry.bodyMaxLength ? 'text-danger-text' : 'text-muted')}
      >
        {copy.counter(bodyLength, channelEntry.bodyMaxLength)}
      </p>

      <div className="flex flex-col gap-2">
        <p className="t-label text-ink">{copy.variables}</p>
        <p className="text-xs text-muted">{copy.variablesHint}</p>
        <ul className="flex flex-wrap gap-2" aria-label={copy.variables}>
          {channelEntry.variables.map((variable) => {
            const descId = `${ids}-var-${variable.name}`;
            const isRequired = required.has(variable.name);
            const description = isRequired ? `${variable.description} (${copy.required})` : variable.description;
            return (
              <li key={variable.name}>
                <Tooltip content={description}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="font-mono max-sm:min-h-11"
                    aria-label={copy.insert(variable.name)}
                    aria-describedby={descId}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(variable)}
                  >
                    {`{${variable.name}}`}
                    {isRequired ? <span aria-hidden="true">*</span> : null}
                  </Button>
                </Tooltip>
                <span id={descId} className="sr-only">
                  {description}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted">
        <p id={syntaxId}>{copy.syntax}</p>
        <p>{isEmail ? copy.emailFixed : copy.whatsappFixed(required.has('enlace'))}</p>
        {message.key === 'appointment-confirmation' ? <p>{copy.confirmationExtras}</p> : null}
        {isEmail && GUARDIAN_STANDARD_TEXT.has(message.key) ? <p>{copy.guardian}</p> : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        {isEmail ? (
          <Button
            type="button"
            variant="secondary"
            loading={testing}
            disabled={testing || testWaiting}
            onClick={() => void sendTest()}
            className="w-full sm:w-auto"
          >
            <Send aria-hidden /> {copy.test}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={!languageEntry.custom}
          onClick={onReset}
          className="w-full sm:w-auto"
        >
          <RotateCcw aria-hidden /> {copy.reset}
        </Button>
      </div>
      {isEmail ? (
        <>
          <p className={testSent ? 'sr-only' : 'text-xs text-muted'}>{copy.testHint}</p>
          <p role="status" className={testSent ? 'text-sm text-success-text' : 'sr-only'}>
            {testSent}
          </p>
          {testError ? <InlineError>{testError}</InlineError> : null}
        </>
      ) : null}

      <section aria-label={copy.preview} className="flex min-w-0 flex-col gap-2 border-t border-border-subtle pt-4">
        <h3 className="t-title text-ink">{copy.preview}</h3>
        <p className="text-xs text-muted">{copy.previewHint}</p>
        <PreviewBody
          channel={channelEntry.channel}
          preview={preview}
          loading={previewLoading}
          invalid={previewInvalid}
          error={previewError}
          onRetry={() => setPreviewKey((n) => n + 1)}
        />
      </section>
    </div>
  );
}

function PreviewBody({
  channel,
  preview,
  loading,
  invalid,
  error,
  onRetry,
}: {
  channel: MessageChannel;
  preview: MessagePreview | null;
  loading: boolean;
  invalid: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-start gap-2">
        <InlineError>{error}</InlineError>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden /> {copy.previewRetry}
        </Button>
      </div>
    );
  }
  if (invalid) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">{copy.previewInvalid}</p>;
  }
  if (!preview || preview.channel !== channel) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{copy.previewLoading}</span>
        <span className="h-5 w-64 max-w-full animate-pulse rounded bg-surface-sunken" />
        <span className="h-48 w-full animate-pulse rounded bg-surface-sunken" />
      </div>
    );
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', loading && 'opacity-70')} aria-busy={loading}>
      {preview.channel === 'EMAIL' && preview.html ? (
        <>
          <p className="break-words text-sm font-medium text-ink" data-testid="message-preview-subject">
            {copy.previewSubject(preview.subject ?? '')}
          </p>
          {/* Sin permisos: el HTML del email no ejecuta nada ni navega desde aquí. */}
          <iframe
            title={copy.previewFrame}
            sandbox=""
            srcDoc={preview.html}
            className="h-[60vh] max-h-[560px] w-full rounded-lg border border-border bg-white"
          />
        </>
      ) : (
        <div
          role="group"
          aria-label={copy.whatsappBubble}
          className="max-w-md self-start rounded-lg rounded-tl-sm border border-success/30 bg-success-subtle px-3 py-2"
        >
          <p className="whitespace-pre-wrap break-words text-sm text-ink" data-testid="message-preview-text">
            {preview.text}
          </p>
        </div>
      )}
    </div>
  );
}
