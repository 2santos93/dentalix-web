import { EMPTY_CLINIC_FISCAL } from '@/lib/clinic/clinic-settings-api';
import { clearSessionStore } from '@/lib/session/session-store';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { FamilyAccountStatementSection } from './family-account-statement-section';
import { FamilyAccountStatementDocument } from './family-account-statement-document';
import {
  getFamilyAccountStatement,
  type FamilyAccountStatement,
} from '@/lib/account-statement/account-statement-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { clinicLocation } from '@/lib/test/locations';
import { listLocations } from '@/lib/locations/locations-api';
import { FORMAT_DE, FORMAT_ES, FORMAT_US, REGIONAL_VE } from '@/lib/test/document-regional';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

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
  convertedPaid: paid,
  convertedBalance: Math.round((budgeted - paid) * 100) / 100,
  overdueAmount: 0,
});

const family: FamilyAccountStatement = {
  rateProviderTimedOut: false,
  paymentsWithoutRateCount: 0,
  issuedAt: '2026-10-17T15:00:00.000Z',
  regional: REGIONAL_VE,
  clinic: { name: 'Clínica Sonrisas', logoUrl: null, fiscal: EMPTY_CLINIC_FISCAL },
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
      summary: [amounts('USD', 350000.35, 100000.25)],
    },
    {
      patient: { id: 'daughter', firstName: 'Lucía', lastName: 'Gil' },
      relationship: 'MOTHER',
      self: false,
      summary: [amounts('USD', 1200000.2, 450000.05)],
    },
  ],
  totals: [amounts('USD', 1550000.55, 550000.3)],
};

describe('Estado de cuenta familiar (DX-203)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ locale: 'es-VE' })]);
  });

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
    // DX-522: el importe lleva el código ISO y el formato de la sede.
    await waitFor(() => expect(screen.getByTestId('family-total').textContent).toMatch(/USD\s1\.000\.000,25/));
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
    render(<FamilyAccountStatementDocument statement={family} format={FORMAT_ES} />);
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
    render(<FamilyAccountStatementDocument statement={family} format={FORMAT_ES} />);
    expect(screen.getByRole('heading', { name: 'Estado de cuenta familiar' })).toBeInTheDocument();
    expect(screen.getAllByTestId('family-member-row')).toHaveLength(3);
    expect(screen.getByTestId('family-total').textContent).toMatch(/1\.550\.000,55/);
  });

  it('DX-262 (M1): con saldo migrado, la pantalla y el documento explican que el saldo lo incluye', async () => {
    const withOpening = {
      ...family,
      totals: [{ ...amounts('USD', 1550000.55, 550000.3), openingBalance: 50000, openingPending: 50000 }],
    };
    mockedGet.mockResolvedValue(withOpening);
    render(<FamilyAccountStatementSection token="tok" patientId="mother" />);
    expect(await screen.findByText('El saldo incluye el saldo migrado del programa anterior.')).toBeInTheDocument();
    cleanup();
    clearSessionStore(); // FE-031: la caché de sesión no pasa a la vista siguiente
    render(<FamilyAccountStatementDocument statement={withOpening} format={FORMAT_ES} />);
    expect(screen.getByText('El saldo incluye el saldo migrado del programa anterior.')).toBeInTheDocument();
  });

  it('DX-472: los abonos sin tasa se avisan en pantalla y en el impreso', async () => {
    mockedGet.mockResolvedValue({ ...family, paymentsWithoutRateCount: 2 });
    render(<FamilyAccountStatementSection token="tok" patientId="mother" />);
    const text = 'Cifras incompletas: 2 abonos sin tasa de cambio no cuentan en el saldo.';
    expect(await screen.findByText(text)).toBeInTheDocument();

    cleanup();

    clearSessionStore(); // FE-031: la caché de sesión no pasa a la vista siguiente
    render(<FamilyAccountStatementDocument statement={{ ...family, paymentsWithoutRateCount: 2 }} format={FORMAT_ES} />);
    expect(screen.getByTestId('family-without-rate')).toHaveTextContent(text);
  });

  it('DX-354 A: sede h12 en-US, la hora de la emisión en 12 h y el total con código', () => {
    render(
      <FamilyAccountStatementDocument
        statement={{ ...family, issuedAt: '2027-05-03T19:05:00.000Z' }}
        format={FORMAT_US}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Estado de cuenta familiar' }).closest('header')).toHaveTextContent(
      '05/03/2027 3:05 p. m.',
    );
    expect(screen.getByTestId('family-total').textContent).toMatch(/USD.1,550,000\.55/);
  });

  it('DX-354 B: sede h23 de-DE, 24 h y el importe con código', () => {
    render(
      <FamilyAccountStatementDocument
        statement={{ ...family, issuedAt: '2027-05-03T19:05:00.000Z' }}
        format={FORMAT_DE}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Estado de cuenta familiar' }).closest('header')).toHaveTextContent(
      '03.05.2027 21:05',
    );
    expect(screen.getByTestId('family-total').textContent).toMatch(/1\.550\.000,55.USD/);
  });

  it('DX-354 C: sin formato de sede, «—» en la emisión y en los importes', () => {
    const { container } = render(<FamilyAccountStatementDocument statement={family} format={null} />);
    expect(screen.getByRole('heading', { name: 'Estado de cuenta familiar' }).closest('header')).toHaveTextContent(/emisión\s*—/i);
    expect(screen.getByTestId('family-total')).toHaveTextContent('—');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(text).not.toMatch(/\d[.,]\d{2}/);
    expect(text).not.toContain('US$');
  });
});
