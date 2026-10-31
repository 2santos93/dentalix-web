import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientCoverageSection } from './patient-coverage-section';
import {
  createCoverage,
  deleteCoverage,
  listCoverages,
  updateCoverage,
  verifyCoverage,
  type PatientCoverage,
} from '@/lib/patients/coverages-api';
import { listPayers, type Payer } from '@/lib/payers/payers-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/patients/coverages-api', () => ({
  ...jest.requireActual('../../lib/patients/coverages-api'),
  listCoverages: jest.fn(),
  createCoverage: jest.fn(),
  updateCoverage: jest.fn(),
  deleteCoverage: jest.fn(),
  verifyCoverage: jest.fn(),
}));
jest.mock('../../lib/payers/payers-api', () => ({
  ...jest.requireActual('../../lib/payers/payers-api'),
  listPayers: jest.fn(),
  createPayer: jest.fn(),
}));
let mockRole = 'RECEPTION';
jest.mock('../../lib/auth/token-role', () => ({ getTokenRole: () => mockRole }));

const mockedList = listCoverages as jest.MockedFunction<typeof listCoverages>;
const mockedCreate = createCoverage as jest.MockedFunction<typeof createCoverage>;
const mockedUpdate = updateCoverage as jest.MockedFunction<typeof updateCoverage>;
const mockedDelete = deleteCoverage as jest.MockedFunction<typeof deleteCoverage>;
const mockedVerify = verifyCoverage as jest.MockedFunction<typeof verifyCoverage>;
const mockedPayers = listPayers as jest.MockedFunction<typeof listPayers>;

