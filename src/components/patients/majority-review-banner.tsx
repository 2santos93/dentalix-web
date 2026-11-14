'use client';
import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { getMajorityReview, type MajorityReviewView } from '@/lib/patients/majority-review-api';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { MajorityReviewDialog } from './majority-review-dialog';

export const majorityBannerCopy = {
  title: (age: number, date: string | null) =>
    `Cumplió ${age} años${date ? ` el ${date}` : ''}: revisa a quién van sus avisos y recibos`,
  body: 'Mientras no se revise, sus avisos y recibos no van a su responsable.',
  bodyNoAction: 'Mientras no se revise, sus avisos y recibos no van a su responsable. Lo revisan recepción y administración.',
  action: 'Revisar responsables',
  loadError: 'No pudimos comprobar si el paciente cumplió la mayoría de edad.',
};
const copy = majorityBannerCopy;

type State =
  | { key: string; kind: 'loading' }
  | { key: string; kind: 'hidden' }
  | { key: string; kind: 'error'; message: string }
  | { key: string; kind: 'ready'; view: MajorityReviewView };

interface MajorityReviewBannerProps {
  token: string;
  patient: { id: string; fullName: string };
  /** ADMIN y RECEPTION: ven «Revisar responsables». Los demás, solo el aviso. */
  canReview: boolean;
  stamp: SedePainters;
}

/**
 * DX-342: aviso de la ficha cuando el paciente llegó a la mayoría de edad con
 * un responsable de cuando era menor y nadie ha revisado aún a quién van sus
 * avisos. Solo se pinta en PENDING. Un 403 (el rol no lee la revisión) no
 * pinta nada; otro fallo deja el aviso de error con «Reintentar» (escalón 1).
 */
export function MajorityReviewBanner({ token, patient, canReview, stamp }: MajorityReviewBannerProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${patient.id}:${reloadKey}`;
  const [state, setState] = useState<State>({ key, kind: 'loading' });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMajorityReview(token, patient.id)
      .then((view) => {
        if (!cancelled) setState({ key, kind: 'ready', view });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setState({ key, kind: 'hidden' });
        } else {
          setState({ key, kind: 'error', message: apiErrorMessage(err, { fallback: copy.loadError }) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, patient.id, key]);

  const current: State = state.key === key ? state : { key, kind: 'loading' };

  if (current.kind === 'error') {
    return (
      <SectionError
        description={current.message}
        onRetry={() => setReloadKey((k) => k + 1)}
        className="py-8"
      />
    );
  }
  if (current.kind !== 'ready' || current.view.status !== 'PENDING') return null;

  const view = current.view;
  const date = view.majorityDate ? stamp.maybe.civilDate(view.majorityDate) : null;
  return (
    <>
      <Callout
        tone="warning"
        icon={UserCheck}
        titleAs="h2"
        title={copy.title(view.majorityAge, date)}
        data-testid="majority-review-banner"
        action={
          canReview ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="max-sm:min-h-11 max-sm:w-full">
              {copy.action}
            </Button>
          ) : undefined
        }
      >
        {canReview ? copy.body : copy.bodyNoAction}
      </Callout>
      {canReview ? (
        <MajorityReviewDialog
          open={open}
          onOpenChange={setOpen}
          token={token}
          patientId={patient.id}
          patientName={patient.fullName}
          stamp={stamp}
          onReviewed={(next) => setState({ key, kind: 'ready', view: next })}
        />
      ) : null}
    </>
  );
}
