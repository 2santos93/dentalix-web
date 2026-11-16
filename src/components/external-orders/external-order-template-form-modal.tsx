'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  cleanLines,
  createExternalOrderTemplate,
  EXTERNAL_ORDER_KIND_LABELS,
  EXTERNAL_ORDER_KINDS,
  EXTERNAL_ORDER_LIMITS as L,
  EXTERNAL_ORDER_TEMPLATE_DUPLICATE_NAME,
  EXTERNAL_ORDER_TEMPLATE_STALE,
  updateExternalOrderTemplate,
  type ExternalOrderKind,
  type ExternalOrderTemplate,
} from '@/lib/external-orders/external-orders-api';
import { InlineError } from '@/components/errors/inline-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

export const externalOrderTemplateFormCopy = {
  createTitle: 'Nueva plantilla de orden',
  editTitle: 'Editar plantilla de orden',
  description:
    'Precarga el tipo, el destinatario habitual y los estudios al emitir una orden. Editarla no cambia las órdenes ya emitidas.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Radiografía panorámica',
  kind: 'Tipo',
  recipient: 'Destinatario habitual (opcional)',
  recipientHint: 'El centro o el especialista al que suele ir.',
  items: 'Estudios o motivo',
  itemsHint: `Una línea por estudio, hasta ${L.itemsMax}.`,
  item: (n: number) => `Estudio ${n}`,
  addItem: 'Añadir estudio',
  removeItem: (n: number) => `Quitar el estudio ${n}`,
  create: 'Crear plantilla',
  save: 'Guardar cambios',
  invalidName: `Escribe un nombre (hasta ${L.templateNameMax} caracteres).`,
  itemsRequired: 'Escribe al menos un estudio.',
  genericError: 'No pudimos guardar la plantilla. Intenta de nuevo.',
  stale:
    'La plantilla cambió mientras la editabas. Recárgala para ver la versión guardada; lo que cambiaste sin guardar se descarta.',
  reload: 'Recargar',
  reloadError: 'No pudimos recargar la plantilla. Intenta de nuevo.',
  reloadGone: 'La plantilla ya no está en la lista. Cierra y vuelve a abrirla.',
};

const copy = externalOrderTemplateFormCopy;

interface ItemDraft {
  key: number;
  text: string;
}

function itemsOf(template: ExternalOrderTemplate | null): ItemDraft[] {
  const lines = template && template.items.length > 0 ? template.items : [''];
  return lines.map((text, key) => ({ key, text }));
}

interface ExternalOrderTemplateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin plantilla: alta. Con plantilla: edición. */
  template?: ExternalOrderTemplate | null;
  onSaved: (template: ExternalOrderTemplate) => void;
  /**
   * «Recargar» tras un 409 de versión: la API no tiene `GET /:id`, así que el
   * padre relee la lista y devuelve la versión guardada (o null si ya no está).
   */
  onReload: () => Promise<ExternalOrderTemplate | null>;
}

/**
 * Alta y edición de una plantilla de orden externa (DX-572, solo ADMIN):
 * nombre, tipo, destinatario habitual y estudios. Bloqueo optimista con
 * `version` (409 `EXTERNAL_ORDER_TEMPLATE_STALE` → «Recargar») y nombre único
 * (409 `…_DUPLICATE_NAME`, junto al campo). El padre lo monta con una `key` por
 * apertura.
 */
