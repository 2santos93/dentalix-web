import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AcceptInvitationForm } from './accept-invitation-form';
import { getPublicInvitation, acceptInvitation } from '../../lib/staff/invitations-api';
import { ApiError } from '../../lib/api/client';

const push = jest.fn();
const setTokens = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/staff/invitations-api', () => ({
  getPublicInvitation: jest.fn(),
  acceptInvitation: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));
jest.mock('../../lib/auth/auth-store', () => ({
  useAuthStore: (selector: (s: { setTokens: jest.Mock }) => unknown) =>
    selector({ setTokens }),
}));

describe('AcceptInvitationForm', () => {
  beforeEach(() => {
    push.mockReset();
    setTokens.mockReset();
    (acceptInvitation as jest.Mock).mockReset();
  });

  it('crea contraseña para un usuario nuevo, guarda tokens y navega a /patients', async () => {
    (getPublicInvitation as jest.Mock).mockResolvedValueOnce({
      status: 'VALID',
      clinicName: 'Sonrisa Dental',
      role: 'DENTIST',
      maskedEmail: 'j***@example.com',
      userExists: false,
    });
    (acceptInvitation as jest.Mock).mockResolvedValueOnce({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    render(<AcceptInvitationForm inviteToken="tok-1" />);

    expect(await screen.findByText('Sonrisa Dental')).toBeInTheDocument();
    expect(screen.getByText(/odont/i)).toBeInTheDocument();
    expect(screen.getByText(/crea tu contraseña/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'newpassword1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /aceptar invitación/i }));

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(1));
    expect(acceptInvitation).toHaveBeenCalledWith('tok-1', 'newpassword1');
    expect(setTokens).toHaveBeenCalledWith({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(push).toHaveBeenCalledWith('/patients');
  });

  it('pide la contraseña de Dentalix para un usuario existente', async () => {
    (getPublicInvitation as jest.Mock).mockResolvedValueOnce({
      status: 'VALID',
      clinicName: 'Sonrisa Dental',
      role: 'ADMIN',
      maskedEmail: 'a***@example.com',
      userExists: true,
    });

    render(<AcceptInvitationForm inviteToken="tok-2" />);

    expect(await screen.findByText(/tu contraseña de dentalix/i)).toBeInTheDocument();
    expect(screen.queryByText(/crea tu contraseña/i)).not.toBeInTheDocument();
  });

  it.each([
    ['EXPIRED', /expir/i],
    ['USED', /utiliz|usad/i],
    ['REVOKED', /revoc/i],
    ['NOT_FOUND', /no encontramos|no encontrada/i],
  ])('muestra un mensaje propio para %s y no renderiza el formulario', async (status, pattern) => {
    (getPublicInvitation as jest.Mock).mockResolvedValueOnce({ status });

    render(<AcceptInvitationForm inviteToken="tok-3" />);

    expect((await screen.findAllByText(pattern)).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /inicia sesión/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('un fallo al verificar la invitación se puede reintentar y el error desaparece al cargar', async () => {
    (getPublicInvitation as jest.Mock).mockRejectedValueOnce(new ApiError(500, 'Fallo el servidor.'));
    (getPublicInvitation as jest.Mock).mockResolvedValueOnce({
      status: 'VALID',
      clinicName: 'Sonrisa Dental',
      role: 'DENTIST',
      maskedEmail: 'j***@example.com',
      userExists: false,
    });

    render(<AcceptInvitationForm inviteToken="tok-5" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo el servidor.');
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    // The load error must clear and the actual content take its place — not
    // both, and not neither (the "loads but stays invisible" bug this
    // project already hit once).
    expect(await screen.findByText('Sonrisa Dental')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra el error verbatim de una contraseña incorrecta sin guardar tokens', async () => {
    (getPublicInvitation as jest.Mock).mockResolvedValueOnce({
      status: 'VALID',
      clinicName: 'Sonrisa Dental',
      role: 'DENTIST',
      maskedEmail: 'j***@example.com',
      userExists: true,
    });
    (acceptInvitation as jest.Mock).mockRejectedValueOnce(
      new ApiError(401, 'Contraseña incorrecta'),
    );

    render(<AcceptInvitationForm inviteToken="tok-4" />);

    fireEvent.change(await screen.findByLabelText(/contraseña/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /aceptar invitación/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Contraseña incorrecta');
    expect(setTokens).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
