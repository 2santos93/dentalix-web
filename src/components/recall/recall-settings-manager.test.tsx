import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { listRecallSettings, updateRecallSettings, type LocationRecallSettings } from '@/lib/recall/recall-attempts-api';
import { RecallSettingsManager, recallSettingsManagerCopy as copy } from './recall-settings-manager';
import { recallSettingsModalCopy as modalCopy } from './recall-settings-modal';

jest.mock('../../lib/recall/recall-attempts-api', () => ({
  ...jest.requireActual('../../lib/recall/recall-attempts-api'),
  listRecallSettings: jest.fn(),
  updateRecallSettings: jest.fn(),
}));
const mockedList = jest.mocked(listRecallSettings);
const mockedUpdate = jest.mocked(updateRecallSettings);

const sede = (over: Partial<LocationRecallSettings> = {}): LocationRecallSettings => ({
  locationId: 'l1',
  locationName: 'Sede Chacao',
  hideDays: 7,
  maxAttempts: 3,
  updatedAt: null,
  ...over,
});

describe('Ajustes › Recall › Intentos de llamada (DX-465)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedUpdate.mockReset();
  });

  it('una fila por sede con sus días y su tope; sin configurar, «Por defecto»', async () => {
    mockedList.mockResolvedValue([
      sede(),
      sede({ locationId: 'l2', locationName: 'Sede Maracaibo', hideDays: 1, maxAttempts: 5, updatedAt: '2026-11-10T12:00:00Z' }),
    ]);
    render(<RecallSettingsManager token="tok" />);
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    const [chacao, maracaibo] = within(table).getAllByRole('row').slice(1);
    expect(chacao).toHaveTextContent('Sede Chacao');
    expect(chacao).toHaveTextContent('7 días');
    expect(chacao).toHaveTextContent('3 intentos');
    expect(within(chacao).getByText(copy.isDefault)).toBeInTheDocument();
    expect(maracaibo).toHaveTextContent('1 día');
    expect(maracaibo).toHaveTextContent('5 intentos');
    expect(within(maracaibo).queryByText(copy.isDefault)).toBeNull();
  });

  it('error de carga con «Reintentar»', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue([sede()]);
    render(<RecallSettingsManager token="tok" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sede Chacao')).toBeInTheDocument();
  });

  it('edita una sede: valida como la API junto al campo, guarda y la fila cambia', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([sede()]);
    mockedUpdate.mockResolvedValue(sede({ hideDays: 10, maxAttempts: 1, updatedAt: '2026-11-19T12:00:00Z' }));
    render(<RecallSettingsManager token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Sede Chacao/ }));
    const dialog = await screen.findByRole('dialog', { name: modalCopy.title('Sede Chacao') });
    const hide = within(dialog).getByLabelText(modalCopy.hideDays);
    const max = within(dialog).getByLabelText(modalCopy.maxAttempts);
    expect(hide).toHaveValue(7);
    await user.clear(hide);
    await user.type(hide, '91');
    await user.clear(max);
    await user.type(max, '0');
    await user.click(within(dialog).getByRole('button', { name: modalCopy.save }));
    expect(await within(dialog).findByText(modalCopy.hideDaysError)).toBeInTheDocument();
    expect(within(dialog).getByText(modalCopy.maxAttemptsError)).toBeInTheDocument();
    expect(hide).toHaveFocus();
    expect(mockedUpdate).not.toHaveBeenCalled();

    await user.clear(hide);
    await user.type(hide, '10');
    await user.clear(max);
    await user.type(max, '1');
    await user.click(within(dialog).getByRole('button', { name: modalCopy.save }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', { hideDays: 10, maxAttempts: 1 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('table', { name: copy.tableLabel })).toHaveTextContent('10 días');
    expect(screen.getByText(copy.saved('Sede Chacao'))).toBeInTheDocument();
  });

  it('un 400 de la API va junto a su campo', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([sede()]);
    mockedUpdate.mockRejectedValue(new ApiError(400, 'El tope de intentos va de 1 a 10.'));
    render(<RecallSettingsManager token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Sede Chacao/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: modalCopy.save }));
    const max = within(dialog).getByLabelText(modalCopy.maxAttempts);
    await waitFor(() => expect(max).toHaveAttribute('aria-invalid', 'true'));
    expect(max).toHaveFocus();
  });
});
