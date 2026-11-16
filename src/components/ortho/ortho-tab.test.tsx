import { render, screen, waitFor, within } from '@testing-library/react';
import { OrthoTab } from './ortho-tab';
import { listOrthoCases, listOrthoVisits, registerOrthoVisit } from '@/lib/ortho/ortho-api';
import { ApiError } from '@/lib/api/client';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/implants';
import { makeOrthoCase, makeOrthoVisit } from '@/lib/test/ortho';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/ortho/ortho-api', () => ({
  ...jest.requireActual('../../lib/ortho/ortho-api'),
  listOrthoCases: jest.fn(),
  listOrthoVisits: jest.fn(),
  registerOrthoVisit: jest.fn(),
  createOrthoCase: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedCases = listOrthoCases as jest.MockedFunction<typeof listOrthoCases>;
const mockedVisits = listOrthoVisits as jest.MockedFunction<typeof listOrthoVisits>;
const mockedRegister = registerOrthoVisit as jest.MockedFunction<typeof registerOrthoVisit>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const DENTIST = tokenFor('DENTIST', 'u-dentist');
const ASSISTANT = tokenFor('ASSISTANT', 'u-assistant');
const GAUGES = ['0.014', '0.016', '0.018', '0.016x0.022'];

describe('OrthoTab (DX-190)', () => {
  beforeEach(() => {
    mockedCases.mockReset();
    mockedVisits.mockReset();
    mockedRegister.mockReset();
    mockedLocations.mockReset().mockResolvedValue([clinicLocation()]);
  });

  it('muestra la barra 3/24, el arco actual del último control y el historial', async () => {
    mockedCases.mockResolvedValue([makeOrthoCase()]);
    mockedVisits.mockResolvedValue([makeOrthoVisit()]);
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={GAUGES} />);
    const bar = await screen.findByRole('progressbar', { name: 'Controles realizados' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '24');
    expect(screen.getByText(/3\/24 controles · Mes 3 de 24/)).toBeInTheDocument();
    expect(screen.getByText('Superior: Acero 0.016x0.022')).toBeInTheDocument();
    expect(screen.getByText('Inferior: NiTi 0.018')).toBeInTheDocument();
    const history = await screen.findByRole('list', { name: 'Historial de controles' });
    expect(within(history).getByText(/Control 3 ·/)).toBeInTheDocument();
    expect(within(history).getByText('Bracket despegado')).toBeInTheDocument();
    expect(within(history).getByText('Se recementa bracket del 22')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar control' })).toBeInTheDocument();
  });

  it('la adenda sale bajo el control con su autor; el control original no cambia', async () => {
    mockedCases.mockResolvedValue([makeOrthoCase()]);
    mockedVisits.mockResolvedValue([
      makeOrthoVisit({
        addenda: [
          {
            id: 'a1',
            reason: 'Pieza mal transcrita',
            text: 'El bracket es el del 12.',
            authorId: 'u-dentist',
            authorName: 'Dra. Rivas',
            createdAt: '2026-11-11T14:00:00.000Z',
          },
        ],
      }),
    ]);
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={GAUGES} />);
    expect(await screen.findByText('El bracket es el del 12.')).toBeInTheDocument();
    expect(screen.getByText(/Pieza mal transcrita · Dra. Rivas ·/)).toBeInTheDocument();
    expect(screen.getByText('Se recementa bracket del 22')).toBeInTheDocument();
  });

  it('sin caso: «Este paciente no tiene caso de ortodoncia · Crear caso»', async () => {
    mockedCases.mockResolvedValue([]);
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={GAUGES} />);
    expect(await screen.findByText('Este paciente no tiene caso de ortodoncia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear caso' })).toBeInTheDocument();
  });

  it('ASSISTANT lee el caso pero no ve «Registrar control» ni «Crear caso»', async () => {
    mockedCases.mockResolvedValue([makeOrthoCase()]);
    mockedVisits.mockResolvedValue([]);
    render(<OrthoTab token={ASSISTANT} patientId="p1" wireGauges={GAUGES} />);
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar control' })).not.toBeInTheDocument();
    mockedCases.mockResolvedValue([]);
  });

  it('error al cargar con «Reintentar», que vuelve a pedir el caso', async () => {
    mockedCases.mockRejectedValueOnce(new ApiError(500, 'Fallo')).mockResolvedValue([]);
    const user = setupUser();
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={GAUGES} />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Este paciente no tiene caso de ortodoncia')).toBeInTheDocument();
    expect(mockedCases).toHaveBeenCalledTimes(2);
  });

  it('desde la cita abre «Registrar control» con el arco anterior y envía la cita', async () => {
    mockedCases.mockResolvedValue([makeOrthoCase()]);
    mockedVisits.mockResolvedValue([]);
    mockedRegister.mockResolvedValue(makeOrthoVisit({ id: 'visit-4', visitNumber: 4 }));
    const consumed = jest.fn();
    const user = setupUser();
    render(
      <OrthoTab
        token={DENTIST}
        patientId="p1"
        wireGauges={GAUGES}
        visitAppointmentId="appt-9"
        onShortcutConsumed={consumed}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Registrar control' });
    expect(within(dialog).getByText(/Se registra en la cita de hoy/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Fecha del control')).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('combobox', { name: 'Calibre' })[0]).toHaveValue('0.016x0.022');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar control' }));
    await waitFor(() => expect(mockedRegister).toHaveBeenCalled());
    expect(mockedRegister.mock.calls[0][3]).toMatchObject({
      appointmentId: 'appt-9',
      upperWire: { material: 'STEEL', gauge: '0.016x0.022' },
      lowerWire: { material: 'NITI', gauge: '0.018' },
    });
    expect(mockedRegister.mock.calls[0][3]).not.toHaveProperty('entryDate');
    await waitFor(() => expect(consumed).toHaveBeenCalled());
  });
});
