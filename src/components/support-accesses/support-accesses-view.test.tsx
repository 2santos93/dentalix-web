import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportAccessesView } from './support-accesses-view';
import { ApiError } from '@/lib/api/client';
import {
  canReadSupportAccesses,
  listSupportAccesses,
  type SupportAccess,
} from '@/lib/support-accesses/support-accesses-api';

jest.mock('../../lib/support-accesses/support-accesses-api', () => ({
  ...jest.requireActual('../../lib/support-accesses/support-accesses-api'),
  listSupportAccesses: jest.fn(),
}));

const mockedList = listSupportAccesses as jest.MockedFunction<typeof listSupportAccesses>;

const access: SupportAccess = {
  id: 'a-1',
  userFullName: 'Soporte Dentalix',
  userEmail: 'soporte@dentalix.app',
  reason: 'Ticket #4521: la clínica no puede cerrar caja',
  ip: '203.0.113.9',
  userAgent: 'Mozilla/5.0 (Macintosh)',
  createdAt: '2026-10-16T15:00:00.000Z',
  expiresAt: '2026-10-16T15:30:00.000Z',
};

beforeEach(() => {
  mockedList.mockReset();
});

describe('SupportAccessesView (SEC-008)', () => {
  it('lista quién entró, el motivo, hasta cuándo y desde dónde', async () => {
    mockedList.mockResolvedValueOnce({ items: [access], nextCursor: null });
    render(<SupportAccessesView token="t" />);

    const table = await screen.findByRole('table', { name: 'Accesos de soporte a la clínica' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Soporte Dentalix');
    expect(row).toHaveTextContent('soporte@dentalix.app');
    expect(row).toHaveTextContent('Ticket #4521: la clínica no puede cerrar caja');
    expect(row).toHaveTextContent('203.0.113.9');
    expect(mockedList).toHaveBeenCalledWith('t', { limit: 20, cursor: null });
    // Una sola página: sin paginación.
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
  });

  it('vacío: explica qué verá aquí la clínica', async () => {
    mockedList.mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<SupportAccessesView token="t" />);
    expect(await screen.findByText('Nadie de Dentalix ha entrado a la clínica.')).toBeInTheDocument();
  });

  it('error: sección con «Reintentar» que vuelve a pedir la lista', async () => {
    mockedList
      .mockRejectedValueOnce(new ApiError(500, 'boom'))
      .mockResolvedValueOnce({ items: [access], nextCursor: null });
    render(<SupportAccessesView token="t" />);

    expect(await screen.findByText('No pudimos cargar los accesos de soporte.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('Soporte Dentalix')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('403: aviso de que solo lo ve la administración', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(403, 'Insufficient role'));
    render(<SupportAccessesView token="t" />);
    expect(
      await screen.findByText('Solo la administración de la clínica puede ver los accesos de soporte.'),
    ).toBeInTheDocument();
  });

  it('pagina con el cursor y vuelve atrás', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [access], nextCursor: 'c-2' })
      .mockResolvedValueOnce({ items: [{ ...access, id: 'a-2', userFullName: 'Otra Persona' }], nextCursor: null })
      .mockResolvedValueOnce({ items: [access], nextCursor: 'c-2' });
    render(<SupportAccessesView token="t" />);

    await userEvent.click(await screen.findByRole('button', { name: /siguiente/i }));
    expect(await screen.findByText('Otra Persona')).toBeInTheDocument();
    expect(mockedList).toHaveBeenLastCalledWith('t', { limit: 20, cursor: 'c-2' });
    expect(screen.getByText('Página 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /anterior/i }));
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('t', { limit: 20, cursor: null }));
  });

  it('solo ADMIN la puede abrir', () => {
    expect(canReadSupportAccesses('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
      expect(canReadSupportAccesses(role)).toBe(false);
    }
    expect(canReadSupportAccesses(null)).toBe(false);
  });
});
