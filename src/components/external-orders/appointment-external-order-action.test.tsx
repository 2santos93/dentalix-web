import { render, screen } from '@testing-library/react';
import { AppointmentExternalOrderAction } from './appointment-external-order-action';
import { listExternalOrderTemplates, listRecipientSuggestions } from '@/lib/external-orders/external-orders-api';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';

jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  listExternalOrderTemplates: jest.fn(),
  listRecipientSuggestions: jest.fn(),
}));

const appointment = { id: 'appt1', patientId: 'p1', status: 'CONFIRMED' };

describe('AppointmentExternalOrderAction (DX-572)', () => {
  beforeEach(() => {
    jest.mocked(listExternalOrderTemplates).mockResolvedValue([]);
    jest.mocked(listRecipientSuggestions).mockResolvedValue([]);
  });

  it.each(['RECEPTION', 'ASSISTANT'])('%s no la ve', (role) => {
    render(<AppointmentExternalOrderAction token={tokenFor(role)} appointment={appointment} />);
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).not.toBeInTheDocument();
  });

  it.each(['CANCELLED', 'NO_SHOW'])('no se ofrece en una cita %s', (status) => {
    render(<AppointmentExternalOrderAction token={tokenFor('DENTIST')} appointment={{ ...appointment, status }} />);
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).not.toBeInTheDocument();
  });

  it('el odontólogo abre el modal con la cita puesta', async () => {
    const user = setupUser();
    render(<AppointmentExternalOrderAction token={tokenFor('DENTIST')} appointment={appointment} />);
    await user.click(screen.getByRole('button', { name: 'Nueva orden' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva orden' });
    expect(dialog).toHaveTextContent('Se emite desde esta cita y queda en su sede.');
  });
});
