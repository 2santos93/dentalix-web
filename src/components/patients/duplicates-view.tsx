'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Lock, UsersRound } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { documentText, documentTypeName } from '@/lib/patients/doc-type';
import {
  dismissDuplicate,
  DUPLICATE_REASON_COPY,
  listDuplicates,
  type DuplicatePage,
  type DuplicatePair,
  type DuplicatePatient,
} from '@/lib/patients/patient-merge-api';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { FieldError } from '@/components/errors/field-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

// El modal de la fusión (comparación, países, idiomas) solo se descarga al
// pulsar «Fusionar…»: la lista no lo paga en su primera carga. Sin `loading`:
// mientras llega no hay nada abierto que pintar.
const MergePatientsDialog = dynamic(
  () => import('@/components/patients/merge-patients-dialog').then((m) => m.MergePatientsDialog),
  { ssr: false },
);

export const duplicatesCopy = {
  title: 'Posibles duplicados',
  description:
    'Pacientes que podrían ser la misma persona registrada dos veces. Fusiónalos para tener una sola ficha, o márcalos como distintos.',
  back: 'Pacientes',
  locationLabel: 'Sede',
  allLocations: 'Todas las sedes',
  locationsError: 'No cargaron las sedes',
  listLabel: 'Parejas de posibles duplicados',
  countNoun: 'pareja',
  countNounPlural: 'parejas',
  reasonsLabel: 'Por qué',
  code: (code: string) => `Código ${code}`,
  noDocument: 'Sin documento',
  born: (date: string) => `Nació ${date}`,
  lastAttention: (date: string) => `Última atención ${date}`,
  neverAttended: 'Sin atenciones',
  created: (date: string) => `Alta ${date}`,
  dismiss: 'No es duplicado',
  dismissLabel: (a: string, b: string) => `${a} y ${b} no son la misma persona`,
  dismissed: (a: string, b: string) => `${a} y ${b} ya no saldrán como posibles duplicados.`,
  dismissError: 'No pudimos marcar la pareja como distinta.',
  merge: 'Fusionar…',
  mergeLabel: (a: string, b: string) => `Fusionar a ${a} y ${b}`,
  merged: (name: string) => `Pacientes fusionados: la ficha de ${name} tiene ahora todo.`,
  mergedTitle: (name: string) => `Fusión hecha: queda la ficha de ${name}`,
  mergedBody: 'La otra ficha se retiró; si alguien abre su enlace o la busca, llegará a esta.',
  openKept: 'Abrir la ficha',
  emptyTitle: 'No hay posibles duplicados',
  emptyHint:
    'Revisamos documento, nombre con fecha de nacimiento y teléfono con nombre. Cuando dos fichas coincidan en algo de eso, aparecerán aquí.',
  emptyHintLocation:
    'En esta sede no hay parejas que coincidan en documento, nombre y fecha de nacimiento, o teléfono y nombre. Prueba con «Todas las sedes».',
  loadError: 'No pudimos cargar los posibles duplicados.',
  forbiddenTitle: 'Solo administración revisa los pacientes duplicados.',
  forbiddenHint: 'Si encuentras dos fichas de la misma persona, avisa a quien administra la clínica.',
};
const copy = duplicatesCopy;

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const pairKey = (pair: DuplicatePair) => pair.patients.map((p) => p.id).join(':');
const recordHref = (id: string) => `/patients/${encodeURIComponent(id)}`;

interface MergedNotice {
  patientId: string;
  name: string;
}

/**
 * DX-266: «Posibles duplicados», solo ADMIN. Vive bajo Pacientes, sin entrada
 * en el menú (presupuesto de 900 px, DESIGN.md → Navigation): se llega desde
 * la barra de la lista de pacientes y desde la paleta. Cada pareja dice por
 * qué salió; «No es duplicado» la quita de la lista y «Fusionar…» abre la
 * comparación (que llega en su propio trozo de JS).
 */
