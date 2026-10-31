import { render, screen, waitFor, within } from '@testing-library/react';
import { WorkingWeekdaysForm } from './working-weekdays-form';
import { setWorkingWeekdays } from '@/lib/locations/location-calendar-api';
import { ISO_WEEK_ORDER } from '@/lib/locations/location-calendar';
import { regionalFormat } from '@/lib/format/regional-format';
import { ApiError } from '@/lib/api/api-error';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/locations/location-calendar-api', () => ({
  ...jest.requireActual('../../lib/locations/location-calendar-api'),
  setWorkingWeekdays: jest.fn(),
}));
const mockedSet = jest.mocked(setWorkingWeekdays);

// Los nombres de los días salen del helper en UI_LANGUAGE; ninguna sede los cambia (I6, M3).
const fmt = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });

function renderForm(initial: number[] = [1, 2, 3, 4, 5], onSaved = jest.fn(), locale?: string | null) {
  render(<WorkingWeekdaysForm token="tok" locationId="loc-1" initial={initial} locale={locale} onSaved={onSaved} />);
  return onSaved;
}

const save = () => screen.getByRole('button', { name: 'Guardar días hábiles' });

const fieldset = () => screen.getByRole('group', { name: 'Días hábiles' });

beforeEach(() => {
  mockedSet.mockReset();
});

describe('WorkingWeekdaysForm (DX-316, spec §7.2)', () => {
  it('without a locale the weekday checkboxes are Monday→Sunday (ISO), labelled with fmt.weekdayName, and the summary reads «Lunes a viernes»', () => {
    renderForm();
    const boxes = within(fieldset()).getAllByRole('checkbox') as HTMLInputElement[];
    const names = boxes.map((box) => box.labels?.[0]?.textContent);
    expect(names).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    // Los mismos nombres que da el helper de la sede, solo con la inicial en mayúscula.
    expect(names.map((n) => n?.toLowerCase())).toEqual(ISO_WEEK_ORDER.map((d) => fmt.weekdayName(d)));
    expect(boxes.map((box) => box.checked)).toEqual([true, true, true, true, true, false, false]);
    expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('Lunes a viernes');
    expect(screen.getByText(/Por defecto, lunes a viernes\. Cámbialo si tu sede trabaja otros días\. No cambia el horario de atención ni las citas\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Horarios' })).toHaveAttribute('href', '/settings/horarios');
    // Sin cambios no hay nada que guardar: ni barra ni «Guardar» deshabilitado a la vista.
    expect(screen.queryByRole('button', { name: 'Guardar días hábiles' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cambios sin guardar')).not.toBeInTheDocument();
  });

  it.each([
    ['en-US', ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']],
    ['de-DE', ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']],
    ['es', ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']],
  ])('the week starts where the sede locale %s starts it (weekOrder, as Horarios)', (locale, expected) => {
    renderForm([1, 2, 3, 4, 5], jest.fn(), locale);
    const boxes = within(fieldset()).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((box) => box.labels?.[0]?.textContent)).toEqual(expected);
  });

  it('nothing is saved without «Guardar»: a change shows the bar, «Descartar» undoes it', async () => {
    const user = setupUser();
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    expect(save()).toBeEnabled();
    expect(mockedSet).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.getByRole('checkbox', { name: 'Sábado' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Guardar días hábiles' })).not.toBeInTheDocument();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('with unsaved changes, leaving the page asks first (beforeunload)', async () => {
    const user = setupUser();
    renderForm();
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it('saving [Sun–Thu] sends [0,1,2,3,4] and shows «Guardado»', async () => {
    const user = setupUser();
    const saved = { locationId: 'loc-1', workingWeekdays: [0, 1, 2, 3, 4], holidays: [] };
    mockedSet.mockResolvedValue(saved);
    const onSaved = renderForm();
    await user.click(screen.getByRole('checkbox', { name: 'Viernes' }));
    await user.click(screen.getByRole('checkbox', { name: 'Domingo' }));
    expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('Domingo a jueves');
    await user.click(save());
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith('tok', 'loc-1', [0, 1, 2, 3, 4]));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardado'));
    expect(onSaved).toHaveBeenCalledWith(saved);
    // Lo guardado es la nueva base: la barra se va.
    expect(screen.queryByRole('button', { name: 'Guardar días hábiles' })).not.toBeInTheDocument();
  });

  it('«Guardado» goes into a live region that was already mounted', async () => {
    const user = setupUser();
    mockedSet.mockResolvedValue({ locationId: 'loc-1', workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [] });
    renderForm();
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
    await user.click(save());
    await waitFor(() => expect(status).toHaveTextContent('Guardado'));
    expect(screen.getByRole('status')).toBe(status);
  });

  it('after a keyboard save focus lands on the first day, never on <body>', async () => {
    const user = setupUser();
    mockedSet.mockResolvedValue({ locationId: 'loc-1', workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [] });
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
    save().focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardado'));
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('checkbox', { name: 'Lunes' })).toHaveFocus();
  });

  it('after a failed keyboard save focus returns to «Guardar días hábiles» with the error linked', async () => {
    const user = setupUser();
    mockedSet.mockRejectedValue(new ApiError(500, 'Internal server error'));
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
    save().focus();
    await user.keyboard('{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos guardar los días hábiles. Intenta de nuevo.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar días hábiles' })).toHaveFocus());
    expect(fieldset()).toHaveAttribute('aria-describedby', expect.stringContaining(alert.id));
  });

  it('unchecking every day shows «Elige al menos un día hábil.» and «Guardar» sends nothing', async () => {
    const user = setupUser();
    renderForm([1, 2]);
    await user.click(screen.getByRole('checkbox', { name: 'Lunes' }));
    await user.click(screen.getByRole('checkbox', { name: 'Martes' }));
    expect(screen.getByText('Elige al menos un día hábil.')).toBeInTheDocument();
    expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('—');
    await user.click(save());
    expect(screen.getByText('Elige al menos un día hábil.')).toBeInTheDocument();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('API 400 shows InlineError next to the fieldset', async () => {
    const user = setupUser();
    const message = 'Los días hábiles van de 0 (domingo) a 6 (sábado).';
    mockedSet.mockRejectedValue(new ApiError(400, message, { messages: [message] }));
    const onSaved = renderForm();
    await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
    await user.click(save());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(fieldset()).toHaveAttribute('aria-describedby', expect.stringContaining(alert.id));
    expect(fieldset()).not.toHaveAttribute('aria-invalid');
    // Justo debajo de las casillas, antes del resumen y la ayuda.
    expect(fieldset().nextElementSibling).toBe(alert);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });
});
