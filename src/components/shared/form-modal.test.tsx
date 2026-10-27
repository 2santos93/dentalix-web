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
