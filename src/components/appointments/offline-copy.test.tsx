import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineCopyControl, offlineCopyText } from './offline-copy';

const mockStatus = jest.fn();
const mockEnable = jest.fn();
const mockDecline = jest.fn();
const mockRemove = jest.fn();
let mockDeclined = false;
jest.mock('../../lib/offline/offline-agenda', () => ({
  offlineCopyStatus: (...a: unknown[]) => mockStatus(...a),
  enableOfflineCopy: (...a: unknown[]) => mockEnable(...a),
  declineOfflineCopy: (...a: unknown[]) => mockDecline(...a),
  removeOfflineCopy: (...a: unknown[]) => mockRemove(...a),
  offlineCopyDeclined: () => mockDeclined,
  unlockOfflineCopy: jest.fn(),
  onOfflineCopyChange: () => () => undefined,
}));

describe('OfflineCopyControl (DX-405)', () => {
  beforeEach(() => {
    mockDeclined = false;
    mockStatus.mockReset().mockResolvedValue('off');
    mockEnable.mockReset().mockResolvedValue(true);
    mockDecline.mockReset();
    mockRemove.mockReset().mockResolvedValue(undefined);
  });

  it('ofrece activar la copia; el diálogo valida el PIN y lo guarda', async () => {
    const user = userEvent.setup();
    render(<OfflineCopyControl token="tok" />);
    await user.click(await screen.findByRole('button', { name: offlineCopyText.activate }));
    const dialog = await screen.findByRole('dialog', { name: offlineCopyText.setupTitle });
    expect(dialog).toBeInTheDocument();

    await user.type(screen.getByLabelText(offlineCopyText.pin), '12');
    await user.click(screen.getByRole('button', { name: offlineCopyText.save }));
    expect(await screen.findByText(offlineCopyText.pinInvalid)).toBeInTheDocument();
    expect(mockEnable).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(offlineCopyText.pin), '34');
    await user.type(screen.getByLabelText(offlineCopyText.pinRepeat), '9999');
    await user.click(screen.getByRole('button', { name: offlineCopyText.save }));
    expect(await screen.findByText(offlineCopyText.pinMismatch)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(offlineCopyText.pinRepeat));
    await user.type(screen.getByLabelText(offlineCopyText.pinRepeat), '1234');
    await user.click(screen.getByRole('button', { name: offlineCopyText.save }));
    expect(mockEnable).toHaveBeenCalledWith('tok', '1234');
  });

  it('«Ahora no» no la vuelve a ofrecer, pero deja activarla', async () => {
    const user = userEvent.setup();
    render(<OfflineCopyControl token="tok" />);
    await user.click(await screen.findByRole('button', { name: offlineCopyText.notNow }));
    expect(mockDecline).toHaveBeenCalledWith('tok');
    expect(screen.queryByRole('button', { name: offlineCopyText.activate })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: offlineCopyText.enable })).toBeInTheDocument();
  });

  it('activa: lo dice y deja quitarla', async () => {
    mockStatus.mockResolvedValue('ready');
    const user = userEvent.setup();
    render(<OfflineCopyControl token="tok" />);
    expect(await screen.findByText(offlineCopyText.activeLine)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: offlineCopyText.remove }));
    expect(mockRemove).toHaveBeenCalledWith('tok');
  });

  it('bloqueada en la pestaña: ofrece desbloquearla con el PIN', async () => {
    mockStatus.mockResolvedValue('locked');
    const user = userEvent.setup();
    render(<OfflineCopyControl token="tok" />);
    await user.click(await screen.findByRole('button', { name: offlineCopyText.unlock }));
    expect(await screen.findByRole('dialog', { name: offlineCopyText.unlockTitle })).toBeInTheDocument();
  });
});
