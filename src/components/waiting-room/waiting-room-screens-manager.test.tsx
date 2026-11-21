import { render, screen, waitFor, within } from '@testing-library/react';
import { WaitingRoomScreensManager, screensManagerCopy as copy } from './waiting-room-screens-manager';
import { screenFormCopy as formCopy } from './waiting-room-screen-form-modal';
import {
  createWaitingRoomScreen,
  listWaitingRoomScreens,
  revokeWaitingRoomScreen,
  updateWaitingRoomScreen,
  type WaitingRoomScreen,
} from '@/lib/waiting-room/waiting-room-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/waiting-room/waiting-room-api', () => ({
  ...jest.requireActual('../../lib/waiting-room/waiting-room-api'),
  listWaitingRoomScreens: jest.fn(),
  createWaitingRoomScreen: jest.fn(),
  updateWaitingRoomScreen: jest.fn(),
  revokeWaitingRoomScreen: jest.fn(),
}));
jest.mock('../../lib/locations/sede-stamp', () => ({
  useSedeStamp: () => ({ date: () => '20/11/2026' }),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, title }: { value: string; title: string }) => (
    <svg data-testid="qr" data-value={value} aria-label={title} />
  ),
}));

const mockedList = listWaitingRoomScreens as jest.MockedFunction<typeof listWaitingRoomScreens>;
const mockedCreate = createWaitingRoomScreen as jest.MockedFunction<typeof createWaitingRoomScreen>;
const mockedUpdate = updateWaitingRoomScreen as jest.MockedFunction<typeof updateWaitingRoomScreen>;
const mockedRevoke = revokeWaitingRoomScreen as jest.MockedFunction<typeof revokeWaitingRoomScreen>;

const chacao = { id: 'chacao', name: 'Sede Chacao' } as ClinicLocation;
const altamira = { id: 'altamira', name: 'Sede Altamira' } as ClinicLocation;

function screenOf(partial: Partial<WaitingRoomScreen> & { id: string; name: string }): WaitingRoomScreen {
  return {
    locationId: 'chacao',
    nameMode: 'NAME_INITIAL',
    messages: [],
    soundEnabled: false,
    revokedAt: null,
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...partial,
  };
}

const recepcion = screenOf({ id: 's1', name: 'Televisor recepción', messages: ['Horario: 8:00 a 17:00'] });
const vieja = screenOf({ id: 's0', name: 'Televisor viejo', revokedAt: '2026-11-20T15:00:00.000Z' });

function renderManager(opts: { allowed?: boolean; locations?: ClinicLocation[] } = {}) {
  return render(
    <WaitingRoomScreensManager
      token="tok"
      allowed={opts.allowed ?? true}
      locations={opts.locations ?? [chacao, altamira]}
      initialLocationId="chacao"
    />,
  );
}

