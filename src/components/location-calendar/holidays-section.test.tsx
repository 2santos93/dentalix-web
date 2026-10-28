import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HolidaysSection, holidaysCopy } from './holidays-section';
import { holidayFormCopy } from './holiday-form-modal';
import {
  createHoliday,
  deleteHoliday,
  getLocationCalendar,
  importHolidays,
  previewHolidayImport,
  type HolidayImportResult,
  type LocationHoliday,
} from '@/lib/locations/location-calendar-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { notifyError } from '@/components/errors/notify';
import { clinicLocation } from '@/lib/test/locations';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/locations/location-calendar-api', () => ({
  ...jest.requireActual('../../lib/locations/location-calendar-api'),
  createHoliday: jest.fn(),
  updateHoliday: jest.fn(),
  deleteHoliday: jest.fn(),
  getLocationCalendar: jest.fn(),
  previewHolidayImport: jest.fn(),
  importHolidays: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
const mockedCreate = jest.mocked(createHoliday);
const mockedDelete = jest.mocked(deleteHoliday);
const mockedNotify = jest.mocked(notifyError);
const mockedGet = jest.mocked(getLocationCalendar);
const mockedPreview = jest.mocked(previewHolidayImport);
const mockedImport = jest.mocked(importHolidays);

const copy = holidaysCopy;
const usa = clinicLocation({ id: 'sur', locale: 'en-US', hourCycle: 'h12' });
const alemania = clinicLocation({ id: 'norte', locale: 'de-DE', hourCycle: 'h23' });

const mayo: LocationHoliday = { id: 'h-mayo', date: '2020-05-03', name: 'Día de la sede', recurring: true };
const puntual2027: LocationHoliday = { id: 'h-27', date: '2027-05-03', name: 'Cierre por obras', recurring: false };
const puntual2028: LocationHoliday = { id: 'h-28', date: '2028-01-10', name: 'Inventario', recurring: false };

/** La sección con el estado que le daría la vista: `onChanged` sustituye la lista. */
function Harness({ location, initial }: { location: ClinicLocation; initial: LocationHoliday[] }) {
  const [holidays, setHolidays] = useState(initial);
  return <HolidaysSection token="tok" location={location} holidays={holidays} onChanged={setHolidays} />;
}

function renderSection(initial: LocationHoliday[], location: ClinicLocation = usa) {
  render(<Harness location={location} initial={initial} />);
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

/** Fechas de los festivos de prueba en la sede en-US. */
const DATE_TEXT: Record<string, string> = {
  'Cierre por obras': '05/03/2027 · lunes',
  Obras: '05/03/2027 · lunes',
  'Día de la sede': '3 de mayo',
};
const actionsName = (name: string) => copy.actionsFor(name, DATE_TEXT[name]);

async function openRowAction(user: ReturnType<typeof setupUser>, name: string, action: string) {
  await user.click(screen.getByRole('button', { name: actionsName(name) }));
  await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: action }));
}

beforeEach(() => jest.clearAllMocks());

