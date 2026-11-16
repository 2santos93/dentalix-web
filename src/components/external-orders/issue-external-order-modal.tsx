'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EXTERNAL_ORDER_KIND_LABELS,
  EXTERNAL_ORDER_KINDS,
  EXTERNAL_ORDER_LIMITS as L,
  cleanLines,
  issueExternalOrder,
  listExternalOrderTemplates,
  listRecipientSuggestions,
  type ExternalOrder,
  type ExternalOrderKind,
  type ExternalOrderTemplate,
  type RecipientSuggestion,
} from '@/lib/external-orders/external-orders-api';
import { openExternalOrderPdf } from '@/lib/external-orders/open-external-order-pdf';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { ToothChipsInput } from '@/components/patient-documents/tooth-chips-input';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

export const issueExternalOrderCopy = {
  title: 'Nueva orden',
  description:
    'Orden de estudios o referencia a un especialista externo. Una emitida no se edita: solo se anula con motivo. Su PDF, sin la nota clínica, queda en «Documentos».',
  fromAppointment: 'Se emite desde esta cita y queda en su sede.',
  template: 'Plantilla (opcional)',
  noTemplate: 'Sin plantilla',
  templateHint: 'Rellena el tipo, el destinatario y los estudios; puedes cambiarlos.',
  templatesError: 'Plantillas sin cargar',
  kind: 'Tipo',
  recipient: 'Destinatario',
  recipientHint: 'El centro o el especialista al que va la orden.',
  recipientPlaceholder: 'Por ejemplo, Centro de Imagen Los Palos Grandes',
  suggestions: 'Sugerencias',
  useSuggestion: (name: string) => `Usar «${name}» como destinatario`,
  items: 'Estudios o motivo',
  itemsHint: `Una línea por estudio, hasta ${L.itemsMax}.`,
  item: (n: number) => `Estudio ${n}`,
  addItem: 'Añadir estudio',
  removeItem: (n: number) => `Quitar el estudio ${n}`,
  teeth: 'Dientes (opcional)',
  note: 'Nota clínica (opcional)',
  noteHint: 'Para el centro o el especialista. Recepción no la ve y no sale en el PDF de «Documentos».',
  submit: 'Emitir orden',
  close: 'Cerrar',
  recipientRequired: 'Escribe el destinatario.',
  itemsRequired: 'Escribe al menos un estudio o el motivo de la referencia.',
  itemTooLong: (n: number) => `El estudio ${n} pasa de ${L.itemMax} caracteres.`,
  teethInvalid: 'Revisa el código del diente o bórralo.',
  genericError: 'No pudimos emitir la orden. Intenta de nuevo.',
  issuedTitle: (number: string) => `Orden nº ${number} emitida`,
  issuedBody: 'Queda en la ficha del paciente y su PDF sin la nota, archivado en «Documentos».',
  print: 'Ver e imprimir',
  printError: 'No pudimos abrir el PDF de la orden. Intenta de nuevo.',
};

const copy = issueExternalOrderCopy;

/** Espera tras la última tecla antes de pedir sugerencias de destinatario (ms). */
export const RECIPIENT_SUGGESTIONS_DEBOUNCE_MS = 250;

interface IssueExternalOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** La cita desde la que se llegó (detalle de la cita en la agenda). */
  appointmentId?: string | null;
  onIssued?: (order: ExternalOrder) => void;
}

interface ItemDraft {
  key: number;
  text: string;
}

/**
 * «Nueva orden» (DX-572), DENTIST y ADMIN: plantilla opcional (precarga tipo,
 * destinatario y estudios), tipo, destinatario con sugerencias de la clínica,
 * los estudios línea a línea, dientes FDI y la nota clínica. Desde la agenda
 * llega la cita y la orden queda en su sede; desde la ficha, en la sede activa.
 * Tras emitir ofrece «Ver e imprimir». Un fallo del envío (el `message` en
 * español de la API: sin registro profesional, otra sede…) es del formulario
 * (escalón 4). El padre lo monta con `key` por apertura.
 */
