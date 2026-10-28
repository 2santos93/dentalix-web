import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HolidayImportModal, holidayImportCopy } from './holiday-import-modal';
import {
  importHolidays,
  previewHolidayImport,
  type HolidayImportResult,
  type HolidayImportRow,
} from '@/lib/locations/location-calendar-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { clinicLocation } from '@/lib/test/locations';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/locations/location-calendar-api', () => ({
  ...jest.requireActual('../../lib/locations/location-calendar-api'),
  previewHolidayImport: jest.fn(),
  importHolidays: jest.fn(),
}));
const mockedPreview = jest.mocked(previewHolidayImport);
const mockedImport = jest.mocked(importHolidays);

const copy = holidayImportCopy;
const usa = clinicLocation({ id: 'sur', locale: 'en-US', hourCycle: 'h12' });
const alemania = clinicLocation({ id: 'norte', locale: 'de-DE', hourCycle: 'h23' });

function row(line: number, status: HolidayImportRow['status'], message: string | null = null, relatedLines: number[] = []): HolidayImportRow {
  return { line, date: '2027-05-03', name: 'Festivo', recurring: false, status, message, relatedLines };
}

function result(counts: { new: number; duplicate: number; error: number }, rows: HolidayImportRow[] = [], dryRun = true): HolidayImportResult {
  return { format: 'CSV', dryRun, counts, rows };
}

const twelveNew = result({ new: 12, duplicate: 0, error: 0 }, Array.from({ length: 12 }, (_, i) => row(i + 2, 'NEW')));

