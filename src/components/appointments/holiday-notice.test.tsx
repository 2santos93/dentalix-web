import { render, screen, waitFor } from '@testing-library/react';
import { getHolidayOnDay } from '@/lib/locations/location-calendar-api';
import { HolidayNotice } from './holiday-notice';

jest.mock('../../lib/locations/location-calendar-api', () => ({ getHolidayOnDay: jest.fn() }));
const lookup = jest.mocked(getHolidayOnDay);

beforeEach(() => lookup.mockReset());

describe('HolidayNotice (DX-358)', () => {
  it('avisa con el nombre del festivo de esa sede y ese día', async () => {
    lookup.mockResolvedValue({ date: '2030-07-05', name: 'Día de la Independencia' });
    render(<HolidayNotice token="tok" locationId="l1" date="2030-07-05" />);
    expect(await screen.findByTestId('holiday-notice')).toHaveTextContent(
      'Ese día es festivo en la sede: Día de la Independencia. Puedes agendar igual.',
    );
    expect(lookup).toHaveBeenCalledWith('tok', 'l1', '2030-07-05');
  });

  it('en un día normal no pinta nada', async () => {
    lookup.mockResolvedValue({ date: '2030-07-06', name: null });
    const { container } = render(<HolidayNotice token="tok" locationId="l1" date="2030-07-06" />);
    await waitFor(() => expect(lookup).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('si falla lo dice, y al cambiar de día no deja el aviso del anterior', async () => {
    lookup.mockRejectedValueOnce(new Error('red'));
    const { rerender } = render(<HolidayNotice token="tok" locationId="l1" date="2030-07-05" />);
    expect(await screen.findByRole('status')).toHaveTextContent('No pudimos comprobar');
    lookup.mockReturnValueOnce(new Promise(() => {}));
    rerender(<HolidayNotice token="tok" locationId="l1" date="2030-07-06" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sin sede o sin fecha completa no consulta', () => {
    render(<HolidayNotice token="tok" locationId={null} date="2030-07-05" />);
    render(<HolidayNotice token="tok" locationId="l1" date="" />);
    expect(lookup).not.toHaveBeenCalled();
  });
});
