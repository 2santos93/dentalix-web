import { render, screen, within } from '@testing-library/react';
import { AppointmentCertificateAction } from './appointment-certificate-action';
import { listCertificateAppointments } from '@/lib/certificates/certificates-api';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';
import { makeEligibleAppointment } from '@/lib/test/certificates';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1' })]),
}));
jest.mock('../../lib/certificates/certificates-api', () => ({
  ...jest.requireActual('../../lib/certificates/certificates-api'),
  listCertificateAppointments: jest.fn(),
}));
const mockedAppointments = listCertificateAppointments as jest.MockedFunction<typeof listCertificateAppointments>;

const RECEPTION = tokenFor('RECEPTION', 'u-rec');

describe('AppointmentCertificateAction (DX-306)', () => {
  beforeEach(() => {
    mockedAppointments.mockReset();
    clearSessionStore();
  });

  it.each(['SCHEDULED', 'CONFIRMED', 'IN_CHAIR', 'CANCELLED', 'NO_SHOW'])('una cita %s no ofrece el justificante', (status) => {
    render(<AppointmentCertificateAction token={RECEPTION} appointment={{ id: 'a2', patientId: 'p1', status }} />);
    expect(screen.queryByRole('button', { name: 'Emitir justificante' })).not.toBeInTheDocument();
  });

  it('una cita atendida abre el modal con ESA cita elegida (también para recepción)', async () => {
    const user = setupUser();
    mockedAppointments.mockResolvedValue([
      makeEligibleAppointment({ id: 'a1' }),
      makeEligibleAppointment({ id: 'a2', start: '2026-11-10T14:00:00.000Z' }),
    ]);
    render(<AppointmentCertificateAction token={RECEPTION} appointment={{ id: 'a2', patientId: 'p1', status: 'COMPLETED' }} />);
    await user.click(screen.getByRole('button', { name: 'Emitir justificante' }));
    const dialog = await screen.findByRole('dialog', { name: 'Emitir justificante' });
    expect(mockedAppointments).toHaveBeenCalledWith(RECEPTION, 'p1');
    const radios = within(await within(dialog).findByRole('radiogroup', { name: 'Cita atendida' })).getAllByRole('radio');
    expect(radios[1]).toBeChecked();
    expect(radios[0]).not.toBeChecked();
  });
});