describe('WaitingRoomScreensManager (DX-588)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lista las activas de la sede y aparte las revocadas, con la ayuda de instalación', async () => {
    mockedList.mockResolvedValue([recepcion, vieja]);
    renderManager();
    const active = await screen.findByRole('table', { name: copy.tableLabel });
    expect(within(active).getByText('Televisor recepción')).toBeInTheDocument();
    expect(within(active).getByText('Nombre e inicial')).toBeInTheDocument();
    expect(within(active).queryByText('Televisor viejo')).toBeNull();
    const revokedTable = screen.getByRole('table', { name: copy.revokedTableLabel });
    expect(within(revokedTable).getByText('Revocada el 20/11/2026')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', 'chacao');
    expect(screen.getByRole('heading', { name: copy.helpTitle })).toBeInTheDocument();
    expect(screen.getByText(/Fully Kiosk Browser/)).toBeInTheDocument();
    expect(screen.getByText(/No lo transmitas desde el ordenador de recepción/)).toBeInTheDocument();
  });

  it('cambia de sede con el selector (solo si hay varias)', async () => {
    mockedList.mockResolvedValue([]);
    const user = setupUser();
    const { unmount } = renderManager();
    await screen.findByText(copy.empty);
    await user.selectOptions(screen.getByLabelText(copy.location), 'altamira');
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', 'altamira'));
    unmount();
    renderManager({ locations: [chacao] });
    await screen.findAllByText(copy.empty);
    expect(screen.queryByLabelText(copy.location)).toBeNull();
  });

  it('crear: el enlace entero sale UNA vez, con copiar y QR, y no queda en la lista', async () => {
    mockedList.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({
      ...screenOf({ id: 's2', name: 'Sala principal', nameMode: 'TURN_NUMBER', soundEnabled: true }),
      token: 'tok_secreto_123',
    });
    const user = setupUser();
    // Después de `setupUser`, que pone su propio portapapeles.
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderManager();
    await user.click(await screen.findByRole('button', { name: copy.newScreen }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(formCopy.name), 'Sala principal');
    await user.click(within(dialog).getByRole('radio', { name: new RegExp(formCopy.turnNumber) }));
    await user.click(within(dialog).getByRole('button', { name: formCopy.addMessage }));
    await user.type(within(dialog).getByLabelText(formCopy.messageLabel(1)), 'Wifi: Clinica-Invitados');
    await user.click(within(dialog).getByRole('button', { name: formCopy.addMessage }));
    // Un mensaje vacío no se manda.
    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(formCopy.sound) }));
    await user.click(within(dialog).getByRole('button', { name: formCopy.create }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        locationId: 'chacao',
        name: 'Sala principal',
        nameMode: 'TURN_NUMBER',
        messages: ['Wifi: Clinica-Invitados'],
        soundEnabled: true,
      }),
    );
    const url = `${window.location.origin}/sala/tok_secreto_123`;
    expect(await within(dialog).findByTestId('waiting-room-screen-url')).toHaveValue(url);
    expect(within(dialog).getByText(formCopy.onceTitle)).toBeInTheDocument();
    expect(within(dialog).getByTestId('qr')).toHaveAttribute('data-value', url);
    await user.click(within(dialog).getByRole('button', { name: formCopy.copyLink }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await within(dialog).findByText(formCopy.copied)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: formCopy.done }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/tok_secreto_123/)).toBeNull();
    expect(
      within(screen.getByRole('table', { name: copy.tableLabel })).getByText('Sala principal'),
    ).toBeInTheDocument();
  });

  it('nombre obligatorio: no llama a la API', async () => {
    mockedList.mockResolvedValue([]);
    const user = setupUser();
    renderManager();
    await user.click(await screen.findByRole('button', { name: copy.newScreen }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: formCopy.create }));
    expect(await within(dialog).findByText(formCopy.invalidName)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('editar nombre, modo, mensajes y sonido', async () => {
    mockedList.mockResolvedValue([recepcion]);
    mockedUpdate.mockResolvedValue({ ...recepcion, name: 'Televisor entrada', messages: [] });
    const user = setupUser();
    renderManager();
    await user.click(await screen.findByRole('button', { name: 'Acciones de Televisor recepción' }));
    await user.click(await screen.findByRole('menuitem', { name: copy.edit }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(formCopy.messageLabel(1))).toHaveValue('Horario: 8:00 a 17:00');
    // Editar no deja cambiar de sede.
    expect(within(dialog).queryByLabelText(formCopy.location)).toBeNull();
    await user.clear(within(dialog).getByLabelText(formCopy.name));
    await user.type(within(dialog).getByLabelText(formCopy.name), 'Televisor entrada');
    await user.click(within(dialog).getByRole('button', { name: formCopy.removeMessage(1) }));
    await user.click(within(dialog).getByRole('button', { name: formCopy.save }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 's1', {
        name: 'Televisor entrada',
        nameMode: 'NAME_INITIAL',
        messages: [],
        soundEnabled: false,
      }),
    );
    expect(await screen.findByText('Televisor entrada')).toBeInTheDocument();
  });

  it('revocar pide confirmación con el aviso del televisor y la pasa a «Revocadas»', async () => {
    mockedList.mockResolvedValue([recepcion]);
    mockedRevoke.mockResolvedValue({ ...recepcion, revokedAt: '2026-11-20T16:00:00.000Z' });
    const user = setupUser();
    renderManager();
    await user.click(await screen.findByRole('button', { name: 'Acciones de Televisor recepción' }));
    await user.click(await screen.findByRole('menuitem', { name: copy.revoke }));
    const confirm = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(confirm).getByText(/Esta pantalla ya no está activa/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: copy.revokeConfirm }));
    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledWith('tok', 's1'));
    const revokedTable = await screen.findByRole('table', { name: copy.revokedTableLabel });
    expect(within(revokedTable).getByText('Televisor recepción')).toBeInTheDocument();
    expect(screen.getByText(copy.empty)).toBeInTheDocument();
  });

  it('sin permiso: aviso y sin llamadas', () => {
    renderManager({ allowed: false });
    expect(screen.getByText(copy.forbiddenTitle)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });
});
