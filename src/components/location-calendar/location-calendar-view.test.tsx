import { useSyncExternalStore } from 'react';
import { typeDate } from '@/components/appointments/date-segments-for-tests';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import { LocationCalendarView, locationCalendarCopy } from './location-calendar-view';
import { listLocations } from '@/lib/locations/locations-api';
import { createHoliday, getLocationCalendar, setWorkingWeekdays } from '@/lib/locations/location-calendar-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { ApiError } from '@/lib/api/api-error';
import { clinicLocation } from '@/lib/test/locations';
import { setupUser } from '@/lib/test/user';

// Los campos de fecha y hora por segmentos (react-aria) hacen el formulario más
// pesado en jsdom: con la máquina cargada, 1 s de espera de `findBy` se quedaba corto
// (mismo arreglo que perio-exam-editor). No cambia ninguna aserción.
configure({ asyncUtilTimeout: 5_000 });

// La URL de prueba: `router.replace` la cambia y la vista vuelve a leerla.
let search = new URLSearchParams();
const listeners = new Set<() => void>();
const replace = jest.fn((href: string) => {
  search = new URLSearchParams(href.split('?')[1] ?? '');
  listeners.forEach((l) => l());
});
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/settings/calendario',
  useSearchParams: () =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => search,
    ),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/locations/location-calendar-api', () => ({
  ...jest.requireActual('../../lib/locations/location-calendar-api'),
  getLocationCalendar: jest.fn(),
  setWorkingWeekdays: jest.fn(),
  createHoliday: jest.fn(),
}));
const mockedList = jest.mocked(listLocations);
const mockedGet = jest.mocked(getLocationCalendar);
const mockedSetWeekdays = jest.mocked(setWorkingWeekdays);
const mockedCreate = jest.mocked(createHoliday);

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'de-DE', hourCycle: 'h23' });
const sur = clinicLocation({ id: 'sur', name: 'Sede Sur', locale: 'en-US', hourCycle: 'h12' });
const vieja = clinicLocation({ id: 'vieja', name: 'Sede Vieja', isActive: false });

function calendar(locationId: string, workingWeekdays = [1, 2, 3, 4, 5]) {
  return { locationId, workingWeekdays, holidays: [] };
}

function renderView() {
  return render(<LocationCalendarView token="tok" allowed />);
}

const sedeSelect = () => screen.getByRole('combobox', { name: 'Sede' }) as HTMLSelectElement;

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  search = new URLSearchParams();
  mockedList.mockResolvedValue([norte, sur, vieja]);
  mockedGet.mockImplementation(async (_token, id) =>
    calendar(id, id === 'sur' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5]),
  );
});

