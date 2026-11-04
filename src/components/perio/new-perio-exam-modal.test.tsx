import { render, screen, waitFor, within } from '@testing-library/react';
import { NewPerioExamModal } from './new-perio-exam-modal';
import { createPerioExam } from '@/lib/perio/perio-api';
import { setupUser } from '@/lib/test/user';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import userEvent from '@testing-library/user-event';

jest.mock('../../lib/perio/perio-api', () => ({
  ...jest.requireActual('../../lib/perio/perio-api'),
  createPerioExam: jest.fn(),
}));

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedCreate = createPerioExam as jest.MockedFunction<typeof createPerioExam>;

describe('NewPerioExamModal', () => {
  beforeEach(() => {
    mockedCreate.mockReset();
    mockedLocations.mockReset().mockResolvedValue([clinicLocation()]);
  });

  function renderModal(hasPrevious: boolean) {
    const onCreated = jest.fn();
    render(
      <NewPerioExamModal
        open
        onOpenChange={jest.fn()}
        token="tok"
        patientId="p1"
        hasPrevious={hasPrevious}
        onCreated={onCreated}
      />,
    );
    return onCreated;
  }

  it('sin tocar la fecha deja que la API ponga «hoy» de la clínica y copia omitidos', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ id: 'e1' } as never);
    const onCreated = renderModal(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear examen' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Crear examen' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
      examDate: undefined,
      notes: undefined,
      copySkippedFromLast: true,
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('envía la fecha elegida y no ofrece copiar si no hay examen previo', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ id: 'e1' } as never);
    renderModal(false);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear examen' })).toBeEnabled());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    // DatePicker de segmentos (formato de la sede): se teclea día, mes y año.
    const group = screen.getByRole('group', { name: 'Fecha del examen' });
    await user.click(within(group).getAllByRole('spinbutton')[0]);
    await user.keyboard('15042026');
    await user.click(screen.getByRole('button', { name: 'Crear examen' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
      examDate: '2026-04-15',
      notes: undefined,
      copySkippedFromLast: false,
    });
  });

  describe('DX-354b (E9): «hoy» es el de la sede, no el del navegador', () => {
    // 02:30Z del 5 de noviembre: en Caracas (UTC-4) aún es el 4; el navegador (UTC) y Tokio ya están en el 5.
    beforeEach(() => {
      jest.useFakeTimers({
        now: new Date('2026-11-05T02:30:00Z'),
        doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
      });
    });
    afterEach(() => jest.useRealTimers());

    it('muestra el 4 de noviembre y rechaza el 5, que en la sede todavía es futuro', async () => {
      const user = userEvent.setup();
      mockedCreate.mockResolvedValue({ id: 'e1' } as never);
      renderModal(false);
      const group = screen.getByRole('group', { name: 'Fecha del examen' });
      await waitFor(() => expect(group.querySelector('[data-type="day"]')).toHaveAttribute('aria-valuenow', '4'));
      await user.click(within(group).getAllByRole('spinbutton')[0]);
      await user.keyboard('05112026');
      await user.click(screen.getByRole('button', { name: 'Crear examen' }));
      expect(await screen.findByText('La fecha del examen no puede ser futura.')).toBeInTheDocument();
      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('sin la zona de la sede el campo se sustituye por su error y no se puede crear', async () => {
      mockedLocations.mockResolvedValue([clinicLocation({ timeZone: null })]);
      renderModal(false);
      expect(await screen.findByText('Sin zona de sede')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Fecha del examen' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Crear examen' })).toBeDisabled();
    });
  });
});
