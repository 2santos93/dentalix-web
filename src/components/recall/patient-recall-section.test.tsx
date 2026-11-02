import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import {
  createRecallContact,
  getPatientRecalls,
  setPatientRecall,
  type PatientRecall,
  type PatientRecalls,
} from '@/lib/recall/recall-api';
import { PatientRecallSection } from './patient-recall-section';

jest.mock('../../lib/recall/recall-api', () => ({
  getPatientRecalls: jest.fn(),
  setPatientRecall: jest.fn(),
  createRecallContact: jest.fn(),
}));
const mockedGet = getPatientRecalls as jest.MockedFunction<typeof getPatientRecalls>;
const mockedSet = setPatientRecall as jest.MockedFunction<typeof setPatientRecall>;
const mockedContact = createRecallContact as jest.MockedFunction<typeof createRecallContact>;

const patient = { id: 'pat-1', fullName: 'Ana Pérez' };
const recall: PatientRecall = {
  id: 'r1',
  kind: 'CHECKUP',
  intervalMonths: 6,
  lastDoneAt: '2026-04-10',
  active: true,
  disabledUntil: null,
  disabledReason: null,
  locationId: 'l1',
  baseDate: '2026-04-10',
  dueAt: '2026-10-10',
  daysOverdue: 22,
  status: 'DUE',
  updatedAt: '2026-04-10T12:00:00.000Z',
  updatedBy: { id: 'u1', fullName: 'Dra. Ruiz' },
};
const data: PatientRecalls = {
  recalls: [recall],
  contacts: [
    {
      id: 'c1',
      recallId: 'r1',
      kind: 'CHECKUP',
      patientId: 'pat-1',
      locationId: null,
      channel: 'CALL',
      outcome: 'NO_ANSWER',
      note: 'Volver a llamar',
      appointmentId: null,
      author: { id: 'u2', fullName: 'Rita' },
      createdAt: '2026-10-20T15:00:00.000Z',
    },
  ],
};

describe('PatientRecallSection (DX-015)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSet.mockReset();
    mockedContact.mockReset();
  });

  it('un renglón por tipo con estado y vencimiento, y el historial de contactos', async () => {
    mockedGet.mockResolvedValue(data);
    render(<PatientRecallSection token="tok" patient={patient} canSet={false} canContact={false} />);
    const row = await screen.findByTestId('recall-row-CHECKUP');
    expect(within(row).getByText('Por llamar')).toBeInTheDocument();
    expect(within(row).getByText(/Cada 6 meses · Vence el/)).toBeInTheDocument();
    expect(within(screen.getByTestId('recall-row-HYGIENE')).getByText('Sin recall')).toBeInTheDocument();
    expect(within(screen.getByTestId('recall-contact-row')).getByText('Control · Llamada · No contesta')).toBeInTheDocument();
    // Solo lectura: sin acciones.
    expect(screen.queryByRole('button', { name: /Fijar|Cambiar|Registrar/ })).not.toBeInTheDocument();
  });

  it('error con «Reintentar»', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(data);
    render(<PatientRecallSection token="tok" patient={patient} canSet canContact />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('recall-contact-row')).toBeInTheDocument();
  });

  it('el clínico fija «cada 3 meses»; al cambiarlo conserva la fecha del último control', async () => {
    mockedGet.mockResolvedValue(data);
    mockedSet.mockResolvedValue(data);
    render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar recall de control' }));
    await userEvent.selectOptions(await screen.findByLabelText('Intervalo'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar recall' }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith('tok', 'pat-1', 'CHECKUP', {
        intervalMonths: 3,
        lastDoneAt: '2026-04-10',
        active: true,
        disabledUntil: null,
        disabledReason: null,
      }),
    );
    expect(await screen.findByText('Recall guardado.')).toBeInTheDocument();
  });

  it('el mostrador registra un contacto y exige canal y resultado', async () => {
    mockedGet.mockResolvedValue(data);
    mockedContact.mockResolvedValue(data.contacts[0]);
    render(<PatientRecallSection token="tok" patient={patient} canSet={false} canContact />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar contacto de control' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar contacto' }));
    expect(await screen.findByText('Elige el canal del contacto.')).toBeInTheDocument();
    expect(mockedContact).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Canal'), 'CALL');
    await userEvent.selectOptions(screen.getByLabelText('Resultado'), 'NO_ANSWER');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto' }));
    await waitFor(() => expect(mockedContact).toHaveBeenCalledWith('tok', 'r1', { channel: 'CALL', outcome: 'NO_ANSWER' }));
  });
});
