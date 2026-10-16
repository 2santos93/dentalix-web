import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAlternativeModal } from './create-alternative-modal';
import { createPlanAlternative } from '@/lib/treatment-plans/plan-options-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/treatment-plans/plan-options-api', () => ({
  createPlanAlternative: jest.fn(),
}));

const mockedCreate = createPlanAlternative as jest.MockedFunction<typeof createPlanAlternative>;

function renderModal() {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    onCreated: jest.fn(),
    token: 'tok',
    planId: 'plan-a',
    suggestedLabel: 'Opción B',
  };
  render(<CreateAlternativeModal {...props} />);
  return props;
}

describe('CreateAlternativeModal (DX-040)', () => {
  beforeEach(() => mockedCreate.mockReset());

  it('explica que copia los procedimientos y sugiere la letra siguiente', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Crear alternativa' })).toBeInTheDocument();
    expect(
      screen.getByText(/copia los procedimientos de este plan/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la opción')).toHaveAttribute('placeholder', 'Opción B');
  });

  it('crea con la etiqueta escrita (o sin ella) y avisa al padre', async () => {
    const user = userEvent.setup();
    const created = { id: 'plan-b', optionLabel: 'Opción B: puente' };
    mockedCreate.mockResolvedValue(created as never);
    const props = renderModal();
    await user.type(screen.getByLabelText('Nombre de la opción'), ' Opción B: puente ');
    await user.click(screen.getByRole('button', { name: 'Crear alternativa' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'plan-a', { optionLabel: 'Opción B: puente' }),
    );
    expect(props.onCreated).toHaveBeenCalledWith(created);
  });

  it('sin etiqueta deja que la API ponga la letra', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ id: 'plan-b' } as never);
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Crear alternativa' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('tok', 'plan-a', {}));
  });

  it('un 409 (opción ya elegida) se queda en el modal', async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(
      new ApiError(409, 'El paciente ya eligió una opción de este grupo: no se pueden añadir alternativas.'),
    );
    const props = renderModal();
    await user.click(screen.getByRole('button', { name: 'Crear alternativa' }));
    expect(await screen.findByText(/ya eligió una opción/)).toBeInTheDocument();
    expect(props.onCreated).not.toHaveBeenCalled();
  });
});
