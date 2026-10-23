import { render, screen, waitFor, within } from '@testing-library/react';
import { AgreementDialog } from './agreement-dialog';
import { listAgreements } from '@/lib/agreements/agreements-api';
import { listCoverages } from '@/lib/patients/coverages-api';
import { assignPatientAgreement } from '@/lib/patients/patient-agreement-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { agreementDto, coverageFor, patientAgreement } from './agreement-fixtures';

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
  assignPatientAgreement: jest.fn(),
}));

const mockedAgreements = listAgreements as jest.MockedFunction<typeof listAgreements>;
const mockedCoverages = listCoverages as jest.MockedFunction<typeof listCoverages>;
const mockedAssign = assignPatientAgreement as jest.MockedFunction<typeof assignPatientAgreement>;

const sanitas = { id: 'pay-1', name: 'Sanitas' };
const axa = { id: 'pay-2', name: 'Axa' };

function renderDialog(current = null as ReturnType<typeof patientAgreement> | null) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <AgreementDialog
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="p1"
      current={current}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
}

describe('AgreementDialog (DX-105)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedAgreements.mockResolvedValue([
      agreementDto('ag1', 'Sanitas 2026', sanitas),
      agreementDto('ag2', 'Axa Empresas', axa),
      agreementDto('ag3', 'Viejo', sanitas, { active: false }),
    ]);
    mockedCoverages.mockResolvedValue([
      coverageFor('c1', sanitas, 'Salud Plus'),
      coverageFor('c2', axa, null),
    ]);
  });

  it('pide un convenio antes de guardar', async () => {
    renderDialog();
    const user = setupUser();
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    await user.click(screen.getByRole('button', { name: 'Asignar' }));
    expect(await screen.findByText('Elige un convenio.')).toBeInTheDocument();
    expect(mockedAssign).not.toHaveBeenCalled();
  });

  it('ofrece solo convenios activos y filtra las coberturas por el pagador, sin el n.º de afiliado', async () => {
    renderDialog();
    const user = setupUser();
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    expect(within(dialog).queryByRole('option', { name: /Viejo/ })).not.toBeInTheDocument();

    const coverage = within(dialog).getByLabelText('Cobertura vinculada');
    expect(within(coverage).getAllByRole('option')).toHaveLength(1);

    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
    expect(within(coverage).getByRole('option', { name: 'Sanitas · Salud Plus' })).toBeInTheDocument();
    expect(within(coverage).queryByRole('option', { name: /Axa/ })).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('88123456');

    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag2');
    expect(within(coverage).queryByRole('option', { name: /Salud Plus/ })).not.toBeInTheDocument();
    expect(within(coverage).getByRole('option', { name: 'Axa' })).toBeInTheDocument();
  });

  it('al cambiar de pagador se limpia la cobertura vinculada', async () => {
    renderDialog();
    const user = setupUser();
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
    await user.selectOptions(within(dialog).getByLabelText('Cobertura vinculada'), 'c1');
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag2');
    expect(within(dialog).getByLabelText('Cobertura vinculada')).toHaveValue('');
  });

  it('asigna con cobertura, vigencia y notas, y avisa al padre', async () => {
    mockedAssign.mockResolvedValue(patientAgreement());
    const { onSaved, onOpenChange } = renderDialog();
    const user = setupUser();
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
    await user.selectOptions(within(dialog).getByLabelText('Cobertura vinculada'), 'c1');
    await user.type(within(dialog).getByLabelText('Vigente hasta'), '2027-01-31');
    await user.type(within(dialog).getByLabelText('Notas'), '  Empresa X  ');
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));

    await waitFor(() =>
      expect(mockedAssign).toHaveBeenCalledWith('tok', 'p1', {
        agreementId: 'ag1',
        coverageId: 'c1',
        validFrom: null,
        validTo: '2027-01-31',
        notes: 'Empresa X',
      }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('rechaza una vigencia con el fin antes del inicio', async () => {
    renderDialog();
    const user = setupUser();
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
    await user.type(within(dialog).getByLabelText('Vigente desde'), '2027-03-01');
    await user.type(within(dialog).getByLabelText('Vigente hasta'), '2027-01-01');
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    expect(
      await screen.findByText('La fecha de fin no puede ser anterior a la de inicio.'),
    ).toBeInTheDocument();
    expect(mockedAssign).not.toHaveBeenCalled();
  });

  it('al cambiar precarga el actual, incluso inactivo, y sigue abierto si la API falla', async () => {
    mockedAgreements.mockResolvedValue([agreementDto('ag2', 'Axa Empresas', axa)]);
    mockedAssign.mockRejectedValue(new ApiError(409, 'conflicto'));
    const { onSaved, onOpenChange } = renderDialog(
      patientAgreement({
        agreement: {
          id: 'ag1',
          name: 'Sanitas 2026',
          kind: 'PERCENT_DISCOUNT',
          active: false,
          validFrom: null,
          validTo: null,
          payer: sanitas,
        },
        coverageId: 'c1',
        status: 'INACTIVE',
      }),
    );
    const user = setupUser();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Cambiar convenio')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText('Convenio')).toHaveValue('ag1'));
    expect(within(dialog).getByLabelText('Cobertura vinculada')).toHaveValue('c1');
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
