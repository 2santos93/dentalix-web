import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { notMe } from '@/lib/auth/sessions-api';
import { NotMeForm } from './not-me-form';

jest.mock('../../lib/auth/sessions-api', () => ({ notMe: jest.fn() }));
const mockedNotMe = notMe as jest.MockedFunction<typeof notMe>;

beforeEach(() => jest.clearAllMocks());

describe('NotMeForm (DX-137)', () => {
  it('no hace nada al abrir: solo al pulsar; luego dice que el enlace va al correo', async () => {
    const user = userEvent.setup();
    mockedNotMe.mockResolvedValue({ message: 'Cerramos todas tus sesiones.' });
    render(<NotMeForm token="alert-tok" />);
    expect(mockedNotMe).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cerrar todas mis sesiones' }));
    expect(mockedNotMe).toHaveBeenCalledWith('alert-tok');
    expect(await screen.findByText('Cerramos todas tus sesiones.')).toBeInTheDocument();
    expect(screen.getByText(/Te enviamos un enlace a tu correo/)).toBeInTheDocument();
  });

  it('enlace caducado o usado: lo dice y ofrece cambiar la contraseña', async () => {
    const user = userEvent.setup();
    mockedNotMe.mockRejectedValue(new ApiError(404, 'Este enlace ya no es válido'));
    render(<NotMeForm token="alert-tok" />);
    await user.click(screen.getByRole('button', { name: 'Cerrar todas mis sesiones' }));
    expect(await screen.findByText('Este enlace ya no es válido')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cambiar mi contraseña' })).toHaveAttribute('href', '/olvide-contrasena');
  });
});
