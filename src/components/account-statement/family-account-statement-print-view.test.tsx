import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FamilyAccountStatementPrintView } from './family-account-statement-print-view';
import {
  getFamilyAccountStatement,
  type FamilyAccountStatement,
} from '@/lib/account-statement/account-statement-api';
import { EMPTY_CLINIC_FISCAL } from '@/lib/clinic/clinic-settings-api';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { REGIONAL_US } from '@/lib/test/document-regional';

jest.mock('../../lib/account-statement/account-statement-api', () => ({
  ...jest.requireActual('../../lib/account-statement/account-statement-api'),
  getFamilyAccountStatement: jest.fn(),
}));
const mockedGet = getFamilyAccountStatement as jest.MockedFunction<typeof getFamilyAccountStatement>;

function family(overrides: Partial<FamilyAccountStatement> = {}): FamilyAccountStatement {
  return {
    rateProviderTimedOut: false,
    paymentsWithoutRateCount: 0,
    issuedAt: '2026-10-17T15:00:00.000Z',
    regional: REGIONAL_US,
    clinic: { name: 'Clínica Sonrisas', logoUrl: null, fiscal: EMPTY_CLINIC_FISCAL },
    payer: { id: 'mother', firstName: 'Marta', lastName: 'Gil' },
    members: [],
    totals: [],
    ...overrides,
  } as FamilyAccountStatement;
}

describe('FamilyAccountStatementPrintView (DX-354)', () => {
  let print: jest.SpyInstance;
  beforeEach(() => {
    mockedGet.mockReset();
    print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
  });
  afterEach(() => print.mockRestore());

  it('con la sede del estado de cuenta: la emisión en su reloj y abre la impresión una vez', async () => {
    mockedGet.mockResolvedValue(family());
    render(<FamilyAccountStatementPrintView token="tok" patientId="mother" />);
    // 15:00 UTC es 11:00 a. m. en Nueva York.
    expect(await screen.findByText('10/17/2026 11:00 a. m.')).toBeInTheDocument();
    expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('sin región: «—», el aviso fuera del papel, sin imprimir solo; Reintentar lo relee e imprime', async () => {
    mockedGet.mockResolvedValueOnce(family({ regional: null }));
    mockedGet.mockResolvedValueOnce(family());
    render(<FamilyAccountStatementPrintView token="tok" patientId="mother" />);
    const note = (await screen.findByText(SEDE_LOCALE_ERROR)).closest('[role="status"]');
    expect(note?.closest('.print\\:hidden')).not.toBeNull();
    expect(screen.getByRole('button', { name: /imprimir/i })).toBeDisabled();
    expect(print).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('10/17/2026 11:00 a. m.')).toBeInTheDocument();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });
});
