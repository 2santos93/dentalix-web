import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { PatientFlowActions, usePatientFlow } from './patient-flow-actions';

jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  updateAppointment: jest.fn(),
}));

jest.mock('../../lib/appointments/checkout-checklist', () => ({
  ...jest.requireActual('../../lib/appointments/checkout-checklist'),
  getCheckoutChecklist: jest.fn(),
}));

const runner = { pendingId: null, run: jest.fn().mockResolvedValue(undefined) };

/**
 * DX-546 · FE-109: el paso del flujo de la tarjeta de columnas es un icono de
 * 28 px, y su área de toque la amplía un `::after` de 8 px por lado (44 px).
 * Las columnas son la vista por defecto desde 768 px (tabletas): esa
 * ampliación tiene que valer con cualquier puntero táctil, no solo por debajo
 * de 640 px (`max-sm:`). La medida real la hace e2e/patient-flow.spec.ts
 * (tableta táctil a 1024 px y teléfono a 390 px).
 */
describe('PatientFlowActions compacto: objetivo táctil (DX-546 · FE-109)', () => {
  function compactButton() {
    render(
      <PatientFlowActions
        compact
        appointmentId="a1"
        status="SCHEDULED"
        role="RECEPTION"
        isToday
        patientName="Ana Pérez"
        runner={runner}
      />,
    );
    return screen.getByRole('button', { name: 'Llegó: Ana Pérez' });
  }

  it('amplía el área de toque a 44 px con puntero táctil a cualquier ancho (28 px + 2 × 8 px)', () => {
    const classes = compactButton().className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        'relative',
        'size-7',
        'pointer-coarse:size-7',
        'pointer-coarse:after:absolute',
        'pointer-coarse:after:-inset-2',
        "pointer-coarse:after:content-['']",
      ]),
    );
  });

  it('y sigue ampliada en una ventana estrecha con ratón (max-sm), como antes', () => {
    expect(compactButton().className.split(/\s+/)).toEqual(
      expect.arrayContaining(['max-sm:after:absolute', 'max-sm:after:-inset-2', "max-sm:after:content-['']"]),
    );
  });
});

/**
 * DX-538-bis: con un modal abierto (el detalle de la cita, «En clínica») el
 * aviso flotante queda inerte y oculto al lector: el fallo de un paso se pinta
 * junto a sus botones, anunciado. Un rechazo (4xx) no ofrece «Reintentar».
 */
describe('usePatientFlow: el fallo de un paso con un modal abierto (DX-538-bis)', () => {
  const updateAppointment = jest.requireMock('../../lib/appointments/appointments-api')
    .updateAppointment as jest.Mock;

  function Harness() {
    const flow = usePatientFlow('tok', () => undefined);
    return (
      <PatientFlowActions
        appointmentId="a1"
        status="SCHEDULED"
        role="RECEPTION"
        isToday
        patientName="Ana Pérez"
        runner={flow}
      />
    );
  }

  function openModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('data-state', 'open');
    document.body.append(modal);
    return modal;
  }

  afterEach(() => updateAppointment.mockReset());

  it('un 409 se anuncia junto al paso y sin «Reintentar»', async () => {
    updateAppointment.mockRejectedValue(new ApiError(409, 'La cita ya cambió de estado.', {}));
    const modal = openModal();
    try {
      render(<Harness />);
      await userEvent.click(screen.getByRole('button', { name: 'Llegó' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('La cita ya cambió de estado.');
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    } finally {
      modal.remove();
    }
  });

  it('un fallo del servidor ofrece «Reintentar», que repite el paso', async () => {
    updateAppointment
      .mockRejectedValueOnce(new ApiError(503, 'Servicio no disponible', {}))
      .mockResolvedValue({ planItemsReservedElsewhere: [] });
    const modal = openModal();
    try {
      render(<Harness />);
      await userEvent.click(screen.getByRole('button', { name: 'Llegó' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
      expect(updateAppointment).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    } finally {
      modal.remove();
    }
  });
});
