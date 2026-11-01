import { fireEvent, render, screen } from '@testing-library/react';
import { MfaLoginStep } from './mfa-login-step';

function setup(props: Partial<React.ComponentProps<typeof MfaLoginStep>> = {}) {
  const onSubmit = jest.fn();
  render(
    <MfaLoginStep submitting={false} error={null} onSubmit={onSubmit} onBack={jest.fn()} {...props} />,
  );
  return { onSubmit };
}

describe('MfaLoginStep (DX-021)', () => {
  it('manda el código normalizado', () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText('Código de verificación'), {
      target: { value: '123 456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(onSubmit).toHaveBeenCalledWith({ code: '123456' });
  });

  it('un código mal formado no se envía y lo dice', () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('El código tiene 6 dígitos.')).toBeInTheDocument();
  });

  it('sin el móvil: acepta un código de recuperación y lo canoniza', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: /código de recuperación/ }));
    fireEvent.change(screen.getByLabelText('Código de recuperación'), {
      target: { value: 'abcd efgh 2345 6723' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(onSubmit).toHaveBeenCalledWith({ recoveryCode: 'ABCD-EFGH-2345-6723' });
  });

  it('en espera por intentos no envía', () => {
    const { onSubmit } = setup({ locked: true });
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