export function DuplicatesView({ token }: { token: string }) {
  const stamp = useSedeStamp(token);
  const docTypeNames = useDocumentTypeNames(token);
  const locationsState = useLocationsState(token);
  const locations = locationsState.status === 'ready' ? locationsState.locations : [];
  const multiSede = locations.length > 1;
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DuplicatePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [merging, setMerging] = useState<DuplicatePair | null>(null);
  const [busyPair, setBusyPair] = useState<string | null>(null);
  const [mergedNotice, setMergedNotice] = useState<MergedNotice | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listDuplicates(token, { page, locationId: locationId || null });
        if (cancelled) return;
        // Una página que se quedó vacía (se fusionó o descartó su última pareja) vuelve atrás.
        if (res.items.length === 0 && res.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(res.total / res.pageSize)));
          return;
        }
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, page, locationId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function dismiss(pair: DuplicatePair) {
    const [a, b] = pair.patients;
    setBusyPair(pairKey(pair));
    try {
      await dismissDuplicate(token, [a.id, b.id]);
      notifySuccess(copy.dismissed(fullName(a), fullName(b)));
      reload();
    } catch (err) {
      // Escalón 3: la lista sigue siendo correcta; la acción, con su reintento.
      notifyError(apiErrorMessage(err, { fallback: copy.dismissError }), { onRetry: () => void dismiss(pair) });
    } finally {
      setBusyPair(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        back={{ href: '/patients', label: copy.back }}
      />
      <div className="flex flex-col gap-3">
        {forbidden ? (
          <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : (
          <>
            {locationsState.status === 'error' ? (
              <div className="sm:w-72">
                <FieldError label={copy.locationsError} onRetry={locationsState.retry} />
              </div>
            ) : multiSede ? (
              <FormField htmlFor="duplicates-location" label={copy.locationLabel} className="sm:w-72">
                <NativeSelect
                  id="duplicates-location"
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{copy.allLocations}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            ) : null}
            <SedeStampNote stamp={stamp} />
            {mergedNotice ? (
              <Callout
                tone="success"
                role="status"
                title={copy.mergedTitle(mergedNotice.name)}
                action={
                  <Link
                    href={recordHref(mergedNotice.patientId)}
                    className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'max-sm:min-h-11')}
                  >
                    {copy.openKept}
                  </Link>
                }
              >
                {copy.mergedBody}
              </Callout>
            ) : null}
            <AsyncSection
              loading={loading}
              error={loadError}
              onRetry={reload}
              isEmpty={items.length === 0}
              emptyTitle={copy.emptyTitle}
              emptyDescription={locationId ? copy.emptyHintLocation : copy.emptyHint}
              emptyIcon={<UsersRound aria-hidden />}
              skeleton={<TableSkeleton rows={3} />}
            >
              <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
              <ul aria-label={copy.listLabel} className="flex flex-col gap-3">
                {items.map((pair) => (
                  <PairCard
                    key={pairKey(pair)}
                    pair={pair}
                    busy={busyPair === pairKey(pair)}
                    onDismiss={() => void dismiss(pair)}
                    onMerge={() => {
                      setMergedNotice(null);
                      setMerging(pair);
                    }}
                    renderPatient={(p) => (
                      <PatientSummary
                        patient={p}
                        document={documentText(documentTypeName(p.documentType, p.docTypeLabel, docTypeNames), p.docNumber)}
                        born={stamp.maybe.civilDate(p.birthDate)}
                        created={stamp.maybe.date(p.createdAt)}
                        lastAttention={stamp.maybe.date(p.lastAttentionAt)}
                      />
                    )}
                  />
                ))}
              </ul>
              {data && data.total > data.pageSize ? (
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onPageChange={setPage}
                  disabled={loading}
                />
              ) : null}
            </AsyncSection>
          </>
        )}
      </div>

      {merging ? (
        <MergePatientsDialog
          open
          onOpenChange={(open) => {
            if (!open) setMerging(null);
          }}
          token={token}
          pair={merging}
          stamp={stamp}
          docTypeNames={docTypeNames}
          onStale={reload}
          onMerged={(result, keptName) => {
            setMerging(null);
            setMergedNotice({ patientId: result.patientId, name: keptName });
            notifySuccess(copy.merged(keptName));
            reload();
          }}
        />
      ) : null}
    </>
  );
}

interface PairCardProps {
  pair: DuplicatePair;
  busy: boolean;
  onDismiss: () => void;
  onMerge: () => void;
  renderPatient: (patient: DuplicatePatient) => React.ReactNode;
}

function PairCard({ pair, busy, onDismiss, onMerge, renderPatient }: PairCardProps) {
  const [a, b] = pair.patients;
  const names: [string, string] = [fullName(a), fullName(b)];
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sr-only">{copy.reasonsLabel}:</span>
        {pair.reasons.map((reason) => (
          <Badge key={reason} variant="neutral" title={DUPLICATE_REASON_COPY[reason].hint}>
            {DUPLICATE_REASON_COPY[reason].label}
          </Badge>
        ))}
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 sm:gap-6">
        {pair.patients.map((p, i) => (
          <div key={p.id} className={cn('min-w-0', i === 1 && 'border-t border-border-subtle pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6')}>
            {renderPatient(p)}
          </div>
        ))}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="max-sm:min-h-11"
          aria-label={copy.dismissLabel(...names)}
          loading={busy}
          onClick={onDismiss}
        >
          {copy.dismiss}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="max-sm:min-h-11"
          aria-label={copy.mergeLabel(...names)}
          disabled={busy}
          onClick={onMerge}
        >
          {copy.merge}
        </Button>
      </div>
    </li>
  );
}

interface PatientSummaryProps {
  patient: DuplicatePatient;
  document: string | null;
  born: string | null;
  created: string | null;
  lastAttention: string | null;
}

function PatientSummary({ patient, document, born, created, lastAttention }: PatientSummaryProps) {
  const name = fullName(patient);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Link
        href={recordHref(patient.id)}
        className="text-base font-semibold break-words text-ink underline-offset-4 hover:text-primary-text hover:underline"
      >
        {name}
      </Link>
      <p className="t-id text-xs text-muted">{copy.code(patient.patientCode)}</p>
      <ul className="flex flex-col gap-0.5 text-sm text-muted [overflow-wrap:anywhere]">
        <li className="t-id">{document ?? copy.noDocument}</li>
        {born ? <li className="tnum">{copy.born(born)}</li> : null}
        {patient.phone ? <li className="tnum">{patient.phone}</li> : null}
        {patient.email ? <li>{patient.email}</li> : null}
        <li className="tnum">
          {[created ? copy.created(created) : null, lastAttention ? copy.lastAttention(lastAttention) : copy.neverAttended]
            .filter(Boolean)
            .join(' · ')}
        </li>
      </ul>
    </div>
  );
}
