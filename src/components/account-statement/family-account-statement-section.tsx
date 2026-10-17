'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  familyAccountStatementPrintHref,
  getFamilyAccountStatement,
  type FamilyAccountStatement,
} from '@/lib/account-statement/account-statement-api';
import { statementCopy } from '@/lib/account-statement/presentation';
import { RELATIONSHIP_LABELS } from '@/lib/patients/responsible-parties-api';
import { formatCurrency } from '@/lib/format/currency';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { familyStatementCopy } from './family-account-statement-document';

const copy = {
  ...familyStatementCopy,
  description:
    'Este paciente es el pagador principal de otros pacientes: su saldo y el de cada uno, con el total. Los abonos se registran en el estado de cuenta de cada paciente.',
  print: 'Imprimir estado familiar',
  printHint: '(se abre en otra pestaña)',
  loading: 'Cargando el estado de cuenta familiar',
  loadError: 'No pudimos cargar el estado de cuenta familiar.',
};

/**
 * Estado de cuenta familiar en la pestaña «Estado de cuenta» del pagador
 * (DX-203). Solo aparece si es pagador principal de alguien (la API siempre
 * lo trae a él como titular). Solo lectura.
 */
export function FamilyAccountStatementSection({
  token,
  patientId,
  refreshKey = 0,
}: {
  token: string;
  patientId: string;
  /** Cambia cuando se registra o anula un abono en la ficha. */
  refreshKey?: number;
}) {
  const [data, setData] = useState<FamilyAccountStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const headingId = React.useId();

  useEffect(() => {
    let cancelled = false;
    getFamilyAccountStatement(token, patientId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey, refreshKey]);

  // Sin dependientes no hay nada familiar que mostrar.
  if (data && data.members.length < 2) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3" data-testid="family-statement">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold text-ink">
            {copy.title}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.description}</p>
        </div>
        {data ? (
          <Button asChild variant="outline" className="max-sm:h-11 max-sm:w-full">
            <a href={familyAccountStatementPrintHref(patientId)} target="_blank" rel="noopener noreferrer">
              <Printer aria-hidden />
              {copy.print}
              <span className="sr-only"> {copy.printHint}</span>
            </a>
          </Button>
        ) : null}
      </div>
      {error ? (
        <SectionError
          description={error}
          onRetry={() => {
            setError(null);
            setData(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : !data ? (
        <div role="status" aria-label={copy.loading}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-surface">
            {data.members.map((m) => (
              <li
                key={m.patient.id}
                data-testid="family-member"
                className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="break-words font-medium text-ink">
                    {m.patient.firstName} {m.patient.lastName}
                  </span>
                  <span className="text-sm text-muted">
                    {' '}
                    · {m.self || !m.relationship ? copy.self : RELATIONSHIP_LABELS[m.relationship]}
                  </span>
                </span>
                <span className="flex flex-col text-sm tabular-nums text-ink sm:items-end">
                  {m.summary.length === 0 ? (
                    <span className="text-muted">{copy.noBalance}</span>
                  ) : (
                    m.summary.map((s) => (
                      <span key={s.currency}>
                        {copy.colBalance}: {formatCurrency(Math.abs(s.balance), s.currency)}
                        {s.balance < 0 ? ` ${statementCopy.inFavor}` : ''}
                      </span>
                    ))
                  )}
                </span>
              </li>
            ))}
          </ul>
          {data.totals.map((t) => (
            <p
              key={t.currency}
              data-testid="family-total"
              className="flex flex-wrap justify-between gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-semibold tabular-nums text-ink"
            >
              <span>
                {copy.totalsHeading} ({t.currency})
              </span>
              <span>
                {formatCurrency(Math.abs(t.balance), t.currency)}
                {t.balance < 0 ? ` ${statementCopy.inFavor}` : ''}
              </span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
