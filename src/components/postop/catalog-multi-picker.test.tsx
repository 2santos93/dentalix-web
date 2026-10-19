import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { CatalogMultiPicker } from './catalog-multi-picker';
import { setupUser } from '@/lib/test/user';

const items = [
  { id: 'c1', code: 'EXO-01', labelEs: 'Exodoncia simple', color: '#f00' },
  { id: 'c2', code: 'END-01', labelEs: 'Endodoncia unirradicular', color: '#0f0' },
  { id: 'c3', code: 'RES-01', labelEs: 'Resina compuesta', color: '#00f' },
];

function Harness({ initial = [] as string[], onChange = jest.fn() }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <CatalogMultiPicker
      items={items}
      value={value}
      onChange={(ids) => {
        onChange(ids);
        setValue(ids);
      }}
      idPrefix="t"
      legend="Procedimientos"
    />
  );
}

describe('CatalogMultiPicker', () => {
  it('lista un checkbox por procedimiento dentro de un grupo con nombre', () => {
    render(<Harness initial={['c2']} />);
    expect(screen.getByRole('group', { name: 'Procedimientos' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: /endodoncia unirradicular/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /exodoncia simple/i })).not.toBeChecked();
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument();
  });

  it('filtra por nombre o código, sin distinguir tildes ni mayúsculas', async () => {
    const user = setupUser();
    render(<Harness />);
    const filter = screen.getByRole('searchbox', { name: /buscar procedimiento/i });
    await user.type(filter, 'exodóncia');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await user.clear(filter);
    await user.type(filter, 'res-01');
    expect(screen.getByRole('checkbox', { name: /resina compuesta/i })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await user.clear(filter);
    await user.type(filter, 'corona');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Ningún procedimiento coincide con «corona».');
  });

  it('conmuta: marcar añade el id y desmarcar lo quita, conservando el resto', async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={['c2']} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: /exodoncia simple/i }));
    expect(onChange).toHaveBeenLastCalledWith(['c2', 'c1']);
    expect(screen.getByText('2 seleccionados')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /endodoncia unirradicular/i }));
    expect(onChange).toHaveBeenLastCalledWith(['c1']);
  });

  it('filtrar no pierde las marcas de lo que queda oculto', async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={['c2']} onChange={onChange} />);
    await user.type(screen.getByRole('searchbox'), 'resina');
    await user.click(screen.getByRole('checkbox', { name: /resina compuesta/i }));
    expect(onChange).toHaveBeenLastCalledWith(['c2', 'c3']);
  });

  it('sin ítems lo dice en vez de pintar una lista vacía', () => {
    render(
      <CatalogMultiPicker items={[]} value={[]} onChange={jest.fn()} idPrefix="e" legend="Procedimientos" />,
    );
    expect(screen.getByText('No hay procedimientos activos en el catálogo.')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
