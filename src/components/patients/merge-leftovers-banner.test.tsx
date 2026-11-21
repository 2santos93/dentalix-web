import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import {
  listMergeLeftovers,
  moveMergeLeftovers,
  type MergeLeftover,
  type MergeLeftoversResult,
} from '@/lib/patients/patient-merge-api';
import { STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { MergeLeftoversBanner, mergeLeftoversCopy as copy } from './merge-leftovers-banner';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() } }));
jest.mock('../../lib/patients/patient-merge-api', () => ({
  ...jest.requireActual('../../lib/patients/patient-merge-api'),
  listMergeLeftovers: jest.fn(),
  moveMergeLeftovers: jest.fn(),
}));
const mockedList = listMergeLeftovers as jest.MockedFunction<typeof listMergeLeftovers>;
const mockedMove = moveMergeLeftovers as jest.MockedFunction<typeof moveMergeLeftovers>;

const stamp = testStamp([STAMP_SEDES.caracas]);

const leftover = (over: Partial<MergeLeftover> = {}): MergeLeftover => ({
  absorbedPatientId: 'abs-1',
  patientCode: '42',
  firstName: 'Luis',
  lastName: 'Rodríguez',
  mergedAt: '2026-11-18T14:00:00.000Z',
  tables: [
    { table: 'appointments', count: 1 },
    { table: 'patients', count: 1 },
  ],
  categories: [
    { category: 'appointments', count: 1 },
    { category: 'other', count: 1 },
  ],
  total: 2,
  ...over,
});

const result = (over: Partial<MergeLeftoversResult> = {}): MergeLeftoversResult => ({
  patientId: 'kept-1',
  absorbedPatientId: 'abs-1',
  moved: [{ table: 'appointments', count: 1 }],
  resolved: [{ kind: 'referralsMoved', count: 1 }],
  revokedLinks: { total: 0 } as MergeLeftoversResult['revokedLinks'],
  ...over,
});

function renderBanner(onMoved = jest.fn()) {
  render(<MergeLeftoversBanner token="tok" patientId="kept-1" stamp={stamp} onMoved={onMoved} />);
  return onMoved;
}

describe('MergeLeftoversBanner (DX-266-bis)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedMove.mockReset();
    (toast.success as jest.Mock).mockReset();
  });

  it('sin nada pendiente no pinta nada', async () => {
    mockedList.mockResolvedValue([]);
    renderBanner();
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith('tok', 'kept-1'));
    expect(screen.queryByTestId('merge-leftovers-banner')).not.toBeInTheDocument();
  });

  it('un 403 (no es ADMIN) no pinta nada', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'Prohibido'));
    renderBanner();
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(screen.queryByTestId('merge-leftovers-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con algo pendiente: el aviso dice cuánto y de quién, y lo que hay', async () => {
    mockedList.mockResolvedValue([leftover()]);
    renderBanner();
    expect(await screen.findByRole('heading', { name: copy.title(2, 'Luis Rodríguez') })).toBeInTheDocument();
    expect(copy.title(2, 'Luis Rodríguez')).toBe(
      'Quedaron 2 registros en la ficha de Luis Rodríguez, que se fusionó con esta',
    );
    expect(screen.getByTestId('merge-leftovers-banner')).toHaveTextContent('1 cita y 1 registro más');
    expect(screen.getByRole('button', { name: copy.action })).toBeInTheDocument();
  });

  it('confirmar pasa los registros, avisa y vuelve a leer la ficha', async () => {
    mockedList.mockResolvedValue([leftover()]);
    mockedMove.mockResolvedValue(result());
    const onMoved = renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: copy.action }));
    const dialog = await screen.findByRole('dialog', { name: copy.confirmTitle });
    expect(dialog).toHaveTextContent('1 cita y 1 registro más de la ficha fusionada de Luis Rodríguez');
    await userEvent.click(screen.getByRole('button', { name: copy.confirm }));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(mockedMove).toHaveBeenCalledWith('tok', 'abs-1');
    expect(toast.success).toHaveBeenCalledWith(copy.moved(2), expect.anything());
  });

  it('si ya no quedaba nada (otra persona lo pasó), lo dice', async () => {
    mockedList.mockResolvedValue([leftover()]);
    mockedMove.mockResolvedValue(result({ moved: [], resolved: [] }));
    const onMoved = renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: copy.action }));
    await userEvent.click(await screen.findByRole('button', { name: copy.confirm }));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(copy.nothing, expect.anything());
  });

  it('un fallo al pasar deja el diálogo abierto con el mensaje de la API', async () => {
    mockedList.mockResolvedValue([leftover()]);
    mockedMove.mockRejectedValue(
      new ApiError(
        409,
        'Los dos pacientes tienen citas a la misma hora. Cancela o mueve una de ellas antes de fusionar.',
      ),
    );
    const onMoved = renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: copy.action }));
    await userEvent.click(await screen.findByRole('button', { name: copy.confirm }));
    expect(await screen.findByRole('alert')).toHaveTextContent('citas a la misma hora');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onMoved).not.toHaveBeenCalled();
  });

  it('un fallo al comprobar: aviso de error con «Reintentar» que vuelve a pedir', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'x')).mockResolvedValueOnce([]);
    renderBanner();
    const retry = await screen.findByRole('button', { name: /reintentar/i });
    await userEvent.click(retry);
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });
});
