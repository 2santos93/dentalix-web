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
    'Se guarda la versión de la política, quién la registra y cuándo. Si el paciente no autoriza ahora, puedes registrarlo después en la pestaña «Autorizaciones» de su ficha.',
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
  /**
   * DX-058: cada cambio vuelve a pedir la política vigente (p. ej. tras un 409
   * `PRIVACY_POLICY_OUTDATED` del alta). El valor inicial no recarga.
   */
  reloadSignal?: number;
}

/** Paso «Autorización de datos» del alta (DX-037). */
export function PatientConsentStep({
  token,
  value,
  onChange,
  onPolicyChange,
  reloadSignal = 0,
}: PatientConsentStepProps) {
  const { data, loading, failed, reload } = usePrivacyPolicies(token);
  const current = data?.current ?? null;
  const isAdmin = canPublishPrivacyPolicy(getTokenRole(token));

  // Solo cuando cambia la señal, no al montar (el hook ya carga entonces).
  const lastSignal = React.useRef(reloadSignal);
  useEffect(() => {
    if (lastSignal.current === reloadSignal) return;
    lastSignal.current = reloadSignal;
    reload();
  }, [reloadSignal, reload]);

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
            token={token}
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