function csv(name = 'festivos.csv') {
  return new File(['fecha,nombre\n2027-05-03,Obras\n'], name, { type: 'text/csv' });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness({
  location,
  onImported,
  onOpenChange,
}: {
  location: ClinicLocation;
  onImported: (r: HolidayImportResult) => Promise<void> | void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {/* Reabre la MISMA instancia: lo que llegó con el modal cerrado no debe aparecer. */}
      <button type="button" onClick={() => setOpen(true)}>
        Reabrir
      </button>
      <HolidayImportModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
      token="tok"
      location={location}
      onImported={onImported}
      />
    </>
  );
}

function renderModal(location: ClinicLocation = usa) {
  const onImported = jest.fn<Promise<void>, [HolidayImportResult]>(async () => {});
  const onOpenChange = jest.fn();
  render(<Harness location={location} onImported={onImported} onOpenChange={onOpenChange} />);
  return { onImported, onOpenChange };
}

const fileInput = () => screen.getByLabelText(copy.fileLabel) as HTMLInputElement;
const importButton = () => screen.getByRole('button', { name: /^Importar/ });

beforeEach(() => jest.clearAllMocks());

describe('HolidayImportModal (DX-316, spec §7.2)', () => {
  it('shows the CSV/ICS help text of spec §7.2', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Importar festivos' });
    expect(
      within(dialog).getByText('CSV con las columnas fecha (AAAA-MM-DD), nombre y, si quieres, recurrente (sí/no).'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('ICS: eventos de día completo; los que se repiten cada año el mismo día se guardan como recurrentes.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Si importas el mismo archivo otra vez, no se duplica nada.')).toBeInTheDocument();
  });

  it('the file input accepts .csv,.ics', () => {
    renderModal();
    expect(fileInput()).toHaveAttribute('accept', '.csv,.ics');
    expect(fileInput()).toHaveAttribute('type', 'file');
  });

  it('before choosing a file the import button is disabled and focus starts on «Elegir archivo»', () => {
    renderModal();
    expect(importButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.choose })).toHaveFocus();
  });

  it('choosing a file calls preview and shows «12 nuevos · 0 ya existían · 0 con errores»', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    renderModal();
    const file = csv();
    await user.upload(fileInput(), file);
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'sur', file);
    expect(await screen.findByTestId('holiday-import-summary')).toHaveTextContent('12 nuevos · 0 ya existían · 0 con errores');
    expect(importButton()).toHaveTextContent('Importar 12 festivos');
    expect(importButton()).toBeEnabled();
    expect(screen.getByText('festivos.csv')).toBeInTheDocument();
  });

  it('counts and line numbers go through the location fmt.number (de-DE)', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(
      result({ new: 1200, duplicate: 0, error: 1 }, [row(1234, 'ERROR', 'La fecha se repite en el archivo.', [1500, 2700])]),
    );
    renderModal(alemania);
    await user.upload(fileInput(), csv());
    expect(await screen.findByTestId('holiday-import-summary')).toHaveTextContent('1.200 nuevos · 0 ya existían · 1 con error');
    expect(importButton()).toHaveTextContent('Importar 1.200 festivos');
    expect(screen.getByText('Línea 1.234')).toBeInTheDocument();
    expect(screen.getByText(/\(líneas 1\.500 y 2\.700\)/)).toBeInTheDocument();
  });

  it('singular counts read «1 nuevo · 1 ya existía · 1 con error» and «Importar 1 festivo»', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(
      result({ new: 1, duplicate: 1, error: 1 }, [
        row(2, 'NEW'),
        row(3, 'DUPLICATE', 'Ya existe: «Obras».'),
        row(4, 'ERROR', 'La fecha tiene que estar entre 2000 y 2100.'),
      ]),
    );
    renderModal();
    await user.upload(fileInput(), csv());
    expect(await screen.findByTestId('holiday-import-summary')).toHaveTextContent('1 nuevo · 1 ya existía · 1 con error');
    expect(importButton()).toHaveTextContent('Importar 1 festivo');
  });

  it('lists DUPLICATE and ERROR rows with line, message and «(líneas 3 y 7)» from relatedLines, capped at 200 with «y {r} más»', async () => {
    const user = setupUser();
    const issues = [
      row(5, 'ERROR', 'La fecha se repite en el archivo.', [3, 7]),
      row(6, 'ERROR', 'Choca con otra fila del archivo: un festivo de cada año y uno puntual no pueden caer el mismo día y mes.', [9]),
      row(8, 'DUPLICATE', 'Ya existe: «Obras».'),
      ...Array.from({ length: 202 }, (_, i) => row(100 + i, 'ERROR', 'El nombre es obligatorio (hasta 120 caracteres).')),
    ];
    mockedPreview.mockResolvedValue(result({ new: 1, duplicate: 1, error: 204 }, [row(2, 'NEW'), ...issues]));
    renderModal();
    await user.upload(fileInput(), csv());
    const region = await screen.findByRole('region', { name: copy.issuesHeading });
    // Un solo nombre: la región. La lista no lo repite.
    const list = within(region).getByRole('list');
    expect(list).not.toHaveAttribute('aria-labelledby');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(200);
    expect(items[0]).toHaveTextContent('Línea 5');
    expect(items[0]).toHaveTextContent('La fecha se repite en el archivo. (líneas 3 y 7)');
    expect(items[1]).toHaveTextContent('(línea 9)');
    expect(items[2]).toHaveTextContent('Línea 8');
    expect(items[2]).toHaveTextContent('Ya existe: «Obras».');
    expect(items[2]).not.toHaveTextContent('(línea');
    // NEW no se lista.
    expect(within(list).queryByText('Línea 2')).not.toBeInTheDocument();
    expect(screen.getByText('y 5 más')).toBeInTheDocument();
  });

  it('import button reads «Importar 12 festivos» and is disabled with 0 new', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValueOnce(twelveNew);
    renderModal();
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    expect(importButton()).toHaveTextContent('Importar 12 festivos');

    mockedPreview.mockResolvedValueOnce(result({ new: 0, duplicate: 12, error: 0 }, [row(2, 'DUPLICATE', 'Ya existe: «Obras».')]));
    await user.upload(fileInput(), csv('otra.csv'));
    await waitFor(() => expect(screen.getByTestId('holiday-import-summary')).toHaveTextContent('0 nuevos · 12 ya existían'));
    expect(importButton()).toHaveTextContent('Importar 0 festivos');
    expect(importButton()).toBeDisabled();
    expect(screen.getByText(copy.nothingNew)).toBeInTheDocument();
  });

  it('confirming imports the same file as the preview, then calls onImported and closes', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    const imported = result({ new: 12, duplicate: 0, error: 0 }, twelveNew.rows, false);
    mockedImport.mockResolvedValue(imported);
    const { onImported, onOpenChange } = renderModal();
    const file = csv();
    await user.upload(fileInput(), file);
    await screen.findByTestId('holiday-import-summary');
    await user.click(importButton());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockedImport).toHaveBeenCalledWith('tok', 'sur', file);
    expect(mockedImport.mock.calls[0][2]).toBe(mockedPreview.mock.calls[0][2]);
    expect(onImported).toHaveBeenCalledWith(imported);
    // Cierra después de que quien llama haya recargado.
    expect(onImported.mock.invocationCallOrder[0]).toBeLessThan(onOpenChange.mock.invocationCallOrder[0]);
  });

  it('a second submit while importing does not import twice', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    const pending = deferred<HolidayImportResult>();
    mockedImport.mockReturnValue(pending.promise);
    renderModal();
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    const form = importButton().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mockedImport).toHaveBeenCalledTimes(1);
    pending.resolve(result({ new: 12, duplicate: 0, error: 0 }, [], false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('while importing, Escape does not close the modal and choosing another file is disabled', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    const pending = deferred<HolidayImportResult>();
    mockedImport.mockReturnValue(pending.promise);
    const { onOpenChange } = renderModal();
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    await user.click(importButton());
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: copy.chooseOther })).toBeDisabled();
    pending.resolve(result({ new: 12, duplicate: 0, error: 0 }, [], false));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('if the import result differs from the preview, the modal stays open with the real result', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    const real = result({ new: 10, duplicate: 1, error: 1 }, [
      row(3, 'DUPLICATE', 'Ya existe: «Obras».'),
      row(4, 'ERROR', 'Ese día ya es festivo cada año: «Fiesta».'),
    ], false);
    mockedImport.mockResolvedValue(real);
    const { onImported, onOpenChange } = renderModal();
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    await user.click(importButton());
    const note = await screen.findByText(copy.changed);
    // Se lee una vez: tiene el foco y no está en una región viva.
    expect(note.parentElement).toHaveFocus();
    expect(note.closest('[role="status"], [role="alert"]')).toBeNull();
    expect(screen.queryByText(copy.followUpError)).not.toBeInTheDocument();
    expect(onImported).toHaveBeenCalledWith(real);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('holiday-import-summary')).toHaveTextContent('10 nuevos · 1 ya existía · 1 con error');
    expect(screen.getByText('Ese día ya es festivo cada año: «Fiesta».')).toBeInTheDocument();
    // Ya está importado: no se ofrece importar de nuevo, solo cerrar.
    expect(screen.queryByRole('button', { name: /^Importar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.chooseOther })).not.toBeInTheDocument();
    // El del pie (la X del diálogo también se llama «Cerrar»).
    const footerClose = screen.getAllByRole('button', { name: copy.close }).find((b) => !b.querySelector('.sr-only'));
    await user.click(footerClose as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('choosing a second file replaces the preview and a stale preview response never overwrites the newer one', async () => {
    const user = setupUser();
    const first = deferred<HolidayImportResult>();
    const second = deferred<HolidayImportResult>();
    mockedPreview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mockedImport.mockResolvedValue(result({ new: 2, duplicate: 0, error: 0 }, [], false));
    renderModal();
    const a = csv('a.csv');
    const b = csv('b.csv');
    await user.upload(fileInput(), a);
    await user.upload(fileInput(), b);
    second.resolve(result({ new: 2, duplicate: 0, error: 0 }));
    expect(await screen.findByTestId('holiday-import-summary')).toHaveTextContent('2 nuevos');
    await act(async () => first.resolve(result({ new: 7, duplicate: 0, error: 0 })));
    expect(screen.getByTestId('holiday-import-summary')).toHaveTextContent('2 nuevos');
    expect(screen.getByText('b.csv')).toBeInTheDocument();
    await user.click(importButton());
    await waitFor(() => expect(mockedImport).toHaveBeenCalledWith('tok', 'sur', b));
  });

  it('choosing another file drops the old preview at once, so confirm cannot import the new file with the old counts', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValueOnce(twelveNew).mockReturnValueOnce(new Promise(() => {}));
    renderModal();
    await user.upload(fileInput(), csv('a.csv'));
    await screen.findByTestId('holiday-import-summary');
    await user.upload(fileInput(), csv('b.csv'));
    expect(screen.queryByTestId('holiday-import-summary')).not.toBeInTheDocument();
    expect(importButton()).toBeDisabled();
    expect(screen.getByText(copy.reading)).toBeInTheDocument();
  });

  it('closing the modal mid-preview ignores the late response and makes no import', async () => {
    const user = setupUser();
    const pending = deferred<HolidayImportResult>();
    mockedPreview.mockReturnValue(pending.promise);
    const { onOpenChange, onImported } = renderModal();
    await user.upload(fileInput(), csv());
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await act(async () => pending.resolve(twelveNew));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reabrir' }));
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('holiday-import-summary')).not.toBeInTheDocument();
    expect(mockedImport).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it.each([
    ['413', new ApiError(413, 'El archivo supera 256 KB.'), 'El archivo supera 256 KB.'],
    ['400', new ApiError(400, 'Sube un archivo .csv o .ics.'), 'Sube un archivo .csv o .ics.'],
  ])('a %s file error is an InlineError inside the modal', async (_label, error, text) => {
    const user = setupUser();
    mockedPreview.mockRejectedValue(error);
    renderModal();
    await user.upload(fileInput(), csv());
    const alert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(importButton()).toBeDisabled();
    // Se puede elegir otro archivo.
    expect(screen.getByRole('button', { name: copy.chooseOther })).toBeEnabled();
  });

  it('a 409 LOCATION_HOLIDAY_LIMIT at the preview step is shown in the modal and nothing can be imported', async () => {
    const user = setupUser();
    mockedPreview.mockRejectedValue(
      new ApiError(409, 'La sede tendría más de 1.000 festivos. Borra los de años pasados e inténtalo de nuevo.', {
        code: 'LOCATION_HOLIDAY_LIMIT',
      }),
    );
    renderModal();
    await user.upload(fileInput(), csv());
    const alert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent('La sede tendría más de 1.000 festivos. Borra los de años pasados e inténtalo de nuevo.');
    expect(screen.queryByTestId('holiday-import-summary')).not.toBeInTheDocument();
    expect(importButton()).toBeDisabled();
  });

  it('an import error keeps the modal open with the preview and the message at the top', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    mockedImport.mockRejectedValue(
      new ApiError(409, 'La sede tendría más de 1.000 festivos. Borra los de años pasados e inténtalo de nuevo.', {
        code: 'LOCATION_HOLIDAY_LIMIT',
      }),
    );
    const { onImported, onOpenChange } = renderModal();
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    await user.click(importButton());
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('La sede tendría más de 1.000 festivos');
    expect(onImported).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('holiday-import-summary')).toBeInTheDocument();
  });

  it('while a file is being read the «Elige un archivo…» hint is gone', async () => {
    const user = setupUser();
    mockedPreview.mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByText(copy.pickFirst)).toBeInTheDocument();
    await user.upload(fileInput(), csv());
    expect(screen.getByText(copy.reading)).toBeInTheDocument();
    expect(screen.queryByText(copy.pickFirst)).not.toBeInTheDocument();
  });

  it('while importing, the X is aria-disabled and does not close', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    const pending = deferred<HolidayImportResult>();
    mockedImport.mockReturnValue(pending.promise);
    const { onOpenChange } = renderModal();
    const xClose = () => screen.getAllByRole('button', { name: copy.close }).find((b) => b.querySelector('.sr-only')) as HTMLElement;
    expect(xClose()).not.toHaveAttribute('aria-disabled');
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    await user.click(importButton());
    expect(xClose()).toHaveAttribute('aria-disabled', 'true');
    await user.click(xClose());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    pending.resolve(result({ new: 12, duplicate: 0, error: 0 }, [], false));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('a location without a regional format shows «—» for every count and line', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(
      result({ new: 3, duplicate: 1, error: 1 }, [row(4, 'ERROR', 'La fecha se repite en el archivo.', [7]), row(5, 'DUPLICATE', 'Ya existe: «Obras».')]),
    );
    renderModal(clinicLocation({ id: 'sin', locale: null, hourCycle: null }));
    await user.upload(fileInput(), csv());
    expect(await screen.findByTestId('holiday-import-summary')).toHaveTextContent('— nuevos · — ya existía · — con error');
    expect(importButton()).toHaveTextContent('Importar — festivos');
    expect(screen.getAllByText('Línea —')).toHaveLength(2);
    expect(screen.getByText(/\(línea —\)/)).toBeInTheDocument();
  });

  it('a 400 with an array message shows the Spanish messages in the modal', async () => {
    const user = setupUser();
    mockedPreview.mockRejectedValue(
      new ApiError(400, 'Bad Request', {
        messages: ['El archivo está vacío.', 'La primera fila tiene que tener las columnas «fecha» y «nombre» (y, si quieres, «recurrente»).'],
      }),
    );
    renderModal();
    await user.upload(fileInput(), csv());
    const alert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent('El archivo está vacío.');
    expect(alert).toHaveTextContent('La primera fila tiene que tener las columnas «fecha» y «nombre»');
  });

  it.each([
    ['a 500', new ApiError(500, 'Internal Server Error'), 'No pudimos revisar el archivo. Intenta de nuevo.'],
    ['a network failure', new NetworkError(new TypeError('Failed to fetch')), 'No hay conexión con el servidor. Revisa tu conexión a internet.'],
  ])('%s at preview does not blame the file', async (_label, error, text) => {
    const user = setupUser();
    mockedPreview.mockRejectedValue(error);
    renderModal();
    await user.upload(fileInput(), csv());
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(text);
    expect(importButton()).toBeDisabled();
  });

  it.each([
    ['a 500', new ApiError(500, 'Internal Server Error'), 'No pudimos importar los festivos. Intenta de nuevo.'],
    ['a network failure', new NetworkError(new TypeError('Failed to fetch')), 'No hay conexión con el servidor. Revisa tu conexión a internet.'],
  ])('%s at import keeps the preview and lets the user try again', async (_label, error, text) => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    mockedImport.mockRejectedValueOnce(error);
    const { onImported } = renderModal();
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    await user.click(importButton());
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(text);
    expect(onImported).not.toHaveBeenCalled();
    expect(importButton()).toBeEnabled();
  });

  it('if onImported throws after a successful write, the import still counts as done and the follow-up error is separate', async () => {
    const user = setupUser();
    mockedPreview.mockResolvedValue(twelveNew);
    mockedImport.mockResolvedValue(result({ new: 12, duplicate: 0, error: 0 }, [], false));
    const onImported = jest.fn(async () => {
      throw new Error('reload exploded');
    });
    const onOpenChange = jest.fn();
    render(<Harness location={usa} onImported={onImported} onOpenChange={onOpenChange} />);
    await user.upload(fileInput(), csv());
    await screen.findByTestId('holiday-import-summary');
    await user.click(importButton());
    const followUp = await screen.findByText(copy.followUpError);
    expect(followUp.closest('[tabindex="-1"]')).toHaveFocus();
    // No es «no se importó»: ni banner de error de importación ni botón para repetirla.
    expect(screen.queryByText(copy.importError)).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Importar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(copy.changed)).not.toBeInTheDocument();
    expect(mockedImport).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
