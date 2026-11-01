import { fireEvent, render, screen, within } from '@testing-library/react';
import { RecoveryCodesPanel } from './recovery-codes-panel';

describe('RecoveryCodesPanel (DX-021)', () => {
  it('lista los códigos, avisa de que no se repiten y confirma el guardado', () => {
    const onSavedChange = jest.fn();
    const codes = ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'];
    render(<RecoveryCodesPanel codes={codes} saved={false} onSavedChange={onSavedChange} />);
    const list = screen.getByRole('list', { name: 'Códigos de recuperación' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(codes);
    expect(screen.getByText(/no volveremos a mostrarlos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSavedChange).toHaveBeenCalledWith(true);
  });
});
