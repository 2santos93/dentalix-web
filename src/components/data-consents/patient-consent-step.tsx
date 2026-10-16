'use client';
import * as React from 'react';
import { useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import {
  canPublishPrivacyPolicy,
  type ConsentSelection,
  type PrivacyPolicyVersion,
} from '@/lib/data-consents/data-consents-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { AsyncSection } from '@/components/shared/async-section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConsentScopeFields } from './consent-scope-fields';
import { usePrivacyPolicies } from './use-privacy-policies';

const copy = {
  title: 'Autorización de tratamiento de datos',
  description:
    'Ley 1581 de 2012. Se guarda la versión de la política, quién la registra y cuándo. Si el paciente no autoriza ahora, puedes registrarlo después en la pestaña «Autorizaciones» de su ficha.',
  loadError: 'No pudimos cargar la política de tratamiento de datos.',
  emptyTitle: 'La clínica aún no ha publicado su política de tratamiento de datos.',
  emptyAdmin: 'Publícala para poder registrar la autorización del paciente.',
  emptyStaff:
    'Pide a un administrador que la publique. Puedes crear el paciente y registrar la autorización más tarde.',
  publish: 'Publicar la política',
};

interface PatientConsentStepProps {
  token: string;
  value: ConsentSelection;
  onChange: (next: ConsentSelection) => void;
  /** La versión que se está mostrando (o `null` si no hay ninguna publicada). */
  onPolicyChange: (policy: PrivacyPolicyVersion | null) => void;
}

/** Paso «Autorización de datos» del alta (DX-037). */
export function PatientConsentStep({
  token,
  value,
  onChange,
  onPolicyChange,
}: PatientConsentStepProps) {
  const { data, loading, failed, reload } = usePrivacyPolicies(token);
  const current = data?.current ?? null;
  const isAdmin = canPublishPrivacyPolicy(getTokenRole(token));

  useEffect(() => {
    onPolicyChange(current);
  }, [current, onPolicyChange]);

  return (
    <section aria-labelledby="pcs-title" className="flex flex-col gap-3">
      <div>
        <h2 id="pcs-title" className="t-title text-ink">
          {copy.title}
        </h2>
        <p className="mt-1 max-w-[68ch] text-sm text-muted">{copy.description}</p>
      </div>
      <AsyncSection
        loading={loading}
        error={failed ? copy.loadError : null}
        onRetry={reload}
        isEmpty={!current}
        emptyTitle={copy.emptyTitle}
        emptyDescription={isAdmin ? copy.emptyAdmin : copy.emptyStaff}
        emptyIcon={<ShieldCheck aria-hidden />}
        emptyAction={
          isAdmin ? (
            <Button asChild variant="secondary">
              <Link href="/settings/privacidad">{copy.publish}</Link>
            </Button>
          ) : undefined
        }
        skeleton={
          <div className="flex flex-col gap-3" role="status" aria-label="Cargando">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        }
      >
        {current ? (
          <ConsentScopeFields
            idPrefix="pcw-consent"
            policy={current}
            value={value}
            onChange={onChange}
          />
        ) : null}
      </AsyncSection>
    </section>
  );
}
