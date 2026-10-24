import { render, screen, waitFor, within } from '@testing-library/react';
import { AgreementDialog } from './agreement-dialog';
import { listAgreements } from '@/lib/agreements/agreements-api';
import { listCoverages } from '@/lib/patients/coverages-api';
import { assignPatientAgreement } from '@/lib/patients/patient-agreement-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { agreementDto, coverageFor, patientAgreement } from './agreement-fixtures';
import type { ClinicRole } from '@/lib/me/me-api';

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

const sanitas = { id: 'pay-1', name: 'Sanitas', type: 'EPS_CO' as const };
const axa = { id: 'pay-2', name: 'Axa', type: 'PREPAGADA_CO' as const };
const cortesia = { id: 'pay-3', name: 'Cortesía', type: 'OTRO' as const };

function renderDialog(
  current = null as ReturnType<typeof patientAgreement> | null,
  role: ClinicRole | null = 'ADMIN',
) {
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
      role={role}
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
    const sanitasCoverage = within(dialog).getByLabelText('Cobertura del pagador');
    expect(
      within(sanitasCoverage).getByRole('option', {
        name: 'Sanitas · Salud Plus',
      }),
    ).toBeInTheDocument();
    expect(within(sanitasCoverage).queryByRole('option', { name: /Axa/ })).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('88123456');

    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag2');
    const axaCoverage = within(dialog).getByLabelText('Cobertura del pagador');
    expect(
      within(axaCoverage).queryByRole('option', { name: /Salud Plus/ }),
    ).not.toBeInTheDocument();
    expect(within(axaCoverage).getByRole('option', { name: 'Axa' })).toBeInTheDocument();
  });

  it('al cambiar de pagador la cobertura pasa a la del nuevo pagador', async () => {
    mockedCoverages.mockResolvedValue([
      coverageFor('c1', sanitas, 'Salud Plus'),
      coverageFor('c2', axa, null),
      coverageFor('c3', axa, 'Oro'),
    ]);
    renderDialog();
    const user = setupUser();
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
    expect(within(dialog).getByLabelText('Cobertura del pagador')).toHaveValue('c1');
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag2');
    expect(within(dialog).getByLabelText('Cobertura del pagador')).toHaveValue('');
  });

  it('asigna con cobertura, vigencia y notas, y avisa al padre', async () => {
    mockedAssign.mockResolvedValue(patientAgreement());
    const { onSaved, onOpenChange } = renderDialog();
    const user = setupUser();
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: /Sanitas 2026/ });
    await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
    await user.selectOptions(within(dialog).getByLabelText('Cobertura del pagador'), 'c1');
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
    expect(within(dialog).getByLabelText('Cobertura del pagador')).toHaveValue('c1');
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  describe('elegibilidad (SEC-047)', () => {
    it('un convenio de pagador con una sola cobertura vigente la elige y la envía', async () => {
      mockedAssign.mockResolvedValue(patientAgreement());
      renderDialog(null, 'RECEPTION');
      const user = setupUser();
      const dialog = await screen.findByRole('dialog');
      await screen.findByRole('option', { name: /Sanitas 2026/ });
      await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
      const coverage = within(dialog).getByLabelText('Cobertura del pagador');
      expect(coverage).toHaveValue('c1');
      expect(coverage).toHaveAttribute('aria-required', 'true');
      expect(
        within(coverage).queryByRole('option', { name: /Sin cobertura/ }),
      ).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
      await waitFor(() =>
        expect(mockedAssign).toHaveBeenCalledWith(
          'tok',
          'p1',
          expect.objectContaining({ coverageId: 'c1' }),
        ),
      );
    });

    it('con varias coberturas pide elegir una antes de guardar', async () => {
      mockedCoverages.mockResolvedValue([
        coverageFor('c1', sanitas, 'Salud Plus'),
        coverageFor('c4', sanitas, 'Básico'),
      ]);
      renderDialog(null, 'DENTIST');
      const user = setupUser();
      const dialog = await screen.findByRole('dialog');
      await screen.findByRole('option', { name: /Sanitas 2026/ });
      await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
      await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
      expect(
        await within(dialog).findByText('Elige la cobertura del paciente con este pagador.'),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Cobertura del pagador')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(mockedAssign).not.toHaveBeenCalled();
    });

    it('sin cobertura vigente del pagador explica por qué y no deja asignar', async () => {
      mockedCoverages.mockResolvedValue([
        coverageFor('c1', sanitas, 'Salud Plus', 'EXPIRED'),
        coverageFor('c2', axa, null),
      ]);
      renderDialog(null, 'ADMIN');
      const user = setupUser();
      const dialog = await screen.findByRole('dialog');
      await screen.findByRole('option', { name: /Sanitas 2026/ });
      await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag1');
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'El paciente no tiene una cobertura vigente de «Sanitas». Añádela en «Coberturas» y vuelve a asignar el convenio.',
      );
      expect(within(dialog).queryByLabelText('Cobertura del pagador')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeDisabled();
      expect(mockedAssign).not.toHaveBeenCalled();
    });

    it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'] as const)(
      '%s: un convenio interno explica que solo lo asigna un administrador',
      async (role) => {
        mockedAgreements.mockResolvedValue([agreementDto('ag9', 'Cortesía socios', cortesia)]);
        renderDialog(null, role);
        const user = setupUser();
        const dialog = await screen.findByRole('dialog');
        await screen.findByRole('option', { name: /Cortesía socios/ });
        await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag9');
        expect(within(dialog).getByRole('alert')).toHaveTextContent(
          'Este convenio no es de un pagador externo (cortesía, empleados…): solo un administrador puede asignarlo. Si es una aseguradora, pide al administrador que reclasifique el pagador.',
        );
        expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeDisabled();
      },
    );

    it('ADMIN asigna un convenio interno sin cobertura (opcional)', async () => {
      mockedAgreements.mockResolvedValue([agreementDto('ag9', 'Cortesía socios', cortesia)]);
      mockedAssign.mockResolvedValue(patientAgreement());
      renderDialog(null, 'ADMIN');
      const user = setupUser();
      const dialog = await screen.findByRole('dialog');
      await screen.findByRole('option', { name: /Cortesía socios/ });
      await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag9');
      expect(within(dialog).getByLabelText('Cobertura vinculada')).toHaveValue('');
      await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
      await waitFor(() =>
        expect(mockedAssign).toHaveBeenCalledWith(
          'tok',
          'p1',
          expect.objectContaining({ agreementId: 'ag9', coverageId: null }),
        ),
      );
    });

    it('M2: con una cobertura migrada del pagador OTRO, un no-ADMIN la elige y asigna', async () => {
      mockedAgreements.mockResolvedValue([agreementDto('ag9', 'Sura migrada', cortesia)]);
      mockedCoverages.mockResolvedValue([
        coverageFor('c7', cortesia, 'Plan migrado', 'ACTIVE', true),
        coverageFor('c8', cortesia, 'Manual'),
      ]);
      mockedAssign.mockResolvedValue(patientAgreement());
      renderDialog(null, 'RECEPTION');
      const user = setupUser();
      const dialog = await screen.findByRole('dialog');
      await screen.findByRole('option', { name: /Sura migrada/ });
      await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag9');
      const coverage = within(dialog).getByLabelText('Cobertura del pagador');
      expect(coverage).toHaveValue('c7');
      expect(within(coverage).queryByRole('option', { name: /Manual/ })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
      await waitFor(() =>
        expect(mockedAssign).toHaveBeenCalledWith(
          'tok',
          'p1',
          expect.objectContaining({ agreementId: 'ag9', coverageId: 'c7' }),
        ),
      );
    });

    it('M2: al ADMIN le avisa de reclasificar un pagador OTRO, sin bloquear', async () => {
      mockedAgreements.mockResolvedValue([agreementDto('ag9', 'Cortesía socios', cortesia)]);
      renderDialog(null, 'ADMIN');
      const user = setupUser();
      const dialog = await screen.findByRole('dialog');
      await screen.findByRole('option', { name: /Cortesía socios/ });
      await user.selectOptions(within(dialog).getByLabelText('Convenio'), 'ag9');
      expect(
        within(dialog).getByText(
          'El pagador «Cortesía» es de tipo «Otro / interno»: solo un administrador puede asignar este convenio. Si es una aseguradora o una empresa, reclasifica el pagador en Ajustes › Pagadores.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeEnabled();
    });

    it('B4: mientras cargan las coberturas no muestra el bloqueo, sino su propio estado de carga', async () => {
      mockedCoverages.mockReturnValue(new Promise(() => {}));
      renderDialog(patientAgreement({ coverageId: 'c1' }), 'RECEPTION');
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Cargando coberturas…')).toBeInTheDocument();
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /guardar/i })).toBeDisabled();
    });
  });
});
