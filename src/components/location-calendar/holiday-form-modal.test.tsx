import { render, screen, waitFor, within } from '@testing-library/react';
import { dateGroup, readDate, typeDate } from '@/components/appointments/date-segments-for-tests';
import { HolidayFormModal, holidayFormCopy } from './holiday-form-modal';
import { createHoliday, updateHoliday, type LocationHoliday } from '@/lib/locations/location-calendar-api';
import { ApiError } from '@/lib/api/api-error';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/locations/location-calendar-api', () => ({
  ...jest.requireActual('../../lib/locations/location-calendar-api'),
  createHoliday: jest.fn(),
  updateHoliday: jest.fn(),
}));
const mockedCreate = jest.mocked(createHoliday);
const mockedUpdate = jest.mocked(updateHoliday);

const copy = holidayFormCopy;
const mayo: LocationHoliday = { id: 'hol-1', date: '2027-05-03', name: 'Fiesta local', recurring: false };

function renderModal(holiday?: LocationHoliday) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <HolidayFormModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      locationId="norte"
      holiday={holiday}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
}

/** La fecha es un `DatePicker` por segmentos: el primero (el día, en `es`) lleva foco e invalidez. */
const daySegment = () => within(dateGroup(copy.date)).getAllByRole('spinbutton')[0];
const nameInput = () => screen.getByLabelText(copy.name) as HTMLInputElement;
const recurringBox = () => screen.getByRole('checkbox', { name: copy.recurring }) as HTMLInputElement;

beforeEach(() => jest.clearAllMocks());

describe('HolidayFormModal (DX-316, spec §7.2)', () => {
  it('add posts exactly { date, name, recurring } with the ISO date and the trimmed name', async () => {
    mockedCreate.mockResolvedValue({ id: 'hol-9', date: '2027-12-25', name: 'Navidad', recurring: true });
    const user = setupUser();
    const { onSaved, onOpenChange } = renderModal();
    expect(screen.getByRole('heading', { name: copy.createTitle })).toBeInTheDocument();
    expect(daySegment()).toHaveAttribute('data-type', 'day');
    expect(nameInput()).toHaveAttribute('maxLength', '120');

    await typeDate(user, copy.date, '2027-12-25');
    await user.type(nameInput(), '  Navidad ');
    await user.click(recurringBox());
    await user.click(screen.getByRole('button', { name: copy.create }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'norte', { date: '2027-12-25', name: 'Navidad', recurring: true });
    expect(Object.keys(mockedCreate.mock.calls[0][2]).sort()).toEqual(['date', 'name', 'recurring']);
    expect(onSaved).toHaveBeenCalledWith({ id: 'hol-9', date: '2027-12-25', name: 'Navidad', recurring: true });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('missing date or name is said next to the field and nothing is sent', async () => {
    const user = setupUser();
    renderModal();
    await user.click(screen.getByRole('button', { name: copy.create }));
    expect(screen.getByText(copy.dateMissing)).toBeInTheDocument();
    expect(screen.getByText(copy.nameMissing)).toBeInTheDocument();
    expect(daySegment()).toHaveAttribute('aria-invalid', 'true');
    expect(daySegment()).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('409 shows the API message at the top of the modal and keeps it open', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(409, 'Ya hay un festivo ese día: «Cierre anual».', {
        code: 'HOLIDAY_ALREADY_EXISTS',
        holidayId: 'hol-7',
      }),
    );
    const user = setupUser();
    const { onSaved, onOpenChange } = renderModal();
    await typeDate(user, copy.date, '2027-05-03');
    await user.type(nameInput(), 'Fiesta');
    await user.click(screen.getByRole('button', { name: copy.create }));

    expect(await screen.findByText('Ya hay un festivo ese día: «Cierre anual».')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Lo escrito se queda para corregirlo.
    expect(readDate(copy.date)).toBe('2027-05-03');
    expect(nameInput().value).toBe('Fiesta');
  });

  it('a 400 with the class-validator array goes to the top of the modal', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(400, 'Bad Request', {
        messages: [
          'Fecha «x» no válida: usa AAAA-MM-DD, por ejemplo 2027-05-03.',
          'El nombre es obligatorio (hasta 120 caracteres).',
        ],
      }),
    );
    const user = setupUser();
    renderModal();
    await typeDate(user, copy.date, '2027-05-03');
    await user.type(nameInput(), 'Fiesta');
    await user.click(screen.getByRole('button', { name: copy.create }));

    const banner = await screen.findByText(/Fecha «x» no válida/);
    expect(banner).toHaveTextContent('El nombre es obligatorio (hasta 120 caracteres).');
    expect(daySegment()).not.toHaveAttribute('aria-invalid');
    expect(nameInput()).not.toHaveAttribute('aria-invalid');
  });

  it('a 400 naming a field the form does not have goes to the top of the modal', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(400, 'El identificador de la sede no es válido.', { field: 'locationId' }),
    );
    const user = setupUser();
    renderModal();
    await typeDate(user, copy.date, '2027-05-03');
    await user.type(nameInput(), 'Fiesta');
    await user.click(screen.getByRole('button', { name: copy.create }));

    expect(await screen.findByText('El identificador de la sede no es válido.')).toBeInTheDocument();
    expect(daySegment()).not.toHaveAttribute('aria-invalid');
    expect(nameInput()).not.toHaveAttribute('aria-invalid');
    expect(recurringBox()).not.toHaveAttribute('aria-invalid');
  });

  it('409 LOCATION_HOLIDAY_LIMIT on create is shown too', async () => {
    const message = 'La sede tendría más de 1.000 festivos. Borra los de años pasados e inténtalo de nuevo.';
    mockedCreate.mockRejectedValue(new ApiError(409, message, { code: 'LOCATION_HOLIDAY_LIMIT' }));
    const user = setupUser();
    renderModal();
    await typeDate(user, copy.date, '2027-05-03');
    await user.type(nameInput(), 'Fiesta');
    await user.click(screen.getByRole('button', { name: copy.create }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('a 400 with a field goes next to that field', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(400, 'Un festivo de cada año no puede ser el 29 de febrero.', { field: 'recurring' }),
    );
    const user = setupUser();
    renderModal();
    await typeDate(user, copy.date, '2028-02-29');
    await user.type(nameInput(), 'Bisiesto');
    await user.click(recurringBox());
    await user.click(screen.getByRole('button', { name: copy.create }));

    const message = await screen.findByText('Un festivo de cada año no puede ser el 29 de febrero.');
    // La casilla lleva su pista y el error: los dos se leen.
    expect(recurringBox().getAttribute('aria-describedby')?.split(' ')).toContain(message.closest('[id]')?.id);
    expect(recurringBox()).toHaveFocus();
  });

  it('edit sends only changed fields', async () => {
    mockedUpdate.mockResolvedValue({ ...mayo, name: 'Fiesta mayor' });
    const user = setupUser();
    const { onSaved } = renderModal(mayo);
    expect(screen.getByRole('heading', { name: copy.editTitle })).toBeInTheDocument();
    expect(readDate(copy.date)).toBe('2027-05-03');
    expect(nameInput().value).toBe('Fiesta local');
    expect(recurringBox().checked).toBe(false);

    await user.clear(nameInput());
    await user.type(nameInput(), 'Fiesta mayor');
    await user.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...mayo, name: 'Fiesta mayor' }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'norte', 'hol-1', { name: 'Fiesta mayor' });
  });

  it('edit without changes closes without calling the API', async () => {
    const user = setupUser();
    const { onOpenChange } = renderModal(mayo);
    await user.click(screen.getByRole('button', { name: copy.save }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
