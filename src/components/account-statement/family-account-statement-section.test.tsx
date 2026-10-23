import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { FamilyAccountStatementSection } from './family-account-statement-section';
import { FamilyAccountStatementDocument } from './family-account-statement-document';
import {
  getFamilyAccountStatement,
  type FamilyAccountStatement,
} from '@/lib/account-statement/account-statement-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/account-statement/account-statement-api', () => ({
  ...jest.requireActual('../../lib/account-statement/account-statement-api'),
  getFamilyAccountStatement: jest.fn(),
}));
const mockedGet = getFamilyAccountStatement as jest.MockedFunction<typeof getFamilyAccountStatement>;

const amounts = (currency: string, budgeted: number, paid: number) => ({
  currency,
  budgeted,
  openingBalance: 0,
  openingPending: 0,
  paid,
  balance: Math.round((budgeted - paid) * 100) / 100,
  overdueAmount: 0,
});

const family: FamilyAccountStatement = {
  issuedAt: '2026-10-17T15:00:00.000Z',
  clinic: { name: 'Clínica Sonrisas', logoUrl: null },
  payer: { id: 'mother', firstName: 'Marta', lastName: 'Gil' },
  members: [
    {
      patient: { id: 'mother', firstName: 'Marta', lastName: 'Gil' },
      relationship: null,
      self: true,
      summary: [],
    },
    {
      patient: { id: 'son', firstName: 'Iván', lastName: 'Gil' },
      relationship: 'MOTHER',
      self: false,
      summary: [amounts('COP', 350000.35, 100000.25)],
    },
    {
      patient: { id: 'daughter', firstName: 'Lucía', lastName: 'Gil' },
      relationship: 'MOTHER',
      self: false,
      summary: [amounts('COP', 1200000.2, 450000.05)],
    },
  ],
  totals: [amounts('COP', 1550000.55, 550000.3)],
};

describe('Estado de cuenta familiar (DX-203)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('lista a cada paciente con su saldo y el total', async () => {
    mockedGet.mockResolvedValue(family);
    render(<FamilyAccountStatementSection token="tok" patientId="mother" />);
    const members = await screen.findAllByTestId('family-member');
    expect(members.map((m) => m.textContent)).toEqual([
      expect.stringContaining('Marta Gil · Titular'),
      expect.stringContaining('Iván Gil · Pagador: madre'),
      expect.stringContaining('Lucía Gil · Pagador: madre'),
    ]);
    expect(within(members[0]).getByText('Sin saldos')).toBeInTheDocument();
    expect(screen.getByTestId('family-total').textContent).toMatch(/1\.000\.000,25/);
    expect(screen.getByRole('link', { name: /Imprimir estado familiar/ })).toHaveAttribute(
      'href',
      '/print/patients/mother/family-account-statement',
    );
  });

  it('mientras carga no afirma que el paciente sea pagador de nadie', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(<FamilyAccountStatementSection token="tok" patientId="mother" />);
    expect(screen.queryByText(/pagador principal de otros pacientes/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Estado de cuenta familiar' })).not.toBeInTheDocument();
  });

  it('el documento nombra el parentesco del pagador, no el del dependiente', () => {
    render(<FamilyAccountStatementDocument statement={family} />);
    const rows = screen.getAllByTestId('family-member-row');
    expect(rows[1].textContent).toContain('Pagador: madre');
  });

  it('sin dependientes no se muestra', async () => {
    mockedGet.mockResolvedValue({
      ...family,
      members: family.members.slice(0, 1),
      totals: [],
    });
    const { container } = render(<FamilyAccountStatementSection token="tok" patientId="mother" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mockedGet).toHaveBeenCalledWith('tok', 'mother');
  });

  it('error con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(family);
    render(<FamilyAccountStatementSection token="tok" patientId="mother" />);
    await setupUser().click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findAllByTestId('family-member')).toHaveLength(3);
  });

  it('el documento imprimible: solo nombres e importes, subtotal por paciente y total', () => {
    render(<FamilyAccountStatementDocument statement={family} />);
    expect(screen.getByRole('heading', { name: 'Estado de cuenta familiar' })).toBeInTheDocument();
    expect(screen.getAllByTestId('family-member-row')).toHaveLength(3);
    expect(screen.getByTestId('family-total').textContent).toMatch(/1\.550\.000,55/);
  });

  it('DX-262 (M1): con saldo migrado, la pantalla y el documento explican que el saldo lo incluye', async () => {
    const withOpening = {
      ...family,
      totals: [{ ...amounts('COP', 1550000.55, 550000.3), openingBalance: 50000, openingPending: 50000 }],
    };
    mockedGet.mockResolvedValue(withOpening);
    render(<FamilyAccountStatementSection token="tok" patientId="mother" />);
    expect(await screen.findByText('El saldo incluye el saldo migrado del programa anterior.')).toBeInTheDocument();
    cleanup();
    render(<FamilyAccountStatementDocument statement={withOpening} />);
    expect(screen.getByText('El saldo incluye el saldo migrado del programa anterior.')).toBeInTheDocument();
  });
});
