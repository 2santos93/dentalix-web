'use client';
import * as React from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import type { CallerLeadMatch } from '@/lib/caller-lookup/caller-lookup-api';
import { leadHref } from '@/lib/leads/leads-api';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';

export const callerLeadsCopy = {
  heading: (n: number) => (n === 1 ? 'Prospecto con ese número' : 'Prospectos con ese número'),
  converted: 'Ya es paciente',
  openLead: (name: string) => `Abrir el prospecto ${name}`,
};

/**
 * DX-556: los prospectos con el número (la API solo los manda a ADMIN y
 * RECEPTION, de sus sedes). Cada fila abre su ficha de prospecto.
 */
export function CallerLeads({ leads, onOpen }: { leads: readonly CallerLeadMatch[]; onOpen: () => void }) {
  return (
    <section aria-labelledby="caller-leads-heading" data-testid="caller-leads" className="flex flex-col gap-2">
      <h3 id="caller-leads-heading" className="text-sm font-medium text-ink">
        {callerLeadsCopy.heading(leads.length)}
      </h3>
      <ul className="flex flex-col gap-2">
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="relative flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2 hover:bg-surface-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserPlus aria-hidden className="size-4 shrink-0 text-muted" />
              <Link
                href={leadHref(lead.id)}
                onClick={onOpen}
                aria-label={callerLeadsCopy.openLead(lead.fullName)}
                className="min-w-0 font-medium text-ink [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
              >
                {lead.fullName}
              </Link>
            </span>
            <span className="flex items-center gap-2">
              {lead.convertedPatientId ? <Badge variant="neutral">{callerLeadsCopy.converted}</Badge> : null}
              <StatusBadge kind="lead" status={lead.stage} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