export function IssueExternalOrderModal({
  open,
  onOpenChange,
  token,
  patientId,
  appointmentId = null,
  onIssued,
}: IssueExternalOrderModalProps) {
  const ids = useId();
  const [templates, setTemplates] = useState<ExternalOrderTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [templatesReload, setTemplatesReload] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [kind, setKind] = useState<ExternalOrderKind>('IMAGING');
  const [recipient, setRecipient] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [items, setItems] = useState<ItemDraft[]>([{ key: 0, text: '' }]);
  const [nextKey, setNextKey] = useState(1);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [teeth, setTeeth] = useState<string[]>([]);
  const [teethInvalid, setTeethInvalid] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<ExternalOrder | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listExternalOrderTemplates(token)
      .then((list) => {
        if (cancelled) return;
        setTemplates([...list].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        setTemplatesFailed(false);
      })
      .catch(() => {
        if (!cancelled) setTemplatesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, templatesReload]);

  // Sugerencias de destinatario: las de las plantillas y las recientes de la
  // clínica que contienen lo escrito. Si fallan, el campo sigue siendo libre.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      listRecipientSuggestions(token, recipient)
        .then((list) => {
          if (!cancelled) setSuggestions(list);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, RECIPIENT_SUGGESTIONS_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, token, recipient]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates?.find((t) => t.id === id);
    if (!tpl) return;
    setKind(tpl.kind);
    if (tpl.recipient) setRecipient(tpl.recipient);
    const lines = tpl.items.length > 0 ? tpl.items : [''];
    setItems(lines.map((text, i) => ({ key: nextKey + i, text })));
    setNextKey((k) => k + lines.length);
    setRecipientError(null);
    setItemsError(null);
  }

  function updateItem(key: number, text: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, text } : it)));
    setItemsError(null);
  }

  function addItem() {
    setItems((prev) => [...prev, { key: nextKey, text: '' }]);
    setNextKey((k) => k + 1);
  }

  function removeItem(key: number) {
    setItems((prev) => (prev.length === 1 ? [{ key: prev[0].key, text: '' }] : prev.filter((it) => it.key !== key)));
  }

  async function submit() {
    const trimmedRecipient = recipient.trim();
    if (trimmedRecipient === '') {
      setRecipientError(copy.recipientRequired);
      return;
    }
    const lines = cleanLines(items.map((it) => it.text));
    if (lines.length === 0) {
      setItemsError(copy.itemsRequired);
      return;
    }
    const tooLong = items.findIndex((it) => it.text.trim().length > L.itemMax);
    if (tooLong >= 0) {
      setItemsError(copy.itemTooLong(tooLong + 1));
      return;
    }
    if (teethInvalid) {
      setError(copy.teethInvalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await issueExternalOrder(token, patientId, {
        kind,
        recipient: trimmedRecipient,
        items: lines,
        ...(teeth.length > 0 ? { toothNumbers: teeth } : {}),
        ...(note.trim() !== '' ? { clinicalNote: note.trim() } : {}),
        ...(appointmentId ? { appointmentId } : {}),
        ...(templateId ? { templateId } : {}),
      });
      setIssued(order);
      onIssued?.(order);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (issued) {
      onOpenChange(false);
      return;
    }
    void submit();
  }

  async function print(order: ExternalOrder) {
    setPrinting(true);
    setPrintError(null);
    try {
      // Quien emite es un rol clínico: el PDF sale con la nota si la lleva.
      await openExternalOrderPdf(token, order.id, order.hasClinicalNote, `orden-${order.numberLabel}.pdf`);
    } catch (err) {
      setPrintError(apiErrorMessage(err, copy.printError));
    } finally {
      setPrinting(false);
    }
  }

  const visibleSuggestions = suggestions.filter((s) => s.name !== recipient.trim());

  let body: React.ReactNode;
  if (issued) {
    body = (
      <div className="flex flex-col gap-3">
        <Callout tone="success" title={copy.issuedTitle(issued.numberLabel)} role="status">
          <p>{copy.issuedBody}</p>
        </Callout>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto sm:self-start"
          disabled={printing}
          aria-busy={printing || undefined}
          onClick={() => void print(issued)}
        >
          <Printer aria-hidden />
          {copy.print}
        </Button>
        {printError ? <InlineError>{printError}</InlineError> : null}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {appointmentId ? <p className="text-sm text-muted">{copy.fromAppointment}</p> : null}

        <FormField htmlFor={`${ids}-template`} label={copy.template} hint={templatesFailed ? undefined : copy.templateHint}>
          {templatesFailed ? (
            <FieldError
              label={copy.templatesError}
              retryId={`${ids}-template`}
              className="h-10"
              onRetry={() => {
                setTemplatesFailed(false);
                setTemplatesReload((k) => k + 1);
              }}
            />
          ) : (
            <NativeSelect
              id={`${ids}-template`}
              value={templateId}
              disabled={submitting || templates === null}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">{copy.noTemplate}</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField htmlFor={`${ids}-kind`} label={copy.kind}>
          <NativeSelect
            id={`${ids}-kind`}
            value={kind}
            disabled={submitting}
            onChange={(e) => setKind(e.target.value as ExternalOrderKind)}
          >
            {EXTERNAL_ORDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {EXTERNAL_ORDER_KIND_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <div className="flex flex-col gap-2">
          <FormField htmlFor={`${ids}-recipient`} label={copy.recipient} hint={copy.recipientHint} error={recipientError}>
            <Input
              id={`${ids}-recipient`}
              value={recipient}
              maxLength={L.recipientMax}
              autoComplete="off"
              placeholder={copy.recipientPlaceholder}
              disabled={submitting}
              aria-invalid={recipientError ? true : undefined}
              onChange={(e) => {
                setRecipient(e.target.value);
                setRecipientError(null);
              }}
            />
          </FormField>
          {visibleSuggestions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span id={`${ids}-suggestions`} className="t-caption text-muted">
                {copy.suggestions}
              </span>
              <ul aria-labelledby={`${ids}-suggestions`} className="flex flex-wrap gap-2">
                {visibleSuggestions.map((s) => (
                  <li key={s.name} className="min-w-0 max-w-full">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="max-w-full max-sm:min-h-11"
                      disabled={submitting}
                      aria-label={copy.useSuggestion(s.name)}
                      onClick={() => {
                        setRecipient(s.name);
                        setRecipientError(null);
                      }}
                    >
                      <span className="truncate">{s.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="t-label mb-1 text-muted">{copy.items}</legend>
          <p id={`${ids}-items-hint`} className="text-xs text-muted">
            {copy.itemsHint}
          </p>
          {items.map((it, i) => (
            <div key={it.key} className="flex items-center gap-2">
              <Input
                id={`${ids}-item-${it.key}`}
                aria-label={copy.item(i + 1)}
                value={it.text}
                maxLength={L.itemMax}
                disabled={submitting}
                aria-invalid={itemsError ? true : undefined}
                aria-describedby={itemsError ? fieldErrorId(`${ids}-items`) : `${ids}-items-hint`}
                onChange={(e) => updateItem(it.key, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 max-sm:min-h-11 max-sm:min-w-11"
                disabled={submitting || (items.length === 1 && it.text === '')}
                aria-label={copy.removeItem(i + 1)}
                onClick={() => removeItem(it.key)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {itemsError ? <InlineError id={fieldErrorId(`${ids}-items`)}>{itemsError}</InlineError> : null}
          {items.length < L.itemsMax ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start max-sm:min-h-11"
              disabled={submitting}
              onClick={addItem}
            >
              <Plus aria-hidden />
              {copy.addItem}
            </Button>
          ) : null}
        </fieldset>

        <ToothChipsInput
          id={`${ids}-teeth`}
          label={copy.teeth}
          value={teeth}
          onChange={setTeeth}
          onInvalidChange={setTeethInvalid}
          disabled={submitting}
          max={L.teethMax}
        />

        <FormField htmlFor={`${ids}-note`} label={copy.note} hint={copy.noteHint}>
          <Textarea
            id={`${ids}-note`}
            rows={3}
            autoGrow
            value={note}
            maxLength={L.noteMax}
            disabled={submitting}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </div>
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={issued ? copy.close : copy.submit}
      submitting={submitting}
      error={issued ? null : error}
      touchTargets
      ownValidation
    >
      {body}
    </FormModal>
  );
}
