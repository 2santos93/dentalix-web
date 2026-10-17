import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionNoteDialog } from './collection-note-dialog';
import { createCollectionNote } from '@/lib/collections/collections-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/collections/collections-api', () => ({
  createCollectionNote: jest.fn(),
}));
const mockedCreate = createCollectionNote as jest.MockedFunction<typeof createCollectionNote>;

const patient = { id: 'pat-1', fullName: 'Ana Pérez' };

function setup() {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <CollectionNoteDialog open onOpenChange={onOpenChange} token="tok" patient={patient} onSaved={onSaved} />,
  );
  return { onSaved, onOpenChange };
}

describe('CollectionNoteDialog (DX-150)', () => {
  beforeEach(() => mockedCreate.mockReset());

  it('es un modal con título, aviso de no escribir datos clínicos y contador', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Registrar gestión' })).toBeInTheDocument();
    expect(screen.getByText(/No escribas datos clínicos/)).toBeInTheDocument();
    expect(screen.getByText('0/280')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota (opcional)')).toHaveAccessibleDescription(/No escribas datos clínicos/);
  });

  it('valida en español: canal y resultado obligatorios', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar gestión' }));
    expect(await screen.findByText('Elige el canal de la gestión.')).toBeInTheDocument();
    expect(screen.getByText('Elige el resultado de la gestión.')).toBeInTheDocument();
    expect(screen.getByLabelText('Canal')).toHaveAttribute('aria-invalid', 'true');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('no deja pasar una nota de más de 280 caracteres', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Canal'), 'CALL');
    await userEvent.selectOptions(screen.getByLabelText('Resultado'), 'NO_ANSWER');
    const text = screen.getByLabelText('Nota (opcional)');
    await userEvent.click(text);
    await userEvent.paste('x'.repeat(281));
    expect(screen.getByText('281/280')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar gestión' }));
    expect(await screen.findByText('La nota admite hasta 280 caracteres.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('guarda canal, resultado y nota recortada, y cierra', async () => {
    mockedCreate.mockResolvedValue({ id: 'n1' } as never);
    const { onSaved, onOpenChange } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Canal'), 'WHATSAPP_LINK');
    await userEvent.selectOptions(screen.getByLabelText('Resultado'), 'PROMISED_PAYMENT');
    await userEvent.type(screen.getByLabelText('Nota (opcional)'), '  Paga el viernes ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar gestión' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'pat-1', {
        channel: 'WHATSAPP_LINK',
        outcome: 'PROMISED_PAYMENT',
        text: 'Paga el viernes',
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('un error de la API queda en el modal, en español', async () => {
    mockedCreate.mockRejectedValue(new ApiError(400, 'La nota admite hasta 280 caracteres.'));
    const { onSaved } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Canal'), 'CALL');
    await userEvent.selectOptions(screen.getByLabelText('Resultado'), 'DISPUTE');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar gestión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La nota admite hasta 280 caracteres.');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
