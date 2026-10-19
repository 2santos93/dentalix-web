import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Icd10Combobox } from './icd10-combobox';
import { searchIcd10 } from '@/lib/reference/icd10-api';

jest.mock('../../lib/reference/icd10-api', () => ({ searchIcd10: jest.fn() }));
const mocked = searchIcd10 as jest.MockedFunction<typeof searchIcd10>;

const caries = [
  { code: 'K02.0', labelEs: 'Caries limitada al esmalte' },
  { code: 'K02.1', labelEs: 'Caries de la dentina' },
];

function setup(onChange = jest.fn()) {
  render(
    <>
      <label htmlFor="dx">Diagnóstico principal (CIE-10)</label>
      <Icd10Combobox id="dx" token="tok" value={null} onChange={onChange} />
    </>,
  );
  return { onChange, user: userEvent.setup() };
}

describe('Icd10Combobox (DX-212)', () => {
  beforeEach(() => mocked.mockReset().mockResolvedValue(caries));

  it('busca por texto y elige con el ratón', async () => {
    const { onChange, user } = setup();
    const input = screen.getByRole('combobox', { name: 'Diagnóstico principal (CIE-10)' });
    await user.type(input, 'caries');
    await waitFor(() => expect(mocked).toHaveBeenLastCalledWith('tok', 'caries'));
    await user.click(await screen.findByRole('option', { name: /K02\.1 Caries de la dentina/ }));
    expect(onChange).toHaveBeenCalledWith(caries[1]);
  });

  it('con el teclado: flechas, Intro elige y Escape cierra', async () => {
    const { onChange, user } = setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 'K02');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /K02\.1/ }).id,
    );
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(caries[1]);

    onChange.mockClear();
    await user.type(input, 'x');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('sin resultados dice «Sin coincidencias»', async () => {
    mocked.mockResolvedValue([]);
    const { user } = setup();
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(await screen.findByText('Sin coincidencias')).toBeInTheDocument();
  });

  it('mientras busca dice «Buscando…»', async () => {
    mocked.mockReturnValue(new Promise(() => {}));
    const { user } = setup();
    await user.type(screen.getByRole('combobox'), 'car');
    expect(await screen.findByText('Buscando…')).toBeInTheDocument();
  });

  it('si la búsqueda falla, el control se sustituye y «Reintentar» vuelve a buscar', async () => {
    mocked.mockRejectedValue(new Error('red'));
    const { user } = setup();
    await user.type(screen.getByRole('combobox'), 'caries');
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByText('CIE-10 no disponible')).toBeInTheDocument();
    mocked.mockResolvedValue(caries);
    await user.click(retry);
    expect(await screen.findByRole('option', { name: /K02\.0/ })).toBeInTheDocument();
  });

  it('con un código elegido muestra código y texto y deja cambiarlo', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<Icd10Combobox id="dx" token="tok" value={caries[1]} onChange={onChange} />);
    expect(screen.getByText('K02.1')).toBeInTheDocument();
    expect(screen.getByText('Caries de la dentina')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cambiar el diagnóstico K02.1' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
