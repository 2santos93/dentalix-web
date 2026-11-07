import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogPicker } from './catalog-picker';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';

function item(overrides: Partial<DentalCatalogItem> & { id: string }): DentalCatalogItem {
  return {
    tenantId: 't1',
    code: 'COD',
    category: null,
    kind: 'PROCEDURE',
    labelEs: 'Ítem',
    labelEn: null,
    labelPt: null,
    color: '#00AAFF',
    defaultPrice: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as DentalCatalogItem;
}

const items = [
  item({ id: 'cat-1', code: 'RES', labelEs: 'Resina' }),
  item({ id: 'cat-2', code: 'LIM', labelEs: 'Limpieza' }),
  item({ id: 'cat-3', code: 'CAR', labelEs: 'Caries', kind: 'DIAGNOSIS' }),
];

describe('CatalogPicker', () => {
  it('nombra la elección con la leyenda que le pasa cada consumidor', () => {
    render(
      <CatalogPicker items={items} value={null} onChange={() => {}} idPrefix="tp" legend="Procedimiento" />,
    );
    expect(screen.getByRole('group', { name: 'Procedimiento' })).toBeInTheDocument();
  });

  it('filtra por etiqueta y por código — el catálogo real no cabe en pantalla', async () => {
    const user = userEvent.setup();
    render(<CatalogPicker items={items} value={null} onChange={() => {}} idPrefix="tp" legend="Procedimiento" />);

    const filter = screen.getByLabelText(/buscar en el catálogo/i);

    await user.type(filter, 'resi');
    expect(screen.getByRole('radio', { name: /resina/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /limpieza/i })).not.toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, 'LIM');
    expect(screen.getByRole('radio', { name: /limpieza/i })).toBeInTheDocument();
  });

  it('dice qué buscó cuando nada coincide, en vez de quedarse en blanco', async () => {
    const user = userEvent.setup();
    render(<CatalogPicker items={items} value={null} onChange={() => {}} idPrefix="tp" legend="Procedimiento" />);

    await user.type(screen.getByLabelText(/buscar en el catálogo/i), 'zzz');
    expect(screen.getByRole('status')).toHaveTextContent('zzz');
  });

  it('devuelve el id del ítem elegido', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<CatalogPicker items={items} value={null} onChange={onChange} idPrefix="tp" legend="Procedimiento" />);

    await user.click(screen.getByRole('radio', { name: /limpieza/i }));
    expect(onChange).toHaveBeenCalledWith('cat-2');
  });

  it('marca como seleccionado el valor que recibe', () => {
    render(<CatalogPicker items={items} value="cat-1" onChange={() => {}} idPrefix="tp" legend="Procedimiento" />);
    expect(screen.getByRole('radio', { name: /resina/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /limpieza/i })).not.toBeChecked();
  });

  it('oculta la etiqueta de tipo cuando no distingue nada (un ítem de plan solo puede ser PROCEDURE)', () => {
    const { rerender } = render(
      <CatalogPicker items={items} value={null} onChange={() => {}} idPrefix="tp" legend="Procedimiento" showKind />,
    );
    expect(screen.getByRole('radio', { name: /caries.*diagnóstico/i })).toBeInTheDocument();

    rerender(
      <CatalogPicker items={items} value={null} onChange={() => {}} idPrefix="tp" legend="Procedimiento" showKind={false} />,
    );
    expect(screen.queryByText('Diagnóstico')).not.toBeInTheDocument();
  });

  it('aísla dos pickers en la misma página con `idPrefix`', () => {
    render(
      <>
        <CatalogPicker items={items} value="cat-1" onChange={() => {}} idPrefix="tp" legend="Procedimiento" />
        <CatalogPicker items={items} value="cat-2" onChange={() => {}} idPrefix="trp" legend="Hallazgo" />
      </>,
    );
    // Distinto `name` de grupo de radios: elegir en uno no roba la selección
    // del otro, que es justo lo que `idPrefix` existe para evitar.
    const [first, second] = screen.getAllByRole('radio', { name: /resina/i });
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
  });

  it('DX-502-ter: muestra el precio de cada fila solo si el consumidor da uno con su moneda', () => {
    render(
      <CatalogPicker
        items={items}
        value={null}
        onChange={() => {}}
        idPrefix="tp"
        legend="Procedimiento"
        priceLabel={(i) => (i.id === 'cat-1' ? 'US$ 150,00' : null)}
      />,
    );
    const prices = screen.getAllByTestId('catalog-picker-price');
    expect(prices).toHaveLength(1);
    expect(prices[0]).toHaveTextContent('US$ 150,00');
    // Mismo recorrido que el e2e: la fila (label) del ítem contiene su precio.
    const row = screen.getByRole('radio', { name: /resina/i }).closest('label') as HTMLElement;
    expect(within(row).getByTestId('catalog-picker-price')).toHaveTextContent('US$ 150,00');
    const other = screen.getByRole('radio', { name: /limpieza/i }).closest('label') as HTMLElement;
    expect(within(other).queryByTestId('catalog-picker-price')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /resina/i })).toBeInTheDocument();
  });

  it('sin `priceLabel` no pinta ningún precio (el odontograma no lo necesita)', () => {
    render(<CatalogPicker items={items} value={null} onChange={() => {}} idPrefix="tp" legend="Procedimiento" />);
    expect(screen.queryByTestId('catalog-picker-price')).not.toBeInTheDocument();
  });
});
