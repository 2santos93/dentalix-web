import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { listLocations } from '@/lib/locations/locations-api';
import { caracasSede } from '@/lib/test/sede-clock';
import {
  AffectedAppointmentsDialog,
  affectedCopy,
  affectedFromError,
  SCHEDULE_AFFECTS_APPOINTMENTS,
  type AffectedAppointments,
} from './affected-appointments-dialog';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const affected: AffectedAppointments = {
  total: 3,
  sample: [
    { id: 'a1', locationId: 'loc', start: '2030-07-05T14:00:00.000Z', end: '2030-07-05T14:30:00.000Z', patientName: 'Ana Pérez' },
  ],
};

describe('AffectedAppointmentsDialog (DX-267)', () => {
  it('lista las citas, dice cuántas más hay y confirma o vuelve sin guardar', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    jest.mocked(listLocations).mockResolvedValue([caracasSede({ id: 'loc' })]);
    render(
      <AffectedAppointmentsDialog
        token="tok"
        affected={affected}
        confirming={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(affectedCopy.title(3))).toBeInTheDocument();
    expect(screen.getByTestId('affected-appointments')).toHaveTextContent('Ana Pérez');
    // En la hora de su sede (Caracas, UTC−4), no en la del navegador.
    expect(await screen.findByText(/10:00/)).toBeInTheDocument();
    expect(screen.getByText(affectedCopy.more(2))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: affectedCopy.cancel }));
    expect(onCancel).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: affectedCopy.confirm }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('solo reconoce el 409 de citas afectadas', () => {
    const err = new ApiError(409, 'x', { code: SCHEDULE_AFFECTS_APPOINTMENTS, affectedAppointments: affected });
    expect(affectedFromError(err)).toEqual(affected);
    expect(affectedFromError(new ApiError(409, 'x', { code: 'OTRO' }))).toBeNull();
    expect(affectedFromError(new Error('x'))).toBeNull();
  });
});
