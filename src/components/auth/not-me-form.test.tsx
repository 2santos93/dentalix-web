import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { notMe } from '@/lib/auth/sessions-api';
import { NotMeForm } from './not-me-form';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
jest.mock('../../lib/auth/sessions-api', () => ({ notMe: jest.fn() }));
const mockedNotMe = notMe as jest.MockedFunction<typeof notMe>;

beforeEach(() => jest.clearAllMocks());

describe('NotMeForm (DX-137)', () => {
  it('no hace nada al abrir: solo al pulsar, y lleva a cambiar la contraseña', async () => {
    const user = userEvent.setup();
    mockedNotMe.mockResolvedValue({ passwordResetToken: 'reset-tok' });
    render(<NotMeForm token="alert-tok" />);
    expect(mockedNotMe).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cerrar todas mis sesiones' }));
    expect(mockedNotMe).toHaveBeenCalledWith('alert-tok');
    expect(replace).toHaveBeenCalledWith('/restablecer/reset-tok?sesiones-cerradas=1');
  });

  it('enlace caducado o usado: lo dice y ofrece cambiar la contraseña', async () => {
    const user = userEvent.setup();
    mockedNotMe.mockRejectedValue(new ApiError(404, 'Este enlace ya no es válido'));
    render(<NotMeForm token="alert-tok" />);
    await user.click(screen.getByRole('button', { name: 'Cerrar todas mis sesiones' }));
    expect(await screen.findByText('Este enlace ya no es válido')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cambiar mi contraseña' })).toHaveAttribute('href', '/olvide-contrasena');
  });

  it('sin enlace de restablecimiento (ya no es miembro): confirma el cierre', async () => {
    const user = userEvent.setup();
    mockedNotMe.mockResolvedValue({ passwordResetToken: null });
    render(<NotMeForm token="alert-tok" />);
    await user.click(screen.getByRole('button', { name: 'Cerrar todas mis sesiones' }));
    expect(await screen.findByText('Cerramos todas tus sesiones.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
