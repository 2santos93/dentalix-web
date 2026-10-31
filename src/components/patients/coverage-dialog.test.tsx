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
import { typeDate } from './date-test-utils';

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
  type: 'OTHER',
  active,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const sanavida = payer('pay-1', 'Sanavida');
const axa = payer('pay-2', 'Axa');
const oldPayer = payer('pay-3', 'Mapfre', false);

const existing: PatientCoverage = {
  id: 'c1',
  patientId: 'p1',
  payer: { id: 'pay-3', name: 'Mapfre', type: 'OTHER', active: false },
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
    payers: [sanavida, axa, oldPayer],
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
    expect(names.join('|')).toContain('Sanavida');
    expect(names.join('|')).toContain('Axa');
    expect(names.join('|')).not.toContain('Mapfre');
  });

  it('DX-326: each payer option carries its generic type label', () => {
    setup({ payers: [{ ...sanavida, type: 'PREPAID_PLAN' }, axa] });
    const select = screen.getByLabelText('Pagador');
    const names = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(names).toContain('Sanavida · Plan prepago');
    expect(names).toContain('Axa · Otro / interno (cortesía, empleados)');
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
    await typeDate(user, screen.getByRole('group', { name: 'Vigente desde' }), '2026-06-01');
    await typeDate(user, screen.getByRole('group', { name: 'Vigente hasta' }), '2026-05-01');
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
    const created = payer('pay-9', 'Nueva Salud');
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
    const { rerender } = render(<CoverageDialog {...props} payers={[sanavida]} />);
    const user = setupUser();

    await user.click(screen.getByRole('button', { name: '¿No está en la lista? Crear pagador' }));
    const payerDialog = await screen.findByRole('dialog', { name: 'Nuevo pagador' });
    await user.type(within(payerDialog).getByLabelText('Nombre'), 'Nueva Salud');
    // SEC-047: el tipo de pagador ya no viene preseleccionado.
    await user.selectOptions(within(payerDialog).getByLabelText('Tipo'), 'EMPLOYER');
    await user.click(within(payerDialog).getByRole('button', { name: 'Crear pagador' }));

    await waitFor(() => expect(onPayerCreated).toHaveBeenCalledWith(created));
    rerender(<CoverageDialog {...props} payers={[sanavida, created]} />);
    await waitFor(() =>
      expect((screen.getByLabelText('Pagador') as HTMLSelectElement).value).toBe('pay-9'),
    );
    // Crear el pagador no guarda la cobertura.
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  describe('nº de afiliado (SEC-049)', () => {
    const external: Payer = { ...payer('pay-ext', 'Aseguradora Norte'), type: 'EMPLOYER' };

    it('con un pagador externo es obligatorio: error en el campo, foco y nada enviado', async () => {
      setup({ payers: [external, sanavida] });
      const user = setupUser();
      await user.selectOptions(screen.getByLabelText('Pagador'), 'pay-ext');
      const member = screen.getByLabelText('Nº de afiliado o póliza');
      expect(member).toHaveAttribute('aria-required', 'true');
      expect(member).toHaveAccessibleDescription(
        'El número que figura en la tarjeta o póliza del paciente.',
      );
      await user.click(screen.getByRole('button', { name: 'Añadir' }));
      expect(
        await screen.findByText('El nº de afiliado o póliza es obligatorio con un pagador externo.'),
      ).toBeInTheDocument();
      expect(member).toHaveFocus();
      expect(member).toHaveAttribute('aria-invalid', 'true');
      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('con un formato no válido avisa sin repetir el número; con uno válido guarda', async () => {
      mockedCreate.mockResolvedValue({ ...existing, id: 'c9' });
      const props = setup({ payers: [external] });
      const user = setupUser();
      await user.selectOptions(screen.getByLabelText('Pagador'), 'pay-ext');
      const member = screen.getByLabelText('Nº de afiliado o póliza');
      await user.type(member, 'AF#12');
      await user.click(screen.getByRole('button', { name: 'Añadir' }));
      const error = await screen.findByText(
        'El nº de afiliado o póliza debe tener entre 4 y 40 caracteres: letras, números, espacios, guiones, puntos o barras.',
      );
      expect(error).not.toHaveTextContent('AF#12');
      expect(member).toHaveAccessibleDescription(error.textContent ?? '');
      await user.clear(member);
      await user.type(member, '1020304050');
      await user.click(screen.getByRole('button', { name: 'Añadir' }));
      await waitFor(() =>
        expect(mockedCreate).toHaveBeenCalledWith(
          'tok',
          'p1',
          expect.objectContaining({ payerId: 'pay-ext', memberNumber: '1020304050' }),
        ),
      );
      expect(props.onSaved).toHaveBeenCalled();
    });

    it('con un pagador interno (OTHER) sigue siendo opcional', async () => {
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
        payer: {
          id: 'pay-ext',
          name: 'Aseguradora Norte',
          type: 'EMPLOYER',
          active: true,
        },
        migratedFromInsurerEps: true,
      };
      mockedUpdate.mockResolvedValue(legacy);
      setup({ coverage: legacy, payers: [external] });
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
          payer: {
            id: 'pay-ext',
            name: 'Aseguradora Norte',
            type: 'EMPLOYER',
            active: true,
          },
          memberNumber: '1020304050',
          verifiedAt: '2026-10-20T15:00:00.000Z',
          verifiedById: 'admin-1',
          verifiedByName: 'Ana Gómez',
        },
        payers: [external],
      });
      expect(screen.getByLabelText('Nº de afiliado o póliza')).toHaveAccessibleDescription(
        'Cambiarlo quita la verificación del administrador.',
      );
    });

    describe('vigencia de una verificada (SEC-053)', () => {
      const verified: PatientCoverage = {
        ...existing,
        payer: { id: 'pay-ext', name: 'Aseguradora Norte', type: 'EMPLOYER', active: true },
        memberNumber: '1020304050',
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
        verifiedAt: '2025-02-01T10:00:00.000Z',
        verifiedById: 'admin-1',
        verifiedByName: 'Ana Gómez',
      };

      it('quien no es ADMIN ve que cambiar las fechas quita la verificación', () => {
        setup({ coverage: verified, payers: [external] });
        expect(screen.getByRole('group', { name: 'Vigente hasta' })).toHaveAccessibleDescription(
          /Déjala vacía si no tiene fecha de fin\. Cambiar las fechas quita la verificación del administrador\.$/,
        );
      });

      it('el ADMIN solo ve la ayuda de siempre', () => {
        setup({ coverage: verified, payers: [external], editorIsAdmin: true });
        expect(screen.getByRole('group', { name: 'Vigente hasta' })).toHaveAccessibleDescription(/(?:^|\s)Déjala vacía si no tiene fecha de fin\.$/);
      });

      it('sin verificar no avisa', () => {
        setup({ coverage: { ...verified, verifiedAt: null, verifiedById: null }, payers: [external] });
        expect(screen.getByRole('group', { name: 'Vigente hasta' })).toHaveAccessibleDescription(/(?:^|\s)Déjala vacía si no tiene fecha de fin\.$/);
      });
    });
  });
});
