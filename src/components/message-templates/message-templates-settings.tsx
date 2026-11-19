'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  listMessageTemplates,
  type MessageEntry,
  type MessageKey,
  type MessageTemplate,
  type MessageTemplates,
} from '@/lib/message-templates/message-templates-api';
import { apiErrorMessage } from '@/lib/api/error-message';
import { languageName } from '@/lib/patients/patient-languages';
import { SectionError } from '@/components/errors/section-error';
import { SectionSkeleton } from '@/components/shared/async-section';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CHANNEL_LABELS, messageStatusCopy } from './message-template-labels';

/*
 * El editor (modal, pestañas, tooltips, vista previa) llega en su propio trozo
 * al pulsar «Editar»: la lista se pinta sin él. Sin `loading`: el modal
 * aparece cuando llega (el botón ya tiene el foco). `ssr: false` como el resto
 * de diálogos bajo demanda (`patient-lazy-tabs`).
 */
const MessageTemplateEditor = dynamic(
  () => import('./message-template-editor').then((m) => m.MessageTemplateEditor),
  { ssr: false },
);

export const messageTemplatesCopy = {
  edit: 'Editar',
  editLabel: (title: string) => `Editar «${title}»`,
  loadError: 'No pudimos cargar los mensajes.',
  retired: 'ya no se ofrece',
};

const copy = messageTemplatesCopy;

/** El catálogo con la combinación recién guardada o restablecida. */
export function withTemplate(catalog: MessageTemplates, template: MessageTemplate): MessageTemplates {
  return {
    ...catalog,
    messages: catalog.messages.map((message) =>
      message.key !== template.key
        ? message
        : {
            ...message,
            channels: message.channels.map((channel) =>
              channel.channel !== template.channel
                ? channel
                : {
                    ...channel,
                    languages: channel.languages
                      .map((entry) =>
                        entry.language !== template.language
                          ? entry
                          : { ...entry, offered: template.offered, default: template.default, custom: template.custom },
                      )
                      // Un idioma retirado sin texto guardado ya no tiene nada que restablecer.
                      .filter((entry) => entry.offered || entry.custom),
                  },
            ),
          },
    ),
  };
}

/**
 * DX-565: Ajustes › Mensajes. Cada mensaje con sus canales y, por idioma, si
 * sale el texto por defecto o el de la clínica. «Editar» abre el editor.
 */
export function MessageTemplatesSettings({ token }: { token: string }) {
  const [catalog, setCatalog] = useState<MessageTemplates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMessageTemplates(token)
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  if (error && !catalog) {
    return (
      <SectionError
        description={error}
        onRetry={() => {
          setError(null);
          setReloadKey((n) => n + 1);
        }}
      />
    );
  }
  if (!catalog) return <SectionSkeleton />;

  const editingMessage = editing ? catalog.messages.find((m) => m.key === editing) ?? null : null;

  return (
    <>
      <SettingRows data-testid="message-templates-list">
        {catalog.messages.map((message) => (
          <SettingRow
            key={message.key}
            label={message.title}
            description={
              <>
                <span className="block">{message.description}</span>
                <MessageStatus message={message} />
              </>
            }
          >
            <Button
              type="button"
              variant="secondary"
              aria-label={copy.editLabel(message.title)}
              onClick={() => setEditing(message.key)}
              className="max-sm:w-full"
            >
              {copy.edit}
            </Button>
          </SettingRow>
        ))}
      </SettingRows>
      {editingMessage ? (
        <MessageTemplateEditor
          token={token}
          message={editingMessage}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={(template) => setCatalog((prev) => (prev ? withTemplate(prev, template) : prev))}
        />
      ) : null}
    </>
  );
}

/** «Email · Español (es) Por defecto · English (en) Personalizado», por canal. */
function MessageStatus({ message }: { message: MessageEntry }) {
  return (
    <span className="mt-2 flex flex-col gap-1" data-testid={`message-status-${message.key}`}>
      {message.channels.map((channel) => (
        <span key={channel.channel} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="t-caption text-ink">{CHANNEL_LABELS[channel.channel]}</span>
          {channel.languages.map((entry) => (
            <span key={entry.language} className="inline-flex items-center gap-1">
              <span className="text-xs text-muted">
                {languageName(entry.language)}
                {entry.offered ? '' : ` (${copy.retired})`}
              </span>
              <Badge variant={entry.custom ? 'info' : 'neutral'}>
                {entry.custom ? messageStatusCopy.custom : messageStatusCopy.isDefault}
              </Badge>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
