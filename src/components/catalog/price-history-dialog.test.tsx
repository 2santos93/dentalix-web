import { render, screen, within } from '@testing-library/react';
import { ApiError } from '@/lib/api/api-error';
import { STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { setupUser } from '@/lib/test/user';
import { listCatalogPriceHistory } from '@/lib/catalog/price-changes-api';
import { PriceHistoryDialog } from './price-history-dialog';

jest.mock('../../lib/catalog/price-changes-api', () => ({
  ...jest.requireActual('../../lib/catalog/price-changes-api'),
  listCatalogPriceHistory: jest.fn(),
}));

const mockedHistory = jest.mocked(listCatalogPriceHistory);

function renderDialog() {
  return render(
    <PriceHistoryDialog
      open
      onOpenChange={jest.fn()}
      token="tok"
      item={{ id: 'i1', labelEs: 'Profilaxis' }}
      currency="VES"
      stamp={testStamp([STAMP_SEDES.caracas])}
    />,
  );
}

describe('PriceHistoryDialog (DX-205)', () => {
  beforeEach(() => mockedHistory.mockReset());

  it('lista cada cambio con autor, fecha y origen (lote o edición)', async () => {
    mockedHistory.mockResolvedValue([
      {
        id: 'h2',
        previousPrice: 1840,
        newPrice: 1900,
        batchId: 'b1',
        actorUserId: 'u1',
        actorName: 'Dra. Admin',
        createdAt: '2027-01-05T15:00:00.000Z',
      },
      {
        id: 'h1',
        previousPrice: null,
        newPrice: 1840,
        batchId: null,
        actorUserId: 'u2',
        actorName: 'Dr. Owner',
        createdAt: '2026-12-01T15:00:00.000Z',
      },
    ]);
    renderDialog();
    const table = await screen.findByRole('table', { name: 'Cambios de precio' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Dra. Admin');
    expect(rows[1]).toHaveTextContent('Actualización en bloque');
    expect(rows[2]).toHaveTextContent('Sin precio');
    expect(rows[2]).toHaveTextContent('Edición');
  });

  it('sin cambios: estado vacío', async () => {
    mockedHistory.mockResolvedValue([]);
    renderDialog();
    expect(await screen.findByText('Sin cambios de precio')).toBeInTheDocument();
  });

  it('un fallo se reintenta desde la sección', async () => {
    mockedHistory.mockRejectedValueOnce(new ApiError(500, 'x')).mockResolvedValueOnce([]);
    const user = setupUser();
    renderDialog();
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin cambios de precio')).toBeInTheDocument();
  });
});
