import { render, screen, waitFor } from '@testing-library/react';
import { DescriptionList } from '@/components/ui/description-list';
import { getAppointmentType, type AppointmentType } from '@/lib/appointments/appointment-types-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import {
  AppointmentPreVisitInstructions,
  useAppointmentTypeInstructions,
} from './appointment-pre-visit-instructions';

jest.mock('../../lib/appointments/appointment-types-api', () => ({
  getAppointmentType: jest.fn(),
}));
const mockedGet = getAppointmentType as jest.MockedFunction<typeof getAppointmentType>;

const retiredType: AppointmentType = {
  id: 'type-r',
  tenantId: 't1',
  name: 'Cirugía (retirado)',
  durationMinutes: 30,
  color: '#7C3AED',
  active: false,
  isUrgent: false,
  preVisitInstructions: [
    { language: 'en', text: 'Come fasting.' },
    { language: 'es', text: 'Ven en ayunas.' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function Harness({ typeId }: { typeId: string | null }) {
  const { state, retry } = useAppointmentTypeInstructions('tok', typeId);
  return (
    <DescriptionList columns={1} layout="inline">
      {typeId ? <AppointmentPreVisitInstructions state={state} onRetry={retry} /> : null}
    </DescriptionList>
  );
}

describe('AppointmentPreVisitInstructions (DX-564)', () => {
  beforeEach(() => mockedGet.mockReset());

  it('pide el tipo de la cita por id (también uno retirado) y enseña sus variantes, español primero', async () => {
    mockedGet.mockResolvedValue(retiredType);
    render(<Harness typeId="type-r" />);
    const row = await screen.findByTestId('appointment-pre-visit-instructions');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'type-r');
    const languages = Array.from(row.querySelectorAll('li > span:first-child')).map((n) => n.textContent);
    expect(languages).toEqual(['Español (es)', 'English (en)']);
  });

  it('una vez por tipo: volver a abrir la misma cita no lo vuelve a pedir', async () => {
    mockedGet.mockResolvedValue(retiredType);
    const { rerender } = render(<Harness typeId="type-r" />);
    await screen.findByTestId('appointment-pre-visit-instructions');
    rerender(<Harness typeId={null} />);
    rerender(<Harness typeId="type-r" />);
    expect(screen.getByTestId('appointment-pre-visit-instructions')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('404: no hay fila', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Not found'));
    render(<Harness typeId="type-x" />);
    await waitFor(() => expect(screen.queryByText('Indicaciones previas')).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('un fallo deja «No se cargaron» con Reintentar, que vuelve a pedirlo', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Caído')).mockResolvedValueOnce(retiredType);
    render(<Harness typeId="type-r" />);
    expect(await screen.findByText('No se cargaron')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByTestId('appointment-pre-visit-instructions')).toHaveTextContent('Ven en ayunas.');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
