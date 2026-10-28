'use client';
import * as React from 'react';
import { useId, useRef, useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import {
  deleteHoliday,
  getLocationCalendar,
  type HolidayImportResult,
  type LocationHoliday,
} from '@/lib/locations/location-calendar-api';
import { groupHolidays, recurringLabel } from '@/lib/locations/location-calendar';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import { sedeNumber } from '@/lib/format/sede-number';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { civilWeekday } from '@/lib/time/civil-day';
import { notifyError } from '@/components/errors/notify';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { RowActions } from '@/components/shared/row-actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HolidayFormModal } from './holiday-form-modal';
import { HolidayImportModal, importedSummaryText } from './holiday-import-modal';

export const holidaysCopy = {
  heading: 'Festivos',
  add: 'Añadir festivo',
  import: 'Importar',
  emptyTitle: 'Añade los festivos de tu sede',
  emptyDescription:
    'Dentalix no trae los festivos de ningún país. Añádelos uno a uno o importa un calendario .ics o una hoja .csv.',
  recurringGroup: 'Cada año',
  colDate: 'Fecha',
  colName: 'Nombre',
  colActions: 'Acciones',
  /** Con la fecha cuando la hay: dos festivos pueden llamarse igual en años distintos. */
  actionsFor: (name: string, date: string | null) => (date ? `Acciones de ${name}, ${date}` : `Acciones de ${name}`),
  edit: 'Editar',
  delete: 'Eliminar',
  deleteTitle: 'Eliminar festivo',
  deleteBody: (name: string) => `¿Eliminar «${name}»? Los plazos ya calculados no cambian.`,
  deleteConfirm: 'Eliminar',
  deleteError: 'No pudimos eliminar el festivo.',
  /** 404 al eliminar: otra persona ya lo retiró; se quita de la lista y no hay nada que reintentar. */
  alreadyDeleted: 'Ese festivo ya se había eliminado.',
  /** Sin formato de la sede no se pinta ninguna fecha (R11); la nota la pone la vista. */
  noDate: '—',
  /** La importación ya se hizo; lo que falló es traer la lista nueva. */
  reloadError: 'Importamos los festivos, pero no pudimos recargar la lista.',
};

const copy = holidaysCopy;

/** Cambia la lista de la vista a partir de la última que tiene (un reintento tardío no pisa otros cambios). */
export type HolidaysUpdate = (update: (prev: LocationHoliday[]) => LocationHoliday[]) => void;

interface HolidaysSectionProps {
  token: string;
  /** La sede ELEGIDA: de ella salen las fechas y los días (I6). */
  location: ClinicLocation;
  holidays: readonly LocationHoliday[];
  onChanged: HolidaysUpdate;
}

type FormState = { holiday?: LocationHoliday; key: number } | null;
/** A dónde vuelve el foco cuando se cierra un modal: «Añadir festivo», «Importar» o las acciones de una fila. */
type FocusTarget = { kind: 'add' } | { kind: 'import' } | { kind: 'row'; id: string };

function dateText(holiday: LocationHoliday, fmt: RegionalFormat | null): string {
  if (!fmt) return copy.noDate;
  if (holiday.recurring) return recurringLabel(holiday.date, fmt);
  return `${fmt.civilDate(holiday.date)} · ${fmt.weekdayName(civilWeekday(holiday.date))}`;
}

/**
 * DX-316 (spec §7.2): los festivos de la sede. Primero «Cada año» (los
 * recurrentes, por mes y día) y después un bloque por año con los puntuales.
 * Las palabras de fecha salen siempre del formato de la sede elegida; sin él,
 * «—» (la nota de «Configurar sede» la pinta la vista una sola vez). Alta y
 * edición en `HolidayFormModal`; eliminar pide confirmación, y si falla avisa
 * con reintento sin quitar la fila (escalón 3).
 */
export function HolidaysSection({ token, location, holidays, onChanged }: HolidaysSectionProps) {
  const fmt = locationRegionalFormat(location);
  const [form, setForm] = useState<FormState>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<LocationHoliday | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importKey, setImportKey] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const importRef = useRef<HTMLButtonElement>(null);
  /** El resumen espera a que el diálogo se cierre (ver `importClosed`). */
  const pendingSummary = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<FocusTarget>({ kind: 'add' });
  const headingId = useId();

  // Radix devuelve el foco a lo que lo tenía al abrir: el ítem del menú de la
  // fila, que ya no existe, o una fila que se acaba de retirar. Se coloca a mano.
  function restoreFocus(event: Event) {
    event.preventDefault();
    const target = focusTarget.current;
    const rowTrigger =
      target.kind === 'row'
        ? listRef.current?.querySelector<HTMLButtonElement>(`[data-holiday-id="${CSS.escape(target.id)}"] button`)
        : null;
    const fallback = target.kind === 'import' ? (importRef.current ?? addRef.current) : addRef.current;
    (rowTrigger ?? fallback)?.focus();
  }

  function openImport() {
    focusTarget.current = { kind: 'import' };
    // Vacía la línea: si la próxima importación da el mismo texto, se anuncia igual.
    setImportSummary(null);
    setImportKey((prev) => (prev ?? 0) + 1);
    setImportOpen(true);
  }

  /** La respuesta de la importación no trae ids: se recarga el calendario (spec §7.2). */
  async function reload() {
    try {
      const fresh = await getLocationCalendar(token, location.id);
      onChanged(() => fresh.holidays);
    } catch {
      // Siempre este texto, también sin red o con un 4xx: lo que importa es que la importación sí se hizo.
      notifyError(copy.reloadError, { onRetry: () => void reload() });
    }
  }

  async function imported(result: HolidayImportResult) {
    pendingSummary.current = importedSummaryText(result.counts, (n) => sedeNumber(n, fmt));
    await reload();
  }

  // Con el diálogo abierto Radix pone aria-hidden al resto de la página, y una
  // región viva que cambia ahí no se anuncia. `onCloseAutoFocus` llega cuando
  // el diálogo ya se desmontó y quitó ese aria-hidden: es el momento de escribir.
  function importClosed(event: Event) {
    restoreFocus(event);
    if (pendingSummary.current !== null) {
      setImportSummary(pendingSummary.current);
      pendingSummary.current = null;
    }
  }

  function openCreate() {
    focusTarget.current = { kind: 'add' };
    setForm((prev) => ({ key: (prev?.key ?? 0) + 1 }));
    setFormOpen(true);
  }

  function openEdit(holiday: LocationHoliday) {
    focusTarget.current = { kind: 'row', id: holiday.id };
    setForm((prev) => ({ holiday, key: (prev?.key ?? 0) + 1 }));
    setFormOpen(true);
  }

  function saved(holiday: LocationHoliday) {
    setImportSummary(null);
    onChanged((prev) =>
      prev.some((h) => h.id === holiday.id) ? prev.map((h) => (h.id === holiday.id ? holiday : h)) : [...prev, holiday],
    );
  }

  async function remove(holiday: LocationHoliday) {
    setBusyId(holiday.id);
    try {
      await deleteHoliday(token, location.id, holiday.id);
      setImportSummary(null);
      focusTarget.current = { kind: 'add' };
      setDeleting(null);
      onChanged((prev) => prev.filter((h) => h.id !== holiday.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Ya no está: reintentar daría el mismo 404 para siempre.
        focusTarget.current = { kind: 'add' };
        setDeleting(null);
        onChanged((prev) => prev.filter((h) => h.id !== holiday.id));
        notifyError(copy.alreadyDeleted);
        return;
      }
      // Se cierra también al fallar: con el diálogo abierto Radix deja inerte
      // el resto, y el «Reintentar» del aviso no se podría pulsar.
      focusTarget.current = { kind: 'row', id: holiday.id };
      setDeleting(null);
      notifyError(apiErrorMessage(err, copy.deleteError), { onRetry: () => void remove(holiday) });
    } finally {
      setBusyId(null);
    }
  }

  const groups = groupHolidays(holidays);
  const blocks = [
    ...(groups.recurring.length > 0 ? [{ title: copy.recurringGroup, items: groups.recurring }] : []),
    ...groups.years.map((y) => ({ title: String(y.year), items: y.items })),
  ];

  const addButton = (
    <Button ref={addRef} type="button" onClick={openCreate} className="max-sm:min-h-11 max-sm:w-full">
      <Plus aria-hidden />
      {copy.add}
    </Button>
  );
  // Solo uno montado a la vez (barra o vacío), así que comparten la ref.
  const importButton = (
    <Button ref={importRef} type="button" variant="secondary" onClick={openImport} className="max-sm:min-h-11 max-sm:w-full">
      <Upload aria-hidden />
      {copy.import}
    </Button>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-lg font-semibold text-ink">
            {copy.heading}
          </h2>
          {/* Siempre montada para que se anuncie; no hay toast de éxito en el proyecto. */}
          <p role="status" className="text-sm text-muted tabular-nums empty:hidden">
            {importSummary}
          </p>
        </div>
        {blocks.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {addButton}
            {importButton}
          </div>
        ) : null}
      </div>

      {blocks.length === 0 ? (
        <EmptyState
          icon={<CalendarDays aria-hidden />}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          // < sm: los dos botones a todo el ancho, como la barra de la lista.
          actionClassName="w-full sm:w-auto"
          action={
            <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
              {addButton}
              {importButton}
            </div>
          }
        />
      ) : (
        <div ref={listRef} className="flex flex-col gap-6">
          {blocks.map((block) => (
            <div key={block.title} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">{block.title}</h3>
              <Card className="overflow-hidden p-0">
                <Table aria-label={block.title}>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sm:w-56">{copy.colDate}</TableHead>
                      <TableHead>{copy.colName}</TableHead>
                      <TableHead className="w-px text-right">
                        <span className="sr-only">{copy.colActions}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {block.items.map((holiday) => (
                      <TableRow key={holiday.id} className="sm:h-11">
                        <TableCell className="whitespace-nowrap text-ink tabular-nums" data-label={copy.colDate}>
                          {dateText(holiday, fmt)}
                        </TableCell>
                        <TableCell className="font-medium text-ink max-sm:text-right" data-label={copy.colName}>
                          <span className="break-words">{holiday.name}</span>
                        </TableCell>
                        <TableCell className="py-1 text-right" data-label={copy.colActions}>
                          <span data-holiday-id={holiday.id} className="inline-flex">
                            <RowActions
                              label={copy.actionsFor(holiday.name, fmt ? dateText(holiday, fmt) : null)}
                              busy={busyId === holiday.id}
                              className="max-sm:size-11"
                              actions={[
                                { label: copy.edit, icon: <Pencil />, onSelect: () => openEdit(holiday) },
                                {
                                  label: copy.delete,
                                  icon: <Trash2 />,
                                  destructive: true,
                                  separatorBefore: true,
                                  onSelect: () => {
                                    focusTarget.current = { kind: 'row', id: holiday.id };
                                    setDeleting(holiday);
                                  },
                                },
                              ]}
                            />
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          ))}
        </div>
      )}

      {form ? (
        <HolidayFormModal
          key={form.key}
          open={formOpen}
          onOpenChange={setFormOpen}
          token={token}
          locationId={location.id}
          holiday={form.holiday}
          onSaved={saved}
          onCloseAutoFocus={restoreFocus}
        />
      ) : null}

      {importKey !== null ? (
        <HolidayImportModal
          key={importKey}
          open={importOpen}
          onOpenChange={setImportOpen}
          token={token}
          location={location}
          onImported={imported}
          onCloseAutoFocus={importClosed}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          // Con la eliminación en vuelo, Escape y el fondo no cierran: el
          // diálogo se cierra al terminar y deja el foco en un sitio que existe.
          if (!open && !(deleting && busyId === deleting.id)) setDeleting(null);
        }}
        title={copy.deleteTitle}
        description={deleting ? copy.deleteBody(deleting.name) : undefined}
        confirmLabel={copy.deleteConfirm}
        confirming={deleting !== null && busyId === deleting.id}
        onConfirm={() => deleting && void remove(deleting)}
        onCloseAutoFocus={restoreFocus}
      />
    </section>
  );
}
