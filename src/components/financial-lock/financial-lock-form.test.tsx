import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { FinancialLockForm, financialLockCopy } from './financial-lock-form';
import {
  getFinancialLock,
  updateFinancialLock,
  type FinancialLockSettings,
} from '@/lib/financial-lock/financial-lock-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { ApiError } from '@/lib/api/api-error';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/financial-lock/financial-lock-api', () => ({
  ...jest.requireActual('../../lib/financial-lock/financial-lock-api'),
  getFinancialLock: jest.fn(),
  updateFinancialLock: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
const mockedGet = jest.mocked(getFinancialLock);
const mockedSave = jest.mocked(updateFinancialLock);
const copy = financialLockCopy;

const NONE: FinancialLockSettings = {
  lockDate: null,
  lockDays: null,
  adminExempt: false,
  lockedThrough: null,
  overrides: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listLocations).mockResolvedValue([clinicLocation()]);
});

describe('Ajustes › Caja › Cierre contable (DX-091)', () => {
  it('sin cierre lo dice, y explica fecha, días y exención', async () => {
    mockedGet.mockResolvedValue(NONE);
    render(<FinancialLockForm token="tok" />);
    expect(await screen.findByText(copy.notLocked)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.daysLabel)).toHaveAccessibleDescription(/Con 7, se puede registrar o anular/);
    expect(screen.getByText(copy.overridesEmpty)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: copy.exemptLabel })).not.toBeChecked();
  });

  it('guardar manda los días y la exención; muestra el cierre vigente', async () => {
    mockedGet.mockResolvedValue(NONE);
    mockedSave.mockResolvedValue({ ...NONE, lockDays: 7, adminExempt: true, lockedThrough: '2026-11-08' });
    const user = userEvent.setup();
    render(<FinancialLockForm token="tok" />);
    await user.type(await screen.findByLabelText(copy.daysLabel), '7');
    await user.click(screen.getByRole('switch', { name: copy.exemptLabel }));
    await user.click(screen.getByRole('button', { name: copy.saveAria }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { lockDate: null, lockDays: 7, adminExempt: true }),
    );
    expect(await screen.findByText(copy.lockedThrough('08/11/2026'))).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(copy.saved);
  });

  it('unos días que no valen se dicen junto al campo, sin llamar a la API', async () => {
    mockedGet.mockResolvedValue(NONE);
    const user = userEvent.setup();
    render(<FinancialLockForm token="tok" />);
    await user.type(await screen.findByLabelText(copy.daysLabel), '400');
    await user.click(screen.getByRole('button', { name: copy.saveAria }));
    expect(await screen.findByText(copy.daysInvalid)).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('el 400 de la API (fecha no anterior a hoy) se enseña en español', async () => {
    mockedGet.mockResolvedValue({ ...NONE, lockDate: '2026-09-30', lockedThrough: '2026-09-30' });
    const message = 'La fecha de cierre tiene que ser anterior a hoy en la sede: hoy sigue abierto.';
    mockedSave.mockRejectedValue(new ApiError(400, message));
    const user = userEvent.setup();
    render(<FinancialLockForm token="tok" />);
    await user.type(await screen.findByLabelText(copy.daysLabel), '3');
    await user.click(screen.getByRole('button', { name: copy.saveAria }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('lista las excepciones: cuándo, quién, qué, el día cerrado y el motivo', async () => {
    mockedGet.mockResolvedValue({
      ...NONE,
      lockDate: '2026-09-30',
      adminExempt: true,
      lockedThrough: '2026-09-30',
      overrides: [
        {
          id: 'o-1',
          createdAt: '2026-10-05T15:30:00.000Z',
          operation: 'PAYMENT_VOID',
          businessDate: '2026-09-20',
          lockedThrough: '2026-09-30',
          reason: 'Duplicado confirmado con el banco',
          actor: { userId: 'u-1', name: 'Dra. Ana Pérez' },
          paymentId: 'p-1',
          paymentPlanId: null,
          location: { id: 'l-1', name: 'Sede Chacao' },
        },
      ],
    });
    render(<FinancialLockForm token="tok" />);
    const table = await screen.findByRole('table', { name: copy.overridesLabel });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Dra. Ana Pérez');
    expect(row).toHaveTextContent(copy.operations.PAYMENT_VOID);
    expect(row).toHaveTextContent('20/09/2026');
    expect(row).toHaveTextContent('Duplicado confirmado con el banco');
  });
});