describe('LocationCalendarView (DX-316, spec §7.1–§7.2)', () => {
  it('defaults to the active location and switches with the Sede select, updating ?sede=', async () => {
    setActiveLocationId('sur');
    const user = setupUser();
    renderView();
    expect(await screen.findByTestId('working-weekdays-summary')).toHaveTextContent('Domingo a jueves');
    expect(sedeSelect().value).toBe('sur');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'sur');

    await user.selectOptions(sedeSelect(), 'Sede Norte');
    expect(replace).toHaveBeenCalledWith('/settings/calendario?sede=norte', { scroll: false });
    await waitFor(() => expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('Lunes a viernes'));
    expect(sedeSelect().value).toBe('norte');
    expect(mockedGet).toHaveBeenLastCalledWith('tok', 'norte');
  });

  it('without an active location («Todas las sedes») picks the first active one', async () => {
    mockedList.mockResolvedValue([vieja, norte, sur]);
    renderView();
    await screen.findByTestId('working-weekdays-summary');
    expect(sedeSelect().value).toBe('norte');
  });

  it('?sede=<id> preselects that location', async () => {
    setActiveLocationId('norte');
    search = new URLSearchParams('sede=sur');
    renderView();
    expect(await screen.findByTestId('working-weekdays-summary')).toHaveTextContent('Domingo a jueves');
    expect(sedeSelect().value).toBe('sur');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'sur');
    expect(mockedGet).not.toHaveBeenCalledWith('tok', 'norte');
  });

  it('an inactive location reads «(inactiva)» in the Sede select', async () => {
    renderView();
    await screen.findByTestId('working-weekdays-summary');
    const options = within(sedeSelect()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Sede Norte', 'Sede Sur', 'Sede Vieja (inactiva)']);
  });

  it('load failure shows SectionError with retry', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    renderView();
    expect(await screen.findByText('No pudimos cargar el calendario de la sede.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('working-weekdays-summary')).toHaveTextContent('Lunes a viernes');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('a failed list of locations shows SectionError with retry', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    renderView();
    expect(await screen.findByText('No pudimos cargar las sedes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('working-weekdays-summary')).toBeInTheDocument();
  });

  it('a non-ADMIN sees the locked state and nothing is fetched', () => {
    render(<LocationCalendarView token="tok" allowed={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Solo administración cambia el calendario de la sede.');
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('a stale ADMIN role still shows the API 403 message in the section', async () => {
    const message = 'Solo un administrador de la clínica puede ver o cambiar el calendario de la sede.';
    mockedGet.mockRejectedValue(new ApiError(403, message));
    renderView();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Días hábiles' })).not.toBeInTheDocument();
  });

  it('an unknown or foreign ?sede= opens the default location and replaces the id in the URL', async () => {
    setActiveLocationId('norte');
    search = new URLSearchParams('sede=otra-clinica');
    renderView();
    await screen.findByTestId('working-weekdays-summary');
    expect(sedeSelect().value).toBe('norte');
    expect(replace).toHaveBeenCalledWith('/settings/calendario?sede=norte', { scroll: false });
    expect(mockedGet).not.toHaveBeenCalledWith('tok', 'otra-clinica');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'norte');
  });

  it('a valid ?sede= is left alone in the URL', async () => {
    search = new URLSearchParams('sede=sur');
    renderView();
    await screen.findByTestId('working-weekdays-summary');
    expect(replace).not.toHaveBeenCalled();
  });

  it('a location without a usable format still shows the weekdays form, under one note for the whole screen (M3)', async () => {
    mockedList.mockResolvedValue([clinicLocation({ id: 'sin', name: 'Sede Sin Formato', locale: null })]);
    renderView();
    expect(await screen.findAllByText(locationCalendarCopy.noFormat)).toHaveLength(1);
    // La nota va encima de las secciones, no dentro de «Días hábiles».
    const section = screen.getByRole('region', { name: 'Días hábiles' });
    expect(within(section).queryByText(/No se pudo saber el formato regional/)).not.toBeInTheDocument();
    // Los nombres de los días no dependen del formato de la sede: el formulario se puede usar.
    const group = within(section).getByRole('group', { name: 'Días hábiles' });
    expect(within(group).getAllByRole('checkbox').map((box) => (box as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ]);
    expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('Lunes a viernes');
  });

  it('without a usable format the festivos show «—», keep add/edit/delete, and «Importar» is disabled and points to the note (M3)', async () => {
    mockedList.mockResolvedValue([clinicLocation({ id: 'sin', name: 'Sede Sin Formato', locale: null })]);
    mockedGet.mockResolvedValue({
      locationId: 'sin',
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [{ id: 'h1', date: '2027-05-03', name: 'Cierre', recurring: false }],
    });
    renderView();
    const festivos = await screen.findByRole('region', { name: 'Festivos' });
    expect(within(festivos).getByText('Cierre').closest('tr')).toHaveTextContent('—');
    expect(within(festivos).queryByText(/No se pudo saber el formato regional/)).not.toBeInTheDocument();
    expect(screen.getAllByText(locationCalendarCopy.noFormat)).toHaveLength(1);
    expect(within(festivos).getByRole('button', { name: 'Añadir festivo' })).toBeEnabled();
    expect(within(festivos).getByRole('button', { name: 'Acciones de Cierre' })).toBeEnabled();
    const importar = within(festivos).getByRole('button', { name: 'Importar' });
    expect(importar).toBeDisabled();
    expect(importar).toHaveAccessibleDescription(locationCalendarCopy.noFormat);
    // Nunca «Importar — festivos» ni «Línea —»: el modal no se abre.
    expect(screen.queryByText(/—\s*festivos|Línea —/)).not.toBeInTheDocument();
  });

  it('with a usable format «Importar» is enabled and has no description', async () => {
    setActiveLocationId('norte');
    renderView();
    const festivos = await screen.findByRole('region', { name: 'Festivos' });
    const importar = within(festivos).getByRole('button', { name: 'Importar' });
    expect(importar).toBeEnabled();
    expect(importar).not.toHaveAttribute('aria-describedby');
  });

  it('exactly one primary button in the view: «Añadir festivo»', async () => {
    mockedGet.mockResolvedValue({
      locationId: 'norte',
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [{ id: 'h1', date: '2027-05-03', name: 'Cierre', recurring: false }],
    });
    setActiveLocationId('norte');
    renderView();
    await screen.findByRole('region', { name: 'Festivos' });
    const primaries = screen.getAllByRole('button').filter((b) => b.classList.contains('bg-primary'));
    expect(primaries.map((b) => b.textContent)).toEqual(['Añadir festivo']);
  });

  it('an ADMIN sees «Importar» on the real screen, in the empty state and next to «Añadir festivo», and it opens the import', async () => {
    const user = setupUser();
    setActiveLocationId('norte');
    renderView();
    const section = await screen.findByRole('region', { name: 'Festivos' });
    await user.click(within(section).getByRole('button', { name: 'Importar' }));
    expect(await screen.findByRole('dialog', { name: 'Importar festivos' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    mockedGet.mockResolvedValue({
      locationId: 'sur',
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [{ id: 'h1', date: '2027-05-03', name: 'Cierre', recurring: false }],
    });
    await user.selectOptions(sedeSelect(), 'Sede Sur');
    await screen.findByText('Cierre');
    expect(within(screen.getByRole('region', { name: 'Festivos' })).getByRole('button', { name: 'Importar' })).toBeInTheDocument();
  });

  it('the festivos come from the calendar and use the format of the chosen location', async () => {
    mockedGet.mockResolvedValue({
      locationId: 'norte',
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [{ id: 'h1', date: '2027-05-03', name: 'Cierre', recurring: false }],
    });
    setActiveLocationId('norte');
    renderView();
    const festivos = await screen.findByRole('region', { name: 'Festivos' });
    expect(within(festivos).getByText('03.05.2027 · lunes')).toBeInTheDocument();
  });

  it('saving the working days keeps a holiday added while the save was in flight', async () => {
    setActiveLocationId('norte');
    let finishSave: (c: Awaited<ReturnType<typeof setWorkingWeekdays>>) => void = () => {};
    mockedSetWeekdays.mockImplementation(() => new Promise((resolve) => (finishSave = resolve)));
    mockedCreate.mockResolvedValue({ id: 'h-new', date: '2027-12-24', name: 'Nochebuena', recurring: false });
    const user = setupUser();
    renderView();
    const festivos = await screen.findByRole('region', { name: 'Festivos' });

    await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
    await user.click(screen.getByRole('button', { name: 'Guardar días hábiles' }));
    await waitFor(() => expect(mockedSetWeekdays).toHaveBeenCalled());

    await user.click(within(festivos).getByRole('button', { name: 'Añadir festivo' }));
    await typeDate(user, 'Fecha', '2027-12-24');
    await user.type(screen.getByLabelText('Nombre'), 'Nochebuena');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Añadir festivo' }));
    expect(await within(festivos).findByText('Nochebuena')).toBeInTheDocument();

    // La respuesta del PUT es de antes del alta: no trae el festivo nuevo.
    finishSave({ locationId: 'norte', workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [] });
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
    expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('Lunes a sábado');
    expect(within(festivos).getByText('Nochebuena')).toBeInTheDocument();
  });
});
