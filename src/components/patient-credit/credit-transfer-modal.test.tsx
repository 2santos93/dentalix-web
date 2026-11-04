import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditTransferModal } from './credit-transfer-modal';
import type { CreditSource } from './credit-balance';
import { accountStatementFixture } from '@/lib/test/account-statement';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { moneyWithCode } from '@/lib/format/sede-number';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/patient-credit/patient-credit-api', () => ({
  ...jest.requireActual('../../lib/patient-credit/patient-credit-api'),
  transferCredit: jest.fn(),
}));
const mockedLocations = jest.mocked(listLocations);
const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

// 120,50 VES a favor en un plan cancelado; otro plan vivo que debe 400,00.
const SOURCE = { planId: 'cancelled', currency: 'VES', credit: 120.5 } as CreditSource;
const [live] = accountStatementFixture().plans;
const TARGETS = [{ ...live, id: 'live', currency: 'VES', balance: 400 }];

function renderModal() {
  render(
    <CreditTransferModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      source={SOURCE}
      targets={TARGETS}
      planName={(id) => `Plan ${id}`}
      onDone={jest.fn()}
    />,
  );
}

describe('CreditTransferModal con el formato de la sede (DX-354b)', () => {
  beforeEach(() => mockedLocations.mockReset().mockResolvedValue([STAMP_SEDES.caracas]));

  it.each([
    ['caracas', 'VES 120,50'],
    ['berlin', '120,50 VES'],
    ['miami', 'VES 120.50'],
  ] as const)('el saldo a favor del origen y el que queda salen con el formato de la sede %s', async (key, expected) => {
    mockedLocations.mockResolvedValue([STAMP_SEDES[key]]);
    renderModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(norm(dialog.textContent)).toContain(norm(moneyWithCode(120.5, 'VES', STAMP_FORMATS[key]))));
    expect(norm(dialog.textContent)).toContain(expected);
  });

  it('un importe de más dice el tope con el formato de la sede', async () => {
    const user = userEvent.setup();
    renderModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(norm(dialog.textContent)).toContain('VES 120,50'));
    await user.type(within(dialog).getByLabelText('Importe a aplicar'), '500');
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar al plan' }));
    expect(norm((await within(dialog).findByText(/No puede superar el saldo a favor/)).textContent)).toContain('(VES 120,50)');
  });

  it('sin formato de la sede: «—», un aviso con Reintentar y sin enviar a ciegas', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ locale: null, hourCycle: null })]);
    renderModal();
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'Aplicar al plan' })).toBeDisabled();
    expect(norm(dialog.textContent)).not.toContain('120');
  });
});