const payer = (id: string, name: string, over: Partial<Payer> = {}): Payer => ({
  id,
  name,
  type: 'OTHER',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const sanitas = payer('pay-1', 'Sanitas', { type: 'INSURER' });
const colsanitas = payer('pay-2', 'Colsanitas', { type: 'PREPAID_PLAN' });

function coverage(over: Partial<PatientCoverage> = {}): PatientCoverage {
  const p = over.payer ?? sanitas;
  return {
    id: 'c1',
    patientId: 'p1',
    payer: { id: p.id, name: p.name, type: p.type, active: p.active },
    planName: 'Salud Plus',
    memberNumber: '88123456',
    policyHolderName: null,
    validFrom: '2026-01-01',
    validTo: '2027-01-31',
    isPrimary: true,
    notes: null,
    migratedFromInsurerEps: false,
    declaredById: null,
    verifiedAt: null,
    verifiedById: null,
    verifiedByName: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const renderSection = (onChanged?: () => void) =>
  render(<PatientCoverageSection token="tok" patientId="p1" onChanged={onChanged} />);


/** «Editar» y «Quitar» viven en el menú «⋯» de la fila (RowActions). */
async function rowAction(
  user: ReturnType<typeof setupUser>,
  payerName: string,
  action: 'Editar' | 'Quitar',
) {
  await user.click(await screen.findByRole('button', { name: `Acciones de la cobertura de ${payerName}` }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

describe('PatientCoverageSection (DX-153)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRole = 'RECEPTION';
    mockedPayers.mockResolvedValue([sanitas, colsanitas]);
  });

  it('carga: esqueleto con estado accesible y título «Cobertura»', () => {
    mockedList.mockReturnValue(new Promise(() => undefined));
    renderSection();
    expect(screen.getByRole('status', { name: 'Cargando cobertura' })).toBeInTheDocument();
    expect(screen.getByTestId('patient-coverage')).toBe(
      screen.getByRole('heading', { name: 'Cobertura' }).closest('section'),
    );
  });

  it('vacío: enseña qué registrar y ofrece «Añadir cobertura»', async () => {
    mockedList.mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText('Sin cobertura registrada')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Registra el pagador, el plan y el número de afiliado para tenerlos a mano al cobrar.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir cobertura' })).toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce([]);
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin cobertura registrada')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('lista las coberturas con sus insignias y su vigencia', async () => {
    mockedList.mockResolvedValue([
      coverage(),
      coverage({
        id: 'c2',
        payer: colsanitas,
        planName: null,
        memberNumber: null,
        policyHolderName: 'Rosa Díaz',
        isPrimary: false,
        validFrom: null,
        validTo: '2026-01-31',
        status: 'EXPIRED',
      }),
      coverage({
        id: 'c3',
        payer: payer('pay-3', 'Axa'),
        isPrimary: false,
        validFrom: '2027-03-01',
        validTo: null,
        status: 'NOT_STARTED',
      }),
    ]);
    renderSection();
    const rows = await screen.findAllByTestId('coverage-row');
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('Sanitas')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Aseguradora')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Salud Plus')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Afiliado n.º 88123456')).toHaveClass('tabular-nums');
    expect(within(rows[0]).getByText('Vigente hasta 31/01/2027')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Principal')).toBeInTheDocument();

    expect(within(rows[1]).getByText('Vencida')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Venció el 31/01/2026')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Titular: Rosa Díaz')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('Principal')).not.toBeInTheDocument();

    expect(within(rows[2]).getByText('Pendiente de inicio')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Desde 01/03/2027')).toBeInTheDocument();
  });

  it('no mete el número de afiliado en title ni en aria-label', async () => {
    mockedList.mockResolvedValue([coverage()]);
    const { container } = renderSection();
    await screen.findByTestId('coverage-row');
    const leaks = Array.from(container.querySelectorAll('[title],[aria-label]')).filter(
      (el) =>
        (el.getAttribute('title') ?? '').includes('88123456') ||
        (el.getAttribute('aria-label') ?? '').includes('88123456'),
    );
    expect(leaks).toHaveLength(0);
  });

  it('añade una cobertura con pagador, avisa y notifica a la ficha', async () => {
    mockedList.mockResolvedValueOnce([]);
    mockedList.mockResolvedValueOnce([coverage()]);
    mockedCreate.mockResolvedValue(coverage());
    const onChanged = jest.fn();
    renderSection(onChanged);
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: 'Añadir cobertura' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'pay-1');
    await user.type(within(dialog).getByLabelText('Plan'), 'Salud Plus');
    await user.type(within(dialog).getByLabelText('Nº de afiliado o póliza'), '88123456');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({
        payerId: 'pay-1',
        planName: 'Salud Plus',
        memberNumber: '88123456',
        isPrimary: true,
      }),
    );
    expect(await screen.findByText('Cobertura guardada.')).toBeInTheDocument();
    expect(await screen.findByTestId('coverage-row')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('marca otra cobertura como principal desde «Editar»', async () => {
    const second = coverage({ id: 'c2', payer: colsanitas, isPrimary: false });
    mockedList.mockResolvedValue([coverage(), second]);
    mockedUpdate.mockResolvedValue({ ...second, isPrimary: true });
    const onChanged = jest.fn();
    renderSection(onChanged);
    const user = setupUser();

    await rowAction(user, 'Colsanitas', 'Editar');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Principal'));
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate).toHaveBeenCalledWith(
      'tok',
      'p1',
      'c2',
      expect.objectContaining({ isPrimary: true, payerId: 'pay-2' }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('el aviso de éxito se limpia al abrir un diálogo y un nuevo guardado lo vuelve a anunciar', async () => {
    mockedList.mockResolvedValue([coverage()]);
    mockedDelete.mockResolvedValue(undefined);
    mockedUpdate.mockResolvedValue(coverage());
    renderSection();
    const user = setupUser();

    await rowAction(user, 'Sanitas', 'Editar');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText('Cobertura guardada.')).toBeInTheDocument();

    await rowAction(user, 'Sanitas', 'Editar');
    expect(screen.queryByText('Cobertura guardada.')).not.toBeInTheDocument();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText('Cobertura guardada.')).toBeInTheDocument();
  });

  it('quita con confirmación, notifica y devuelve el foco a «Añadir cobertura»', async () => {
    mockedList.mockResolvedValueOnce([coverage()]);
    mockedList.mockResolvedValueOnce([]);
    mockedDelete.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    renderSection(onChanged);
    const user = setupUser();

    await rowAction(user, 'Sanitas', 'Quitar');
    const confirm = await screen.findByRole('dialog');
    expect(mockedDelete).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Quitar' }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'p1', 'c1'));
    expect(await screen.findByText('Cobertura quitada.')).toBeInTheDocument();
    expect(await screen.findByText('Sin cobertura registrada')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Añadir cobertura' })).toHaveFocus(),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('si quitar falla, el diálogo sigue abierto con el error y no notifica', async () => {
    mockedList.mockResolvedValue([coverage()]);
    mockedDelete.mockRejectedValue(new ApiError(500, 'boom'));
    const onChanged = jest.fn();
    renderSection(onChanged);
    const user = setupUser();

    await rowAction(user, 'Sanitas', 'Quitar');
    const confirm = await screen.findByRole('dialog');
    await user.click(within(confirm).getByRole('button', { name: 'Quitar' }));

    expect(await within(confirm).findByText(/No pudimos quitar la cobertura|boom/)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  describe('verificación (SEC-049)', () => {
    const otro = payer('pay-3', 'Cortesía');

    it('insignia «Verificada» con quién y cuándo, «Sin verificar», y nada con un pagador interno', async () => {
      mockedList.mockResolvedValue([
        coverage({
          verifiedAt: '2026-10-20T15:00:00.000Z',
          verifiedById: 'admin-1',
          verifiedByName: 'Ana Gómez',
        }),
        coverage({ id: 'c2', payer: colsanitas, isPrimary: false }),
        coverage({ id: 'c3', payer: otro, isPrimary: false }),
      ]);
      renderSection();
      const rows = await screen.findAllByTestId('coverage-row');
      expect(within(rows[0]).getByTestId('coverage-verification')).toHaveTextContent('Verificada');
      expect(
        within(rows[0]).getByText(/^Verificada por Ana Gómez el \d{2}\/\d{2}\/2026$/),
      ).toBeInTheDocument();
      expect(within(rows[1]).getByTestId('coverage-verification')).toHaveTextContent(
        'Sin verificar',
      );
      expect(within(rows[2]).queryByTestId('coverage-verification')).not.toBeInTheDocument();
    });

    it('recepción no ve «Verificar»', async () => {
      mockedList.mockResolvedValue([coverage()]);
      renderSection();
      await screen.findByTestId('coverage-row');
      expect(screen.queryByRole('button', { name: /^Verificar/ })).not.toBeInTheDocument();
    });

    it('el ADMIN verifica con confirmación que enseña el nº, avisa y recarga', async () => {
      mockRole = 'ADMIN';
      const verified = coverage({
        verifiedAt: '2026-10-20T15:00:00.000Z',
        verifiedById: 'admin-1',
        verifiedByName: 'Ana Gómez',
      });
      mockedList.mockResolvedValueOnce([coverage()]).mockResolvedValueOnce([verified]);
      mockedVerify.mockResolvedValue(verified);
      const onChanged = jest.fn();
      renderSection(onChanged);
      const user = setupUser();

      await user.click(
        await screen.findByRole('button', { name: 'Verificar la cobertura de Sanitas' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Verificar cobertura' });
      expect(dialog).toHaveTextContent('el nº de afiliado 88123456 es de este paciente');
      await user.click(within(dialog).getByRole('button', { name: 'Verificar' }));

      await waitFor(() =>
        expect(mockedVerify).toHaveBeenCalledWith('tok', 'p1', 'c1', '88123456'),
      );
      expect(await screen.findByText('Cobertura verificada.')).toBeInTheDocument();
      expect(await screen.findByText('Verificada')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Verificar la/ })).not.toBeInTheDocument();
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('si verificar falla (el nº cambió), el diálogo sigue abierto con el error', async () => {
      mockRole = 'ADMIN';
      mockedList.mockResolvedValue([coverage()]);
      mockedVerify.mockRejectedValue(
        new ApiError(
          409,
          'El pagador o el nº de afiliado de esta cobertura cambió mientras lo revisabas: vuelve a abrirla y compruébalo.',
        ),
      );
      renderSection();
      const user = setupUser();
      await user.click(
        await screen.findByRole('button', { name: 'Verificar la cobertura de Sanitas' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Verificar cobertura' });
      await user.click(within(dialog).getByRole('button', { name: 'Verificar' }));
      expect(
        await within(dialog).findByText(
          'El pagador o el nº de afiliado de esta cobertura cambió mientras lo revisabas: vuelve a abrirla y compruébalo.',
        ),
      ).toBeInTheDocument();
    });

    it('tras un 409 recarga la lista: al reabrir enseña y verifica el nº nuevo', async () => {
      mockRole = 'ADMIN';
      const changed = coverage({ memberNumber: '88123499' });
      mockedList.mockResolvedValueOnce([coverage()]).mockResolvedValue([changed]);
      mockedVerify
        .mockRejectedValueOnce(
          new ApiError(
            409,
            'El pagador o el nº de afiliado de esta cobertura cambió mientras lo revisabas: vuelve a abrirla y compruébalo.',
          ),
        )
        .mockResolvedValueOnce({ ...changed, verifiedAt: '2026-10-20T15:00:00.000Z' });
      renderSection();
      const user = setupUser();
      await user.click(
        await screen.findByRole('button', { name: 'Verificar la cobertura de Sanitas' }),
      );
      let dialog = await screen.findByRole('dialog', { name: 'Verificar cobertura' });
      await user.click(within(dialog).getByRole('button', { name: 'Verificar' }));
      await within(dialog).findByText(/cambió mientras lo revisabas/);
      await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Verificar cobertura' })).not.toBeInTheDocument(),
      );

      await user.click(
        await screen.findByRole('button', { name: 'Verificar la cobertura de Sanitas' }),
      );
      dialog = await screen.findByRole('dialog', { name: 'Verificar cobertura' });
      expect(dialog).toHaveTextContent('el nº de afiliado 88123499 es de este paciente');
      await user.click(within(dialog).getByRole('button', { name: 'Verificar' }));
      await waitFor(() =>
        expect(mockedVerify).toHaveBeenLastCalledWith('tok', 'p1', 'c1', '88123499'),
      );
    });

    it('sin nº no ofrece verificar', async () => {
      mockRole = 'ADMIN';
      mockedList.mockResolvedValue([coverage({ memberNumber: null })]);
      renderSection();
      await screen.findByTestId('coverage-row');
      expect(screen.queryByRole('button', { name: /^Verificar/ })).not.toBeInTheDocument();
    });
  });
});
