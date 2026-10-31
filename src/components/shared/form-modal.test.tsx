import { render, screen } from '@testing-library/react';
import { FormModal } from './form-modal';

describe('FormModal submitHint', () => {
  it('asocia el motivo visible a la acción deshabilitada y lo retira cuando deja de aplicar', () => {
    const props = { open: true, onOpenChange: jest.fn(), title: 'Receta', onSubmit: jest.fn() };
    const { rerender } = render(<FormModal {...props} submitDisabled submitHint="Confirma los avisos.">Campos</FormModal>);
    const submit = screen.getByRole('button', { name: 'Guardar' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription('Confirma los avisos.');
    expect(screen.getByText('Confirma los avisos.')).toBeVisible();
    rerender(<FormModal {...props}>Campos</FormModal>);
    expect(submit).toBeEnabled();
    expect(submit).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Confirma los avisos.')).not.toBeInTheDocument();
  });
});

describe('FormModal submitHint: hueco estable', () => {
  const props = { open: true, onOpenChange: jest.fn(), title: 'Receta', onSubmit: jest.fn() };

  it('con submitHint (aunque sea null) conserva el mismo hueco reservado y solo asocia texto real', () => {
    const { rerender } = render(<FormModal {...props} submitDisabled submitHint="Espera la comprobación.">Campos</FormModal>);
    const hint = screen.getByText('Espera la comprobación.');
    // Reserva dos líneas en móvil y una desde sm: aparecer o vaciarse no mueve el pie.
    expect(hint).toHaveClass('min-h-10', 'sm:min-h-5');
    rerender(<FormModal {...props} submitHint={null}>Campos</FormModal>);
    expect(hint).toBeInTheDocument();
    expect(hint).toBeEmptyDOMElement();
    expect(hint).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Guardar' })).not.toHaveAttribute('aria-describedby');
    rerender(<FormModal {...props} submitDisabled submitHint="Confirma los avisos.">Campos</FormModal>);
    expect(hint).toHaveTextContent('Confirma los avisos.');
    expect(hint).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAccessibleDescription('Confirma los avisos.');
  });

  it('sin la prop no reserva hueco: los demás formularios no cambian', () => {
    render(<FormModal {...props}>Campos</FormModal>);
    expect(screen.getByRole('dialog').querySelector('form > div:last-child > p')).toBeNull();
  });
});

describe('FormModal errorRetry (QA DX-470)', () => {
  const props = { open: true, onOpenChange: jest.fn(), title: 'Urgencia', onSubmit: jest.fn() };

  it('el banner ofrece «Reintentar» solo si se pide; deshabilitado mientras envía', () => {
    const onRetry = jest.fn();
    const { rerender } = render(<FormModal {...props} error="Sin conexión">Campos</FormModal>);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    rerender(
      <FormModal {...props} error="Sin conexión" errorRetry={{ label: 'Reintentar', onRetry }}>
        Campos
      </FormModal>,
    );
    screen.getByRole('button', { name: 'Reintentar' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
    rerender(
      <FormModal {...props} submitting error="Sin conexión" errorRetry={{ label: 'Reintentar', onRetry }}>
        Campos
      </FormModal>,
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDisabled();
  });
});