export function ExternalOrderTemplateFormModal({
  open,
  onOpenChange,
  token,
  template,
  onSaved,
  onReload,
}: ExternalOrderTemplateFormModalProps) {
  const ids = useId();
  const [current, setCurrent] = useState<ExternalOrderTemplate | null>(template ?? null);
  const editing = current !== null;
  const [name, setName] = useState(template?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [kind, setKind] = useState<ExternalOrderKind>(template?.kind ?? 'IMAGING');
  const [recipient, setRecipient] = useState(template?.recipient ?? '');
  const [items, setItems] = useState<ItemDraft[]>(() => itemsOf(template ?? null));
  const [nextKey, setNextKey] = useState(() => Math.max(1, template?.items.length ?? 1));
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  function applyTemplate(t: ExternalOrderTemplate) {
    setCurrent(t);
    setName(t.name);
    setKind(t.kind);
    setRecipient(t.recipient ?? '');
    setItems(itemsOf(t));
    setNextKey(Math.max(1, t.items.length));
    setNameError(null);
    setItemsError(null);
  }

  async function handleReload() {
    setReloading(true);
    try {
      const fresh = await onReload();
      if (!fresh) {
        setError(copy.reloadGone);
        setStale(false);
        return;
      }
      applyTemplate(fresh);
      setStale(false);
      setError(null);
    } catch {
      setError(copy.reloadError);
    } finally {
      setReloading(false);
    }
  }

  function updateItem(key: number, text: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, text } : it)));
    setItemsError(null);
  }

  function removeItem(key: number) {
    setItems((prev) => (prev.length === 1 ? [{ key: prev[0].key, text: '' }] : prev.filter((it) => it.key !== key)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStale(false);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > L.templateNameMax) {
      setNameError(copy.invalidName);
      return;
    }
    const lines = cleanLines(items.map((it) => it.text));
    if (lines.length === 0) {
      setItemsError(copy.itemsRequired);
      return;
    }
    const trimmedRecipient = recipient.trim();
    setSubmitting(true);
    try {
      const saved = current
        ? await updateExternalOrderTemplate(token, current.id, {
            name: trimmed,
            kind,
            recipient: trimmedRecipient === '' ? null : trimmedRecipient,
            items: lines,
            version: current.version,
          })
        : await createExternalOrderTemplate(token, {
            name: trimmed,
            kind,
            ...(trimmedRecipient === '' ? {} : { recipient: trimmedRecipient }),
            items: lines,
            active: true,
          });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericError);
      if (err instanceof ApiError && err.status === 409 && err.code === EXTERNAL_ORDER_TEMPLATE_STALE) {
        setStale(true);
        setError(copy.stale);
      } else if (err instanceof ApiError && err.status === 409 && err.code === EXTERNAL_ORDER_TEMPLATE_DUPLICATE_NAME) {
        setNameError(message);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || reloading;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={busy}
      error={error}
      errorRetry={stale ? { label: copy.reload, onRetry: () => void handleReload() } : null}
      touchTargets
      ownValidation
    >
      <div className="flex flex-col gap-4">
        <FormField htmlFor={`${ids}-name`} label={copy.name} error={nameError}>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={L.templateNameMax}
            placeholder={copy.namePlaceholder}
            disabled={busy}
            aria-invalid={nameError ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
        </FormField>

        <FormField htmlFor={`${ids}-kind`} label={copy.kind}>
          <NativeSelect
            id={`${ids}-kind`}
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value as ExternalOrderKind)}
          >
            {EXTERNAL_ORDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {EXTERNAL_ORDER_KIND_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField htmlFor={`${ids}-recipient`} label={copy.recipient} hint={copy.recipientHint}>
          <Input
            id={`${ids}-recipient`}
            value={recipient}
            maxLength={L.recipientMax}
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </FormField>

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
                disabled={busy}
                aria-invalid={itemsError ? true : undefined}
                aria-describedby={itemsError ? fieldErrorId(`${ids}-items`) : `${ids}-items-hint`}
                onChange={(e) => updateItem(it.key, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 max-sm:min-h-11 max-sm:min-w-11"
                disabled={busy || (items.length === 1 && it.text === '')}
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
              disabled={busy}
              onClick={() => {
                setItems((prev) => [...prev, { key: nextKey, text: '' }]);
                setNextKey((k) => k + 1);
              }}
            >
              <Plus aria-hidden />
              {copy.addItem}
            </Button>
          ) : null}
        </fieldset>
      </div>
    </FormModal>
  );
}
