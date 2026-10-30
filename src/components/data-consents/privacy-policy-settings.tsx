'use client';
import * as React from 'react';
import { useState } from 'react';
import { Check, FileText, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CONSENT_SCOPES,
  SCOPE_LABELS,
  canPublishPrivacyPolicy,
  publishPrivacyPolicy,
  scopeText,
  type PrivacyPolicyVersion,
  type PublishPrivacyPolicyInput,
} from '@/lib/data-consents/data-consents-api';
import { POLICY_TEMPLATE, checkSensitiveHealthText } from '@/lib/data-consents/policy-template';
import { getTokenRole } from '@/lib/auth/token-role';
import { formatDate } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { usePrivacyPolicies } from './use-privacy-policies';

const copy = {
  publish: 'Publicar nueva versión',
  publishFirst: 'Publicar la política',
  modalTitle: 'Publicar política de tratamiento de datos',
  modalDescription:
    'Al publicarla pasa a ser la vigente y queda fija: no se podrá editar. Para cambiarla, se publica otra versión; las autorizaciones ya registradas siguen apuntando a la versión que el paciente aceptó.',
  submit: 'Publicar',
  policyText: 'Texto completo de la política',
  generalText: 'Casilla «Datos personales»',
  sensitiveText: 'Casilla «Datos sensibles de salud»',
  marketingText: 'Casilla «Comunicaciones comerciales»',
  checklist: 'El texto de datos sensibles debe informar (Dec. 1377, art. 6):',
  present: 'incluido',
  missing: 'falta',
  emptyRequired: 'Completa los cuatro textos antes de publicar.',
  missingRequired: 'Al texto de datos sensibles le falta información obligatoria.',
  genericError: 'No pudimos publicar la política. Intenta de nuevo.',
  loadError: 'No pudimos cargar la política de tratamiento de datos.',
  emptyTitle: 'La clínica aún no ha publicado su política de tratamiento de datos.',
  emptyAdmin:
    'Sin política publicada no se puede registrar la autorización de los pacientes. Parte de una plantilla y adáptala.',
  emptyStaff: 'Pide a un administrador que la publique.',
  currentHeading: 'Versión vigente',
  currentMeta: (version: number, date: string, by: string) =>
    `Versión ${version} · publicada el ${date} por ${by}`,
  hash: 'Huella (sha256)',
  historyHeading: 'Versiones anteriores',
  historyMeta: (date: string, by: string) => `${date} · ${by}`,
  readOnly: 'Solo un administrador puede publicar una versión nueva.',
  current: 'Vigente',
};

type Draft = PublishPrivacyPolicyInput;

function draftFrom(policy: PrivacyPolicyVersion | null): Draft {
  if (!policy) return { ...POLICY_TEMPLATE };
  return {
    policyText: policy.policyText,
    generalText: policy.generalText,
    sensitiveHealthText: policy.sensitiveHealthText,
    marketingText: policy.marketingText,
  };
}

/**
 * Ajustes › Privacidad de datos (DX-037): la versión vigente, las anteriores
 * y, para ADMIN, publicar una nueva. No hay edición: lo publicado es lo que
 * los pacientes aceptaron.
 */
