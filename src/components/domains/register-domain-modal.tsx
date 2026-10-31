'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { registerDomain, type TenantDomain } from '@/lib/domains/domains-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';

const copy = {
  title: 'Añadir dominio propio',
  description:
    'Después publicarás un registro TXT en el DNS de ese dominio para demostrar que es tuyo. Tienes 72 horas para verificarlo, y solo abre Dentalix mientras ese registro siga publicado.',
  host: 'Dominio',
  hostPlaceholder: 'citas.miclinica.com',
  hostHint: 'Un dominio que controlas, sin https:// ni rutas.',
  submit: 'Añadir dominio',
  invalidHost: 'Escribe un dominio válido, por ejemplo citas.miclinica.com.',
  genericError: 'No pudimos añadir el dominio. Intenta de nuevo.',
};

// Igual que CreateDomainDto en la API: etiquetas alfanuméricas o con guiones
// separadas por puntos y un TLD de letras, hasta 253 caracteres.
const HOST_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Quita el esquema, la ruta y el puerto que se cuelan al pegar una URL. */
export function normalizeHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

interface RegisterDomainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onRegistered: (domain: TenantDomain) => void;
}

/**
 * Alta de un dominio propio en PENDING (SEC-009, solo ADMIN). Registrarlo no
 * reserva nada: lo gana la primera clínica que publica el TXT. El padre lo
 * monta con una `key` por apertura.
 */
export function RegisterDomainModal({
  open,
  onOpenChange,
  token,
  onRegistered,
}: RegisterDomainModalProps) {
  const [host, setHost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const value = normalizeHost(host);
    if (!HOST_PATTERN.test(value)) return setError(copy.invalidHost);
    setSubmitting(true);
    try {
      const { domain } = await registerDomain(token, value);
      onRegistered(domain);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor="domain-host" label={copy.host} hint={copy.hostHint}>
        <Input
          id="domain-host"
          value={host}
          maxLength={253}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={copy.hostPlaceholder}
          onChange={(e) => setHost(e.target.value)}
          required
        />
      </FormField>
    </FormModal>
  );
}