describe('HolidaysSection (DX-316, spec §7.2)', () => {
  it('empty calendar shows «Añade los festivos de tu sede» with both actions', async () => {
    const user = setupUser();
    renderSection([]);
    expect(screen.getByRole('heading', { level: 2, name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText('Añade los festivos de tu sede')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Dentalix no trae los festivos de ningún país. Añádelos uno a uno o importa un calendario .ics o una hoja .csv.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Añadir festivo' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Importar' }));
    expect(await screen.findByRole('dialog', { name: 'Importar festivos' })).toBeInTheDocument();
  });

  it.each([
    ['en-US/h12', usa, '05/03/2027 · lunes'],
    ['de-DE/h23', alemania, '03.05.2027 · lunes'],
  ])('lists «Cada año» first with «3 de mayo», then one-off grouped by year (%s)', (_label, location, expected) => {
    renderSection([puntual2028, puntual2027, mayo], location);
    const groups = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(['Cada año', '2027', '2028']);
    expect(within(rowOf('Día de la sede')).getByText('3 de mayo')).toBeInTheDocument();
    expect(within(rowOf('Cierre por obras')).getByText(expected)).toBeInTheDocument();
    // Cada grupo es su propia tabla, con su nombre.
    expect(screen.getByRole('table', { name: 'Cada año' })).toContainElement(rowOf('Día de la sede'));
    expect(screen.getByRole('table', { name: '2028' })).toContainElement(rowOf('Inventario'));
  });

  // Este test no protege nada: Jest da al test una copia de `process.env` y
  // el cambio de `TZ` no llega a ICU, así que pasa con o sin el
  // `timeZone: 'UTC'` del helper. La guarda real es «civil words do not depend
  // on the process zone» (Pacific/Kiritimati) en `regional-format.test.ts`,
  // que también cubre `civilDate`. Se deja porque lo pide el brief (I6).
  it('the same dates in a non-UTC process zone (I6)', () => {
    const before = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      renderSection([puntual2027, mayo], usa);
      expect(within(rowOf('Cierre por obras')).getByText('05/03/2027 · lunes')).toBeInTheDocument();
      expect(within(rowOf('Día de la sede')).getByText('3 de mayo')).toBeInTheDocument();
    } finally {
      process.env.TZ = before;
    }
  });

  it('location without locale shows «—» for the dates and no note of its own', () => {
    renderSection([puntual2027, mayo], clinicLocation({ locale: null }));
    expect(within(rowOf('Cierre por obras')).getByText('—')).toBeInTheDocument();
    expect(within(rowOf('Día de la sede')).getByText('—')).toBeInTheDocument();
    // La nota «Configurar sede» la pinta la vista, una sola vez.
    expect(screen.queryByRole('link', { name: 'Configurar sede' })).not.toBeInTheDocument();
  });

  it('location without locale disables «Importar» (list and empty state) and keeps add, edit and delete (M3)', async () => {
    const sin = clinicLocation({ locale: null });
    const { unmount } = render(
      <>
        <p id="nota">Nota de la vista</p>
        <HolidaysSection token="tok" location={sin} holidays={[]} onChanged={jest.fn()} noFormatNoteId="nota" />
      </>,
    );
    expect(screen.getByRole('button', { name: copy.import })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.import })).toHaveAccessibleDescription('Nota de la vista');
    expect(screen.getByRole('button', { name: copy.add })).toBeEnabled();
    unmount();

    mockedDelete.mockResolvedValue(undefined);
    const user = setupUser();
    renderSection([puntual2027], sin);
    expect(screen.getByRole('button', { name: copy.import })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.add })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Acciones de Cierre por obras' }));
    const menu = within(await screen.findByRole('menu'));
    expect(menu.getByRole('menuitem', { name: copy.edit })).toBeInTheDocument();
    await user.click(menu.getByRole('menuitem', { name: copy.delete }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: copy.deleteConfirm }));
    await waitFor(() => expect(screen.queryByText('Cierre por obras')).not.toBeInTheDocument());
    expect(mockedDelete).toHaveBeenCalledWith('tok', sin.id, puntual2027.id);
  });

  it('add posts exactly { date, name, recurring } and the row appears', async () => {
    mockedCreate.mockResolvedValue({ id: 'h-new', date: '2027-12-24', name: 'Nochebuena', recurring: false });
    const user = setupUser();
    renderSection([mayo]);
    await user.click(screen.getByRole('button', { name: copy.add }));
    await user.type(screen.getByLabelText(holidayFormCopy.date), '2027-12-24');
    await user.type(screen.getByLabelText(holidayFormCopy.name), 'Nochebuena');
    await user.click(screen.getByRole('button', { name: holidayFormCopy.create }));

    expect(await screen.findByText('Nochebuena')).toBeInTheDocument();
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'sur', { date: '2027-12-24', name: 'Nochebuena', recurring: false });
    expect(within(rowOf('Nochebuena')).getByText('12/24/2027 · viernes')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // El foco vuelve a quien abrió el modal, no a <body>.
    await waitFor(() => expect(screen.getByRole('button', { name: copy.add })).toHaveFocus());
  });

  it('409 shows the API message in the modal', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(409, 'Ese día ya es festivo cada año: «Día de la sede».', {
        code: 'HOLIDAY_ALREADY_EXISTS',
        holidayId: 'h-mayo',
      }),
    );
    const user = setupUser();
    renderSection([mayo]);
    await user.click(screen.getByRole('button', { name: copy.add }));
    await user.type(screen.getByLabelText(holidayFormCopy.date), '2027-05-03');
    await user.type(screen.getByLabelText(holidayFormCopy.name), 'Otro');
    await user.click(screen.getByRole('button', { name: holidayFormCopy.create }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Ese día ya es festivo cada año: «Día de la sede».')).toBeInTheDocument();
  });

  it('delete asks «¿Eliminar «{nombre}»? Los plazos ya calculados no cambian.» and removes the row', async () => {
    mockedDelete.mockResolvedValue(undefined);
    const user = setupUser();
    renderSection([mayo, puntual2027]);
    await openRowAction(user, 'Cierre por obras', copy.delete);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('¿Eliminar «Cierre por obras»? Los plazos ya calculados no cambian.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: copy.deleteConfirm }));

    await waitFor(() => expect(screen.queryByText('Cierre por obras')).not.toBeInTheDocument());
    expect(mockedDelete).toHaveBeenCalledWith('tok', 'sur', 'h-27');
    expect(screen.getByText('Día de la sede')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: copy.add })).toHaveFocus());
  });

  it('a failed delete leaves the row and notifies with retry', async () => {
    mockedDelete.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(undefined);
    const user = setupUser();
    renderSection([puntual2027]);
    await openRowAction(user, 'Cierre por obras', copy.delete);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: copy.deleteConfirm }));

    await waitFor(() => expect(mockedNotify).toHaveBeenCalled());
    expect(mockedNotify).toHaveBeenCalledWith(copy.deleteError, { onRetry: expect.any(Function) });
    expect(screen.getByText('Cierre por obras')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: actionsName('Cierre por obras') })).toHaveFocus(),
    );

    // Reintentar desde el aviso la retira.
    const { onRetry } = mockedNotify.mock.calls[0][1] as { onRetry: () => void };
    onRetry();
    await waitFor(() => expect(screen.queryByText('Cierre por obras')).not.toBeInTheDocument());
  });

  it('edit opens the modal with the holiday and the row shows the new name', async () => {
    const { updateHoliday } = jest.requireMock('../../lib/locations/location-calendar-api') as {
      updateHoliday: jest.Mock;
    };
    updateHoliday.mockResolvedValue({ ...puntual2027, name: 'Obras' });
    const user = setupUser();
    renderSection([puntual2027]);
    await openRowAction(user, 'Cierre por obras', copy.edit);
    const name = screen.getByLabelText(holidayFormCopy.name);
    await user.clear(name);
    await user.type(name, 'Obras');
    await user.click(screen.getByRole('button', { name: holidayFormCopy.save }));
    expect(await screen.findByText('Obras')).toBeInTheDocument();
    expect(updateHoliday).toHaveBeenCalledWith('tok', 'sur', 'h-27', { name: 'Obras' });
    await waitFor(() => expect(screen.getByRole('button', { name: actionsName('Obras') })).toHaveFocus());
  });

  it('exactly one primary button, empty or not', () => {
    const { unmount } = render(<Harness location={usa} initial={[]} />);
    expect(screen.getAllByRole('button').filter((b) => b.classList.contains('bg-primary'))).toHaveLength(1);
    unmount();
    render(<Harness location={usa} initial={[mayo]} />);
    expect(screen.getAllByRole('button').filter((b) => b.classList.contains('bg-primary'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: copy.add })).toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: copy.import })).not.toHaveClass('bg-primary');
  });

  it('rows are 44 px only as a table: the stacked mobile card grows with its content', () => {
    renderSection([puntual2027]);
    const row = rowOf('Cierre por obras');
    expect(row).toHaveClass('sm:h-11');
    expect(row).not.toHaveClass('h-11');
  });

  it('two holidays with the same name have distinct actions buttons, named with their date', () => {
    const otro: LocationHoliday = { id: 'h-28b', date: '2028-05-03', name: 'Cierre por obras', recurring: false };
    renderSection([puntual2027, otro, mayo]);
    expect(screen.getByRole('button', { name: 'Acciones de Cierre por obras, 05/03/2027 · lunes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acciones de Cierre por obras, 05/03/2028 · miércoles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acciones de Día de la sede, 3 de mayo' })).toBeInTheDocument();
  });

  it('without a format the actions button is named after the holiday only', () => {
    renderSection([puntual2027], clinicLocation({ locale: null }));
    expect(screen.getByRole('button', { name: 'Acciones de Cierre por obras' })).toBeInTheDocument();
  });

  it('a 404 on delete removes the row, says it was already deleted and offers no retry', async () => {
    mockedDelete.mockRejectedValue(new ApiError(404, 'No encontramos ese festivo.', { code: 'HOLIDAY_NOT_FOUND' }));
    const user = setupUser();
    renderSection([mayo, puntual2027]);
    await openRowAction(user, 'Cierre por obras', copy.delete);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: copy.deleteConfirm }));

    await waitFor(() => expect(screen.queryByText('Cierre por obras')).not.toBeInTheDocument());
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    expect(mockedNotify).toHaveBeenCalledWith(copy.alreadyDeleted);
    await waitFor(() => expect(screen.getByRole('button', { name: copy.add })).toHaveFocus());
  });

  it('Escape during an in-flight delete keeps the dialog until it ends, then focus lands on «Añadir festivo»', async () => {
    let finish: () => void = () => {};
    mockedDelete.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const user = setupUser();
    renderSection([mayo, puntual2027]);
    await openRowAction(user, 'Cierre por obras', copy.delete);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: copy.deleteConfirm }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalled());

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    finish();
    await waitFor(() => expect(screen.queryByText('Cierre por obras')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: copy.add })).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  describe('import (Task 10)', () => {
    function importResult(n: number, dryRun: boolean, extra: Partial<HolidayImportResult['counts']> = {}): HolidayImportResult {
      return { format: 'CSV', dryRun, counts: { new: n, duplicate: 0, error: 0, ...extra }, rows: [] };
    }
    const csvFile = () => new File(['fecha,nombre\n2027-05-03,Obras\n'], 'festivos.csv', { type: 'text/csv' });

    async function importFromEmpty(user: ReturnType<typeof setupUser>) {
      await user.click(screen.getByRole('button', { name: 'Importar' }));
      await user.upload(await screen.findByLabelText('Archivo de festivos (.csv o .ics)'), csvFile());
      await screen.findByTestId('holiday-import-summary');
      await user.click(screen.getByRole('button', { name: /^Importar \d/ }));
    }

    it('confirming imports, closes, reloads and shows the status summary', async () => {
      const user = setupUser();
      mockedPreview.mockResolvedValue(importResult(2, true));
      mockedImport.mockResolvedValue(importResult(2, false));
      mockedGet.mockResolvedValue({ locationId: 'sur', workingWeekdays: [1, 2, 3, 4, 5], holidays: [mayo, puntual2027] });
      renderSection([]);
      await importFromEmpty(user);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockedGet).toHaveBeenCalledWith('tok', 'sur');
      expect(rowOf('Día de la sede')).toBeInTheDocument();
      expect(rowOf('Cierre por obras')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Importados 2 festivos');
      // El vacío ya no está: el foco va al «Importar» de la barra, no a <body>.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toHaveFocus());
    });

    it('the status summary is singular and adds what was skipped', async () => {
      const user = setupUser();
      mockedPreview.mockResolvedValue(importResult(1, true, { duplicate: 3, error: 1 }));
      mockedImport.mockResolvedValue(importResult(1, false, { duplicate: 3, error: 1 }));
      mockedGet.mockResolvedValue({ locationId: 'sur', workingWeekdays: [1, 2, 3, 4, 5], holidays: [mayo] });
      renderSection([]);
      await importFromEmpty(user);
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Importado 1 festivo · 3 ya existían · 1 con error'));
    });

    it('if the reload fails after importing, it says so with a retry and keeps the summary', async () => {
      const user = setupUser();
      mockedPreview.mockResolvedValue(importResult(2, true));
      mockedImport.mockResolvedValue(importResult(2, false));
      // Sin red: el aviso sigue diciendo que la importación sí se hizo (M2).
      mockedGet.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));
      renderSection([]);
      await importFromEmpty(user);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('status')).toHaveTextContent('Importados 2 festivos');
      expect(mockedNotify).toHaveBeenCalledWith(copy.reloadError, expect.objectContaining({ onRetry: expect.any(Function) }));
      mockedGet.mockResolvedValueOnce({ locationId: 'sur', workingWeekdays: [1, 2, 3, 4, 5], holidays: [mayo] });
      mockedNotify.mock.calls[0][1]!.onRetry!();
      expect(await screen.findByText('Día de la sede')).toBeInTheDocument();
    });

    it('the status summary is written only after the dialog has closed and the page is no longer aria-hidden', async () => {
      const user = setupUser();
      mockedPreview.mockResolvedValue(importResult(2, true));
      mockedImport.mockResolvedValue(importResult(2, false));
      let finishReload!: () => void;
      mockedGet.mockReturnValue(
        new Promise((resolve) => {
          finishReload = () => resolve({ locationId: 'sur', workingWeekdays: [1, 2, 3, 4, 5], holidays: [mayo] });
        }),
      );
      renderSection([]);
      await importFromEmpty(user);
      await waitFor(() => expect(mockedGet).toHaveBeenCalled());
      // Diálogo abierto (espera a la recarga): la línea sigue vacía.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const status = () => document.querySelector('section p[role="status"]') as HTMLElement;
      expect(status()).toBeEmptyDOMElement();
      finishReload();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(status()).toHaveTextContent('Importados 2 festivos'));
      expect(status().closest('[aria-hidden="true"]')).toBeNull();
    });

    it('when the result differs, the summary waits until the user closes the dialog', async () => {
      const user = setupUser();
      mockedPreview.mockResolvedValue(importResult(2, true));
      mockedImport.mockResolvedValue(importResult(1, false, { duplicate: 1 }));
      mockedGet.mockResolvedValue({ locationId: 'sur', workingWeekdays: [1, 2, 3, 4, 5], holidays: [mayo] });
      renderSection([]);
      await importFromEmpty(user);
      await screen.findByText(/cambiaron mientras revisabas el archivo/);
      const status = () => document.querySelector('section p[role="status"]') as HTMLElement;
      expect(status()).toBeEmptyDOMElement();
      const footerClose = screen.getAllByRole('button', { name: 'Cerrar' }).find((b) => !b.querySelector('.sr-only'));
      await user.click(footerClose as HTMLElement);
      await waitFor(() => expect(status()).toHaveTextContent('Importado 1 festivo · 1 ya existía'));
    });

    it('a later add clears the import summary', async () => {
      const user = setupUser();
      mockedPreview.mockResolvedValue(importResult(1, true));
      mockedImport.mockResolvedValue(importResult(1, false));
      mockedGet.mockResolvedValue({ locationId: 'sur', workingWeekdays: [1, 2, 3, 4, 5], holidays: [mayo] });
      mockedCreate.mockResolvedValue(puntual2027);
      renderSection([]);
      await importFromEmpty(user);
      const status = () => document.querySelector('section p[role="status"]') as HTMLElement;
      await waitFor(() => expect(status()).toHaveTextContent('Importado 1 festivo'));
      await user.click(screen.getByRole('button', { name: copy.add }));
      await user.type(await screen.findByLabelText('Fecha'), '2027-05-03');
      await user.type(screen.getByLabelText('Nombre'), 'Cierre por obras');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Añadir festivo' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(status()).toBeEmptyDOMElement();
    });

    it('a later delete clears the import summary', async () => {
      const user = setupUser();
      mockedPreview.mockResolvedValue(importResult(1, true));
      mockedImport.mockResolvedValue(importResult(1, false));
      mockedGet.mockResolvedValue({ locationId: 'sur', workingWeekdays: [1, 2, 3, 4, 5], holidays: [mayo] });
      mockedDelete.mockResolvedValue(undefined);
      renderSection([]);
      await importFromEmpty(user);
      const status = () => document.querySelector('section p[role="status"]') as HTMLElement;
      await waitFor(() => expect(status()).toHaveTextContent('Importado 1 festivo'));
      await openRowAction(user, 'Día de la sede', copy.delete);
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: copy.deleteConfirm }));
      await waitFor(() => expect(screen.queryByText('Día de la sede')).not.toBeInTheDocument());
      expect(status()).toBeEmptyDOMElement();
    });
  });
});