export function PrivacyPolicySettings({ token }: { token: string }) {
  const { data, loading, failed, reload } = usePrivacyPolicies(token);
  const isAdmin = canPublishPrivacyPolicy(getTokenRole(token));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(POLICY_TEMPLATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = data?.current ?? null;
  const previous = data?.history.filter((p) => p.id !== current?.id) ?? [];
  const checks = checkSensitiveHealthText(draft.sensitiveHealthText);

  function openModal() {
    setDraft(draftFrom(current));
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (Object.values(draft).some((text) => text.trim() === '')) {
      setError(copy.emptyRequired);
      return;
    }
    if (checks.some((c) => !c.present)) {
      setError(copy.missingRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await publishPrivacyPolicy(token, draft);
      setOpen(false);
      reload();
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const publishButton = isAdmin ? (
    <Button onClick={openModal} className="w-full sm:w-auto">
      <FileText aria-hidden />
      {current ? copy.publish : copy.publishFirst}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <AsyncSection
        loading={loading}
        error={failed ? copy.loadError : null}
        onRetry={reload}
        isEmpty={!current}
        emptyTitle={copy.emptyTitle}
        emptyDescription={isAdmin ? copy.emptyAdmin : copy.emptyStaff}
        emptyIcon={<FileText aria-hidden />}
        emptyAction={publishButton ?? undefined}
      >
        {current ? (
          <div className="flex flex-col gap-6">
            <section aria-labelledby="pps-current" className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 id="pps-current" className="t-title flex items-center gap-2 text-ink">
                    {copy.currentHeading}
                    <Badge variant="success">{copy.current}</Badge>
                  </h2>
                  <p className="mt-1 text-sm text-muted tabular-nums">
                    {copy.currentMeta(
                      current.version,
                      formatDate(current.publishedAt),
                      current.publishedBy.fullName,
                    )}
                  </p>
                </div>
                {publishButton}
              </div>
              <PolicyBody policy={current} />
              {!isAdmin ? <p className="text-sm text-muted">{copy.readOnly}</p> : null}
            </section>

            {previous.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="t-label text-muted">{copy.historyHeading}</h2>
                <Card className="divide-y divide-hairline p-0 shadow-none">
                  {previous.map((p) => (
                    <div key={p.id} className="px-4 py-2">
                      <Disclosure
                        summary={`Versión ${p.version}`}
                        meta={copy.historyMeta(formatDate(p.publishedAt), p.publishedBy.fullName)}
                      >
                        <PolicyBody policy={p} />
                      </Disclosure>
                    </div>
                  ))}
                </Card>
              </section>
            ) : null}
          </div>
        ) : null}
      </AsyncSection>

      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={copy.modalTitle}
        description={copy.modalDescription}
        onSubmit={handleSubmit}
        submitLabel={copy.submit}
        submitting={submitting}
        error={error}
        size="lg"
      >
        <PolicyTextarea
          id="pps-policy"
          label={copy.policyText}
          rows={8}
          value={draft.policyText}
          onChange={(policyText) => setDraft({ ...draft, policyText })}
        />
        <PolicyTextarea
          id="pps-general"
          label={copy.generalText}
          value={draft.generalText}
          onChange={(generalText) => setDraft({ ...draft, generalText })}
        />
        <div className="flex flex-col gap-2">
          <PolicyTextarea
            id="pps-sensitive"
            label={copy.sensitiveText}
            rows={4}
            value={draft.sensitiveHealthText}
            onChange={(sensitiveHealthText) => setDraft({ ...draft, sensitiveHealthText })}
            describedBy="pps-sensitive-checks"
          />
          <div id="pps-sensitive-checks" className="flex flex-col gap-1 text-sm">
            <p className="text-muted">{copy.checklist}</p>
            <ul className="flex flex-col gap-1">
              {checks.map((c) => (
                <li
                  key={c.element}
                  className={cn('flex items-center gap-2', c.present ? 'text-success-text' : 'text-danger-text')}
                >
                  {c.present ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
                  <span className="text-ink">{c.label}</span>
                  <span className="sr-only">: {c.present ? copy.present : copy.missing}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <PolicyTextarea
          id="pps-marketing"
          label={copy.marketingText}
          value={draft.marketingText}
          onChange={(marketingText) => setDraft({ ...draft, marketingText })}
        />
      </FormModal>
    </div>
  );
}

function PolicyTextarea({
  id,
  label,
  value,
  onChange,
  rows = 3,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  describedBy?: string;
}) {
  return (
    <FormField htmlFor={id} label={label}>
      <textarea
        id={id}
        rows={rows}
        required
        value={value}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </FormField>
  );
}

function PolicyBody({ policy }: { policy: PrivacyPolicyVersion }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        role="region"
        aria-label={`${copy.policyText} (versión ${policy.version})`}
        tabIndex={0}
        className="max-h-64 overflow-y-auto whitespace-pre-line rounded-lg border border-border bg-surface-2 p-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {policy.policyText}
      </div>
      <dl className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-surface">
        {CONSENT_SCOPES.map((scope) => (
          <div key={scope} className="flex flex-col gap-1 px-4 py-3">
            <dt className="t-label text-muted">{SCOPE_LABELS[scope]}</dt>
            <dd className="whitespace-pre-line text-sm text-ink">{scopeText(policy, scope)}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-1 px-4 py-3">
          <dt className="t-label text-muted">{copy.hash}</dt>
          <dd className="break-all font-mono text-xs text-muted">{policy.contentHash}</dd>
        </div>
      </dl>
    </div>
  );
}
