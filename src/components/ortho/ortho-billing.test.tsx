import { render, screen, waitFor, within } from '@testing-library/react';
import { OrthoTab } from './ortho-tab';
import { OrthoOverdueChip } from './ortho-overdue-chip';
import { listOrthoCases, listOrthoVisits } from '@/lib/ortho/ortho-api';
import {
  acceptOrthoFee,
  checkFee,
  FEE_MESSAGES,
  getOrthoAccount,
  getOrthoAligners,
  listOrthoAccounts,
  setOrthoFee,
} from '@/lib/ortho/ortho-billing';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/implants';
import { makeAlignerSeries, makeAligners, makeOrthoAccount, makeOrthoCase, makeOrthoVisit } from '@/lib/test/ortho';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/ortho/ortho-api', () => ({
  ...jest.requireActual('../../lib/ortho/ortho-api'),
  listOrthoCases: jest.fn(),
  listOrthoVisits: jest.fn(),
}));
jest.mock('../../lib/ortho/ortho-billing', () => ({
  ...jest.requireActual('../../lib/ortho/ortho-billing'),
  getOrthoAccount: jest.fn(),
  listOrthoAccounts: jest.fn(),
  setOrthoFee: jest.fn(),
  acceptOrthoFee: jest.fn(),
  getOrthoAligners: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mocked = {
  cases: listOrthoCases as jest.MockedFunction<typeof listOrthoCases>,
  visits: listOrthoVisits as jest.MockedFunction<typeof listOrthoVisits>,
  account: getOrthoAccount as jest.MockedFunction<typeof getOrthoAccount>,
  accounts: listOrthoAccounts as jest.MockedFunction<typeof listOrthoAccounts>,
  setFee: setOrthoFee as jest.MockedFunction<typeof setOrthoFee>,
  accept: acceptOrthoFee as jest.MockedFunction<typeof acceptOrthoFee>,
  aligners: getOrthoAligners as jest.MockedFunction<typeof getOrthoAligners>,
  locations: listLocations as jest.MockedFunction<typeof listLocations>,
};

const DENTIST = tokenFor('DENTIST', 'u-dentist');
const RECEPTION = tokenFor('RECEPTION', 'u-reception');
const ASSISTANT = tokenFor('ASSISTANT', 'u-assistant');

describe('DX-285 · reparto del honorario (web)', () => {
  const draft = { total: '3.000.000', initial: '600.000', perVisit: '90.000', visitCount: '24', retention: '240.000' };

  it('3.000.000 = 600.000 + 24 × 90.000 + 240.000 cuadra', () => {
    expect(checkFee(draft, 'VES')).toEqual({
      ok: true,
      input: { total: 3_000_000, initial: 600_000, perVisit: 90_000, visitCount: 24, retention: 240_000 },
    });
  });

  it('un reparto que no suma el total no se envía y dice cuánto suma', () => {
    const r = checkFee({ ...draft, visitCount: '23' }, 'VES');
    expect(r).toMatchObject({ ok: false, message: FEE_MESSAGES.split, sumCents: (600_000 + 23 * 90_000 + 240_000) * 100 });
  });

  it('importes ilegibles o controles fuera de rango', () => {
    expect(checkFee({ ...draft, initial: 'mucho' }, 'VES')).toMatchObject({ ok: false, field: 'initial' });
    expect(checkFee({ ...draft, visitCount: '300' }, 'VES')).toMatchObject({ ok: false, field: 'visitCount' });
    expect(checkFee({ ...draft, total: '0' }, 'VES')).toMatchObject({ ok: false, field: 'total' });
  });
});

describe('OrthoOverdueChip', () => {
  it('con marca: «Ortodoncia: saldo vencido · 45 días», sin importe; sin marca, nada', () => {
    const { rerender } = render(<OrthoOverdueChip flag={{ hasOverdue: true, overdueDays: 45 }} />);
    expect(screen.getByTestId('ortho-overdue-chip')).toHaveTextContent('Ortodoncia: saldo vencido · 45 días');
    rerender(<OrthoOverdueChip flag={{ hasOverdue: false, overdueDays: null }} />);
    expect(screen.queryByTestId('ortho-overdue-chip')).not.toBeInTheDocument();
  });
});

describe('Pestaña Ortodoncia · Cuenta del caso y Alineadores (DX-285)', () => {
  beforeEach(() => {
    for (const m of Object.values(mocked)) m.mockReset();
    mocked.locations.mockResolvedValue([clinicLocation({ currency: 'VES' })]);
    mocked.cases.mockResolvedValue([makeOrthoCase({ technique: 'ALIGNERS' })]);
    mocked.visits.mockResolvedValue([makeOrthoVisit()]);
    mocked.aligners.mockResolvedValue(makeAligners());
  });

  it('la cuenta muestra honorario, realizado (3 de 24), pagado, saldo y «Al día»', async () => {
    mocked.account.mockResolvedValue(makeOrthoAccount());
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={['0.016']} />);
    const section = await screen.findByRole('region', { name: 'Cuenta del caso' });
    await within(section).findByText('VES 3.000.000,00');
    expect(within(section).getByText('VES 870.000,00')).toBeInTheDocument();
    expect(within(section).getByText('3 de 24 controles cobrados')).toBeInTheDocument();
    expect(within(section).getByText('VES 600.000,00')).toBeInTheDocument();
    expect(within(section).getByText('VES 270.000,00')).toBeInTheDocument();
    expect(within(section).getByText('Al día')).toBeInTheDocument();
    // Aceptado: ya no se edita.
    expect(within(section).queryByRole('button', { name: 'Editar honorario' })).not.toBeInTheDocument();
  });

  it('con saldo vencido lo marca con el importe y los días', async () => {
    mocked.account.mockResolvedValue(
      makeOrthoAccount({ hasOverdue: true, overdue: 870_000, overdueAgeDays: 45, overdueSince: '2026-10-02' }),
    );
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={['0.016']} />);
    expect(await screen.findByTestId('ortho-account-overdue')).toHaveTextContent(
      'Saldo vencido · VES 870.000,00 · desde hace 45 días',
    );
  });

  it('sin aceptar: odontología edita y acepta el honorario; al aceptar se actualiza la cuenta', async () => {
    const user = setupUser();
    mocked.account.mockResolvedValue(
      makeOrthoAccount({ billing: 'PENDING', billed: null, paid: null, balance: null, remaining: null, overdue: null }),
    );
    mocked.accept.mockResolvedValue(makeOrthoAccount({ billed: 600_000, visitsCharged: 0 }));
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={['0.016']} />);
    const section = await screen.findByRole('region', { name: 'Cuenta del caso' });
    expect(await within(section).findByRole('button', { name: 'Editar honorario' })).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Aceptar honorario' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aceptar el honorario' });
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar honorario' }));
    await waitFor(() => expect(mocked.accept).toHaveBeenCalledWith(DENTIST, 'p1', 'case-1'));
    expect(await within(section).findByText('0 de 24 controles cobrados')).toBeInTheDocument();
  });

  it('el formulario del honorario no envía un reparto que no cuadra', async () => {
    const user = setupUser();
    mocked.account.mockResolvedValue(
      makeOrthoAccount({ billing: 'NONE', fee: null, billed: null, paid: null, balance: null, remaining: null }),
    );
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={['0.016']} />);
    const section = await screen.findByRole('region', { name: 'Cuenta del caso' });
    await user.click(await within(section).findByRole('button', { name: 'Poner honorario' }));
    const dialog = await screen.findByRole('dialog', { name: 'Honorario del caso' });
    await user.type(within(dialog).getByLabelText('Honorario total'), '3000000');
    await user.type(within(dialog).getByLabelText(/Cuota inicial/), '600000');
    await user.type(within(dialog).getByLabelText('Importe por control'), '90000');
    await user.type(within(dialog).getByLabelText('Retiro y retención'), '200000');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar honorario' }));
    expect(await within(dialog).findByText(FEE_MESSAGES.split)).toBeInTheDocument();
    expect(mocked.setFee).not.toHaveBeenCalled();
    await user.clear(within(dialog).getByLabelText('Retiro y retención'));
    await user.type(within(dialog).getByLabelText('Retiro y retención'), '240000');
    mocked.setFee.mockResolvedValue(makeOrthoAccount({ billing: 'PENDING' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar honorario' }));
    await waitFor(() =>
      expect(mocked.setFee).toHaveBeenCalledWith(DENTIST, 'p1', 'case-1', {
        total: 3_000_000,
        initial: 600_000,
        perVisit: 90_000,
        visitCount: 24,
        retention: 240_000,
      }),
    );
  });

  it('ASSISTANT ve la cuenta y los alineadores sin acciones', async () => {
    mocked.account.mockResolvedValue(makeOrthoAccount({ billing: 'PENDING' }));
    render(<OrthoTab token={ASSISTANT} patientId="p1" wireGauges={['0.016']} />);
    const section = await screen.findByRole('region', { name: 'Cuenta del caso' });
    await within(section).findByText('VES 3.000.000,00');
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    const aligners = await screen.findByRole('region', { name: 'Alineadores' });
    await within(aligners).findByText('Marca X');
    expect(within(aligners).queryByRole('button', { name: 'Registrar entrega' })).not.toBeInTheDocument();
  });

  it('alineadores: la bandeja actual por arcada y «Sin bandejas: entregar»', async () => {
    mocked.account.mockResolvedValue(makeOrthoAccount());
    mocked.aligners.mockResolvedValue(
      makeAligners({
        series: [
          makeAlignerSeries({ id: 's-low', arch: 'LOWER', state: 'NEEDS_DELIVERY', currentTray: 4 }),
          makeAlignerSeries({ id: 's-up', arch: 'UPPER', currentTray: 5, sequence: 2, refinementOfId: 's-low' }),
        ],
        upperSeriesId: 's-up',
        lowerSeriesId: 's-low',
      }),
    );
    render(<OrthoTab token={DENTIST} patientId="p1" wireGauges={['0.016']} />);
    const aligners = await screen.findByRole('region', { name: 'Alineadores' });
    expect(await within(aligners).findByTestId('aligner-arch-Superior')).toHaveTextContent('Bandeja 5 de 20');
    expect(within(aligners).getByTestId('aligner-arch-Inferior')).toHaveTextContent('Sin bandejas: entregar');
    expect(within(aligners).getByText('Marca X · refinamiento 1')).toBeInTheDocument();
    expect(within(aligners).getAllByRole('button', { name: 'Registrar entrega' })).toHaveLength(2);
  });

  it('RECEPTION ve solo la cuenta de los casos, sin el caso clínico', async () => {
    mocked.accounts.mockResolvedValue([makeOrthoAccount({ hasOverdue: true, overdue: 90_000, overdueAgeDays: 40 })]);
    render(<OrthoTab token={RECEPTION} patientId="p1" wireGauges={['0.016']} />);
    expect(await screen.findByText('Cuenta del caso')).toBeInTheDocument();
    expect(await screen.findByTestId('ortho-account-overdue')).toHaveTextContent('VES 90.000,00');
    expect(mocked.cases).not.toHaveBeenCalled();
    expect(mocked.account).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
