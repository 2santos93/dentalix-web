import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterImplantModal } from './register-implant-modal';
import { getImplantCatalog, registerImplant } from '@/lib/implants/implants-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { makeImplant } from '@/lib/test/implants';

jest.mock('../../lib/implants/implants-api', () => ({
  ...jest.requireActual('../../lib/implants/implants-api'),
  getImplantCatalog: jest.fn(),
  registerImplant: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedCatalog = getImplantCatalog as jest.MockedFunction<typeof getImplantCatalog>;
const mockedRegister = registerImplant as jest.MockedFunction<typeof registerImplant>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

function renderModal() {
  return render(
    <RegisterImplantModal open onOpenChange={() => {}} token="tok" patientId="p1" onRegistered={() => {}} />,
  );
}

describe('RegisterImplantModal (DX-327)', () => {
  beforeEach(() => {
    mockedCatalog.mockReset().mockResolvedValue([]);
    mockedRegister.mockReset();
    mockedLocations.mockReset().mockResolvedValue([clinicLocation()]);
  });

  it('the sanitary registration label names no authority', async () => {
    renderModal();
    const field = screen.getByLabelText('Registro sanitario o certificación del producto');
    expect(field).toBeInTheDocument();
    const dialog = field.closest('[role="dialog"]') ?? document.body;
    expect(dialog.textContent).not.toMatch(/INVIMA|marcado CE|\bCE\b/);
    // Deja resolver la carga de sugerencias dentro de act.
    await act(async () => {});
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

    it('la fecha de colocación parte del 4 de noviembre y se envía ese día', async () => {
      const user = userEvent.setup();
      mockedRegister.mockResolvedValue(makeImplant());
      renderModal();
      await user.type(screen.getByLabelText('Diente (FDI)'), '36');
      await user.type(screen.getByLabelText('Fabricante'), 'Straumann');
      await user.type(screen.getByLabelText('Referencia (REF)'), 'REF-1');
      await user.type(screen.getByLabelText('Lote'), 'LOT-1');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar implante' })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: 'Registrar implante' }));
      await waitFor(() => expect(mockedRegister).toHaveBeenCalledTimes(1));
      expect(mockedRegister.mock.calls[0][2]).toMatchObject({ placedOn: '2026-11-04' });
    });

    it('sin la zona de la sede el campo se sustituye por su error y no se puede registrar', async () => {
      mockedLocations.mockResolvedValue([clinicLocation({ timeZone: null })]);
      renderModal();
      expect(await screen.findByText('Sin zona de sede')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar implante' })).toBeDisabled();
    });
  });
});
