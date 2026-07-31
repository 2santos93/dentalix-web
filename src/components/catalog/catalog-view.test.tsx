import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogView } from './catalog-view';
import { listCatalogItems, createCatalogItem } from '@/lib/odontogram/catalog-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC transform
// (only real import/require specifiers are) — use a relative path here, same
// convention as staff-view.test.tsx / agenda-view.test.tsx.
jest.mock('../../lib/odontogram/catalog-api', () => ({
  listCatalogItems: jest.fn(),
  createCatalogItem: jest.fn(),
}));

const mockedList = listCatalogItems as jest.MockedFunction<typeof listCatalogItems>;
const mockedCreate = createCatalogItem as jest.MockedFunction<typeof createCatalogItem>;

const item1 = {
  id: 'c1',
  tenantId: 't1',
  code: 'PROF',
  category: 'Preventiva',
  kind: 'PROCEDURE' as const,
  labelEs: 'Profilaxis',
  labelEn: null,
  labelPt: null,
  color: '#0E7490',
  defaultPrice: 80000,
  active: true,
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};

describe('CatalogView', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
  });

  it('renders catalog rows from listCatalogItems', async () => {
    mockedList.mockResolvedValue([item1]);

    render(<CatalogView token="tok" />);

    const table = await screen.findByRole('table', { name: /catálogo/i });
    expect(within(table).getByText('Profilaxis')).toBeInTheDocument();
    expect(within(table).getByText('PROF')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + 1 item
  });

  it('submitting the add form calls createCatalogItem with the right payload and refreshes', async () => {
    mockedList.mockResolvedValueOnce([]);
    mockedCreate.mockResolvedValue(item1);
    mockedList.mockResolvedValueOnce([item1]);

    const user = userEvent.setup();
    render(<CatalogView token="tok" />);

    // Empty state first.
    await screen.findByText(/el catálogo todavía está vacío/i);

    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    await user.type(screen.getByLabelText(/^nombre$/i), 'Profilaxis');
    await user.type(screen.getByLabelText(/^código$/i), 'PROF');
    await user.type(screen.getByLabelText(/precio por defecto/i), '80000');

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        code: 'PROF',
        kind: 'PROCEDURE',
        labelEs: 'Profilaxis',
        color: '#0E7490',
        defaultPrice: 80000,
      }),
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Profilaxis')).toBeInTheDocument();
  });
});
