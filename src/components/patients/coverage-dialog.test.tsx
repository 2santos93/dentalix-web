import { render, screen, waitFor, within } from '@testing-library/react';
import { CoverageDialog } from './coverage-dialog';
import {
  createCoverage,
  updateCoverage,
  type PatientCoverage,
} from '@/lib/patients/coverages-api';
import { createPayer, type Payer } from '@/lib/payers/payers-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/patients/coverages-api', () => ({
  ...jest.requireActual('../../lib/patients/coverages-api'),
  createCoverage: jest.fn(),
  updateCoverage: jest.fn(),
}));
jest.mock('../../lib/payers/payers-api', () => ({
  ...jest.requireActual('../../lib/payers/payers-api'),
  createPayer: jest.fn(),
}));

const mockedCreate = createCoverage as jest.MockedFunction<typeof createCoverage>;
const mockedUpdate = updateCoverage as jest.MockedFunction<typeof updateCoverage>;
const mockedCreatePayer = createPayer as jest.MockedFunction<typeof createPayer>;

const payer = (id: string, name: string, active = true): Payer => ({
  id,
  name,
  type: 'OTRO',
  country: null,
  active,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const sanitas = payer('pay-1', 'Sanitas');
const axa = payer('pay-2', 'Axa');
const oldPayer = payer('pay-3', 'Mapfre', false);

const existing: PatientCoverage = {
  id: 'c1',
  patientId: 'p1',
  payer: { id: 'pay-3', name: 'Mapfre', type: 'OTRO', country: null, active: false },
  planName: null,
  memberNumber: null,
  policyHolderName: null,
  validFrom: null,
  validTo: null,
  isPrimary: false,
  notes: null,
  migratedFromInsurerEps: false,
    declaredById: null,
    verifiedAt: null,
    verifiedById: null,
    verifiedByName: null,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function setup(over: Partial<React.ComponentProps<typeof CoverageDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    token: 'tok',
    patientId: 'p1',
    coverage: null,
    payers: [sanitas, axa, oldPayer],
    canCreatePayer: false,
    onSaved: jest.fn(),
    onPayerCreated: jest.fn(),
    ...over,
  };
  render(<CoverageDialog {...props} />);
  return props;
}

describe('CoverageDialog (DX-153)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('al añadir lista solo los pagadores activos', () => {
    setup();
    const select = screen.getByLabelText('Pagador');
    const names = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(names.join('|')).toContain('Sanitas');
    expect(names.join('|')).toContain('Axa');
    expect(names.join('|')).not.toContain('Mapfre');
  });

  it('al editar incluye el pagador actual aunque esté inactivo', () => {
    setup({ coverage: existing });
    const select = screen.getByLabelText('Pagador') as HTMLSelectElement;
    expect(select.value).toBe('pay-3');
    expect(within(select).getByRole('option', { name: /Mapfre/ })).toBeInTheDocument();
  });

  it('exige un pagador', async () => {
    const props = setup();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Elige un pagador.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it('rechaza una fecha de fin anterior a la de inicio', async () => {
    setup();
    const user = setupUser();
    await user.selectOptions(screen.getByLabelText('Pagador'), 'pay-1');
    await user.type(screen.getByLabelText('Vigente desde'), '2026-06-01');
    await user.type(screen.getByLabelText('Vigente hasta'), '2026-05-01');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(
      await screen.findByText('La fecha de fin no puede ser anterior a la de inicio.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('«Principal» queda marcado y deshabilitado cuando es la única cobertura', () => {
    setup({ onlyCoverage: true });
    const box = screen.getByLabelText('Principal');
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
  });

  it('«Principal» se puede marcar cuando hay otras coberturas', async () => {
    setup();
    const box = screen.getByLabelText('Principal');
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
  });

  it('muestra el error de la API en el modal, que sigue abierto', async () => {
    const props = setup();
    mockedCreate.mockRejectedValue(new ApiError(422, 'Ya existe una cobertura igual.'));
    const user = setupUser();
    await user.selectOptions(screen.getByLabelText('Pagador'), 'pay-1');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Ya existe una cobertura igual.')).toBeInTheDocument();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('al editar manda los campos vaciados como null', async () => {
    mockedUpdate.mockResolvedValue(existing);
    const props = setup({ coverage: { ...existing, planName: 'Plan A' } });
    const user = setupUser();
    await user.clear(screen.getByLabelText('Plan'));
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , id, patch] = mockedUpdate.mock.calls[0];
    expect(id).toBe('c1');
    expect(patch.planName).toBeNull();
    expect(patch).not.toHaveProperty('isPrimary');
    expect(props.onSaved).toHaveBeenCalled();
  });

  it('sin permiso no ofrece crear pagador', () => {
    setup({ canCreatePayer: false });
    expect(screen.queryByRole('button', { name: /crear pagador/i })).not.toBeInTheDocument();
  });

  it('con permiso crea un pagador y lo deja elegido', async () => {
    const created = payer('pay-9', 'Nueva EPS');
    mockedCreatePayer.mockResolvedValue(created);
    const onPayerCreated = jest.fn();
    // El padre suma el pagador creado a la lista: se simula con un rerender.
    const props = {
      open: true,
      onOpenChange: jest.fn(),
      token: 'tok',
      patientId: 'p1',
      coverage: null,
      canCreatePayer: true,
      onSaved: jest.fn(),
      onPayerCreated,
    };
    const { rerender } = render(<CoverageDialog {...props} payers={[sanitas]} />);
    const user = setupUser();

    await user.click(screen.getByRole('button', { name: '¿No está en la lista? Crear pagador' }));
    const payerDialog = await screen.findByRole('dialog', { name: 'Nuevo pagador' });
    await user.type(within(payerDialog).getByLabelText('Nombre'), 'Nueva EPS');
    // SEC-047: el tipo de pagador ya no viene preseleccionado.
    await user.selectOptions(within(payerDialog).getByLabelText('Tipo'), 'EMPRESA');
    await user.click(within(payerDialog).getByRole('button', { name: 'Crear pagador' }));

    await waitFor(() => expect(onPayerCreated).toHaveBeenCalledWith(created));
    rerender(<CoverageDialog {...props} payers={[sanitas, created]} />);
    await waitFor(() =>
      expect((screen.getByLabelText('Pagador') as HTMLSelectElement).value).toBe('pay-9'),
    );
    // Crear el pagador no guarda la cobertura.
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  describe('nº de afiliado (SEC-049)', () => {
    const eps: Payer = { ...payer('pay-eps', 'Sura EPS'), type: 'EPS_CO', country: 'CO' };

    it('con un pagador externo es obligatorio: error en el campo, foco y nada enviado', async () => {
      setup({ payers: [eps, sanitas] });
      const user = setupUser();
      await user.selectOptions(screen.getByLabelText('Pagador'), 'pay-eps');
      const member = screen.getByLabelText('Nº de afiliado o póliza');
      expect(member).toHaveAttribute('aria-required', 'true');
      expect(member).toHaveAccessibleDescription('El documento del afiliado, de 5 a 15 dígitos.');
      await user.click(screen.getByRole('button', { name: 'Añadir' }));
      expect(
        await screen.findByText(
          'En una EPS, el nº de afiliado es obligatorio: es el documento del afiliado.',
        ),
      ).toBeInTheDocument();
      expect(member).toHaveFocus();
      expect(member).toHaveAttribute('aria-invalid', 'true');
      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('con un formato que no es de EPS avisa; con uno válido guarda', async () => {
      mockedCreate.mockResolvedValue({ ...existing, id: 'c9' });
      const props = setup({ payers: [eps] });
      const user = setupUser();
      await user.selectOptions(screen.getByLabelText('Pagador'), 'pay-eps');
      const member = screen.getByLabelText('Nº de afiliado o póliza');
      await user.type(member, 'AFI-12');
      await user.click(screen.getByRole('button', { name: 'Añadir' }));
      expect(
        await screen.findByText(
          'En una EPS, el nº de afiliado es el documento del afiliado: de 5 a 15 dígitos, sin letras.',
        ),
      ).toBeInTheDocument();
      await user.clear(member);
      await user.type(member, '1020304050');
      await user.click(screen.getByRole('button', { name: 'Añadir' }));
      await waitFor(() =>
        expect(mockedCreate).toHaveBeenCalledWith(
          'tok',
          'p1',
          expect.objectContaining({ payerId: 'pay-eps', memberNumber: '1020304050' }),
        ),
      );
      expect(props.onSaved).toHaveBeenCalled();
    });

    it('con un pagador interno (OTRO) sigue siendo opcional', async () => {
      mockedCreate.mockResolvedValue({ ...existing, id: 'c9' });
      setup();
      const user = setupUser();
      await user.selectOptions(screen.getByLabelText('Pagador'), 'pay-1');
      expect(screen.getByLabelText('Número de afiliado')).not.toHaveAttribute('aria-required');
      await user.click(screen.getByRole('button', { name: 'Añadir' }));
      await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    });

    it('una cobertura anterior sin nº se edita en lo demás sin pedirlo', async () => {
      const legacy: PatientCoverage = {
        ...existing,
        payer: { id: 'pay-eps', name: 'Sura EPS', type: 'EPS_CO', country: 'CO', active: true },
        migratedFromInsurerEps: true,
      };
      mockedUpdate.mockResolvedValue(legacy);
      setup({ coverage: legacy, payers: [eps] });
      const user = setupUser();
      await user.type(screen.getByLabelText('Notas'), 'Pedir el carné');
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() =>
        expect(mockedUpdate).toHaveBeenCalledWith(
          'tok',
          'p1',
          'c1',
          expect.objectContaining({ memberNumber: null, notes: 'Pedir el carné' }),
        ),
      );
    });

    it('al editar una verificada avisa de que cambiar el nº quita la verificación', () => {
      setup({
        coverage: {
          ...existing,
          payer: { id: 'pay-eps', name: 'Sura EPS', type: 'EPS_CO', country: 'CO', active: true },
          memberNumber: '1020304050',
          verifiedAt: '2026-10-20T15:00:00.000Z',
          verifiedById: 'admin-1',
          verifiedByName: 'Ana Gómez',
        },
        payers: [eps],
      });
      expect(screen.getByLabelText('Nº de afiliado o póliza')).toHaveAccessibleDescription(
        'Cambiarlo quita la verificación del administrador.',
      );
    });
  });
});
