import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientAgreementSection } from './patient-agreement-section';
import { listAgreements } from '@/lib/agreements/agreements-api';
import { listCoverages } from '@/lib/patients/coverages-api';
import {
  assignPatientAgreement,
  getPatientAgreement,
  removePatientAgreement,
} from '@/lib/patients/patient-agreement-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { agreementDto, patientAgreement } from './agreement-fixtures';

jest.mock('../../lib/agreements/agreements-api', () => ({
  ...jest.requireActual('../../lib/agreements/agreements-api'),
  listAgreements: jest.fn(),
}));
jest.mock('../../lib/patients/coverages-api', () => ({
  ...jest.requireActual('../../lib/patients/coverages-api'),
  listCoverages: jest.fn(),
}));
jest.mock('../../lib/patients/patient-agreement-api', () => ({
  ...jest.requireActual('../../lib/patients/patient-agreement-api'),
  getPatientAgreement: jest.fn(),
  assignPatientAgreement: jest.fn(),
  removePatientAgreement: jest.fn(),
}));

const mockedGet = getPatientAgreement as jest.MockedFunction<typeof getPatientAgreement>;
const mockedAssign = assignPatientAgreement as jest.MockedFunction<typeof assignPatientAgreement>;
const mockedRemove = removePatientAgreement as jest.MockedFunction<typeof removePatientAgreement>;
const mockedAgreements = listAgreements as jest.MockedFunction<typeof listAgreements>;
const mockedCoverages = listCoverages as jest.MockedFunction<typeof listCoverages>;

const sanitas = { id: 'pay-1', name: 'Sanitas' };
const renderSection = (onChanged?: () => void) =>
  render(<PatientAgreementSection token="tok" patientId="p1" onChanged={onChanged} />);

describe('PatientAgreementSection (DX-105)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedAgreements.mockResolvedValue([agreementDto('ag1', 'Sanitas 2026', sanitas)]);
    mockedCoverages.mockResolvedValue([]);
  });

  it('carga: esqueleto accesible y título «Convenio»', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    renderSection();
    expect(screen.getByRole('status', { name: 'Cargando convenio' })).toBeInTheDocument();
    expect(screen.getByTestId('patient-agreement')).toBe(
      screen.getByRole('heading', { name: 'Convenio' }).closest('section'),
    );
  });

  it('vacío: explica para qué sirve y ofrece «Asignar convenio»', async () => {
    mockedGet.mockResolvedValue({ current: null, history: [] });
    renderSection();
    expect(await screen.findByText('Sin convenio asignado')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Asigna el convenio de la empresa o aseguradora para que el presupuesto salga con el precio pactado.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asignar convenio' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1', { includeHistory: true });
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce({ current: null, history: [] });
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin convenio asignado')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('asignado: nombre, pagador, tipo, vigencia e insignia «Vigente»', async () => {
    mockedGet.mockResolvedValue({ current: patientAgreement(), history: [] });
    renderSection();
    const card = await screen.findByTestId('agreement-current');
    expect(within(card).getByText('Sanitas 2026')).toBeInTheDocument();
    expect(within(card).getByText('Sanitas')).toBeInTheDocument();
    expect(within(card).getByText('Descuento porcentual')).toBeInTheDocument();
    expect(within(card).getByText('Vigente hasta 31/01/2027')).toBeInTheDocument();
    expect(within(card).getByText('Vigente')).toBeInTheDocument();
    expect(screen.queryByTestId('agreement-history')).not.toBeInTheDocument();
  });

  it.each([
    ['EXPIRED', 'Vencido'],
    ['NOT_STARTED', 'Pendiente de inicio'],
    ['INACTIVE', 'Convenio inactivo'],
  ] as const)('insignia %s → «%s»', async (status, label) => {
    mockedGet.mockResolvedValue({ current: patientAgreement({ status }), history: [] });
    renderSection();
    const card = await screen.findByTestId('agreement-current');
    expect(within(card).getByText(label)).toBeInTheDocument();
  });

  it('historial plegable con los retirados', async () => {
    mockedGet.mockResolvedValue({
      current: patientAgreement(),
      history: [
        patientAgreement({
          id: 'pa0',
          validFrom: '2025-01-01',
          validTo: '2025-12-31',
          retiredAt: '2026-01-15T12:00:00.000Z',
          agreement: { ...patientAgreement().agreement, id: 'ag0', name: 'Convenio viejo' },
        }),
      ],
    });
    renderSection();
    const history = await screen.findByTestId('agreement-history');
    expect(within(history).getByText('Historial (1)')).toBeInTheDocument();
    expect(history.tagName).toBe('DETAILS');
    expect(history).toHaveTextContent('Convenio viejo · Sanitas');
    expect(history).toHaveTextContent('01/01/2025 – 31/12/2025');
    expect(history).toHaveTextContent('Retirado el 15/01/2026');
  });

  it('asigna un convenio, avisa y notifica a la ficha', async () => {
    mockedGet.mockResolvedValueOnce({ current: null, history: [] });
    mockedGet.mockResolvedValueOnce({ current: patientAgreement(), history: [] });
    mockedAssign.mockResolvedValue(patientAgreement());
    const onChanged = jest.fn();
    renderSection(onChanged);
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: 'Asignar convenio' }));
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));

    await waitFor(() => expect(mockedAssign).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Convenio guardado.')).toBeInTheDocument();
    expect(await screen.findByTestId('agreement-current')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('quita con confirmación, notifica y devuelve el foco a «Asignar convenio»', async () => {
    mockedGet.mockResolvedValueOnce({ current: patientAgreement(), history: [] });
    mockedGet.mockResolvedValueOnce({ current: null, history: [] });
    mockedRemove.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    renderSection(onChanged);
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: 'Quitar el convenio Sanitas 2026' }));
    const confirm = await screen.findByRole('dialog');
    expect(mockedRemove).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Quitar' }));

    await waitFor(() => expect(mockedRemove).toHaveBeenCalledWith('tok', 'p1'));
    expect(await screen.findByText('Convenio quitado.')).toBeInTheDocument();
    expect(await screen.findByText('Sin convenio asignado')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Asignar convenio' })).toHaveFocus(),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('si quitar falla, el diálogo sigue abierto con el error y no notifica', async () => {
    mockedGet.mockResolvedValue({ current: patientAgreement(), history: [] });
    mockedRemove.mockRejectedValue(new ApiError(500, 'boom'));
    const onChanged = jest.fn();
    renderSection(onChanged);
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: 'Quitar el convenio Sanitas 2026' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
