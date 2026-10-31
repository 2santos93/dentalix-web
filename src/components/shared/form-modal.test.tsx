import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
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

describe('FormModal: validación propia antes que la del navegador', () => {
  const base = { open: true, onOpenChange: jest.fn(), title: 'Sede' };

  it('el formulario es noValidate y un radio required no bloquea el envío', async () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const user = setupUser();
    render(
      <FormModal {...base} onSubmit={onSubmit}>
        <RadioGroup id="fmt" legend="Formato" value="" onValueChange={() => {}} required>
          <RadioOption value="a" label="A" />
        </RadioGroup>
      </FormModal>,
    );
    expect(screen.getByRole('dialog').querySelector('form')).toHaveAttribute('novalidate');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('un campo de texto required sin validación propia conserva la red del navegador', async () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const user = setupUser();
    const { rerender } = render(
      <FormModal {...base} onSubmit={onSubmit}>
        <input aria-label="Nombre" required />
      </FormModal>,
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    // Con `ownValidation` el formulario decide (y pinta el error junto al campo).
    rerender(
      <FormModal {...base} onSubmit={onSubmit} ownValidation>
        <input aria-label="Nombre" required />
      </FormModal>,
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('FormModal en el teléfono', () => {
  const base = { open: true, onOpenChange: jest.fn(), title: 'Cita', onSubmit: jest.fn() };

  it('por defecto es hoja a pantalla completa bajo sm, con el pie pegado abajo', () => {
    render(<FormModal {...base}>Campos</FormModal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-fullscreen-mobile', 'true');
    expect(dialog).toHaveClass('max-sm:h-dvh', 'max-sm:rounded-none');
    const footer = dialog.querySelector('[data-slot="form-modal-footer"]');
    expect(footer).toHaveClass('max-sm:sticky', 'max-sm:bottom-0');
  });

  it('fullScreenOnMobile={false} lo deja flotante', () => {
    render(<FormModal {...base} fullScreenOnMobile={false}>Campos</FormModal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('data-fullscreen-mobile');
    expect(dialog).not.toHaveClass('max-sm:h-dvh');
    expect(dialog.querySelector('[data-slot="form-modal-footer"]')).not.toHaveClass('max-sm:sticky');
  });
});
