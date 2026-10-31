'use client';
import * as React from 'react';
import {
  CONSENT_SCOPES,
  SCOPE_LABELS,
  scopeText,
  type ConsentSelection,
  type DataConsentScope,
  type PrivacyPolicyVersion,
} from '@/lib/data-consents/data-consents-api';
import { formatDate } from '@/lib/format/date';
import { Checkbox } from '@/components/ui/checkbox';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  policyMeta: (version: number, date: string) => `Versión ${version} · publicada el ${date}`,
  policyRegion: 'Texto completo de la política de tratamiento de datos',
  legend: 'Lo que el paciente autoriza',
  legendHint:
    'Lee o entrega el texto al paciente y marca solo lo que autoriza de forma expresa. Ninguna casilla es obligatoria.',
  optional: 'Opcional',
  sensitiveNote: 'Datos sensibles: el paciente no está obligado a autorizarlos.',
};

interface ConsentScopeFieldsProps {
  policy: PrivacyPolicyVersion;
  value: ConsentSelection;
  onChange: (next: ConsentSelection) => void;
  /** Prefijo de ids, para que dos instancias no choquen en la misma página. */
  idPrefix: string;
  /** Scopes que ya no se ofrecen (p. ej. los que el paciente ya autorizó). */
  hiddenScopes?: readonly DataConsentScope[];
}

/**
 * El texto vigente de la política y una casilla POR SCOPE (Dec. 1377: los
 * datos sensibles van aparte). Ninguna viene marcada: la casilla la marca
 * quien atiende al paciente, ante su autorización expresa. Lo usan el alta
 * del paciente y «Registrar autorización» de la ficha.
 */
export function ConsentScopeFields({
  policy,
  value,
  onChange,
  idPrefix,
  hiddenScopes = [],
}: ConsentScopeFieldsProps) {
  const scopes = CONSENT_SCOPES.filter((s) => !hiddenScopes.includes(s));
  const hintId = `${idPrefix}-hint`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          {copy.policyMeta(policy.version, formatDate(policy.publishedAt))}
        </p>
        {/* Región con scroll propio: la política puede ocupar páginas y no debe
            empujar las casillas fuera de la vista. Enfocable para leerla con
            teclado. */}
        <div
          role="region"
          aria-label={copy.policyRegion}
          tabIndex={0}
          className="max-h-48 overflow-y-auto whitespace-pre-line rounded-lg border border-border bg-surface-sunken p-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
        >
          {policy.policyText}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={hintId}>
        <legend className="t-label text-ink">{copy.legend}</legend>
        <p id={hintId} className="text-sm text-muted">
          {copy.legendHint}
        </p>
        {scopes.map((scope) => {
          const id = `${idPrefix}-${scope}`;
          return (
            <div key={scope} className="rounded-lg border border-border bg-surface px-3 py-1">
              <Checkbox
                id={id}
                name={`consent-${scope}`}
                checked={value[scope]}
                onChange={(e) => onChange({ ...value, [scope]: e.target.checked })}
                label={
                  <>
                    {SCOPE_LABELS[scope]}
                    <span className="ml-2 t-caption font-normal">({copy.optional})</span>
                  </>
                }
                description={
                  <span className="flex flex-col gap-1">
                    <span className="whitespace-pre-line text-ink">{scopeText(policy, scope)}</span>
                    {scope === 'SENSITIVE_HEALTH' ? <span>{copy.sensitiveNote}</span> : null}
                  </span>
                }
              />
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
