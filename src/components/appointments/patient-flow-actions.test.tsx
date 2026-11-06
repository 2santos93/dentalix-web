import { render, screen } from '@testing-library/react';
import { PatientFlowActions } from './patient-flow-actions';

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
