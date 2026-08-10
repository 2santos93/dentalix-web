import { render, screen } from '@testing-library/react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

/**
 * Lo que se prueba aquí es el CONTRATO de la tabla apilada, no su aspecto: que
 * cada celda lleve la etiqueta de su columna y que la cabecera siga existiendo
 * para un lector de pantalla. El breakpoint en sí es CSS y se verifica en
 * navegador, no en jsdom —que no aplica media queries— porque un test que
 * afirmara "en móvil se ve apilado" aquí estaría mintiendo.
 */
describe('Table apilada en móvil', () => {
  function renderTable() {
    return render(
      <Table aria-label="Insumos">
        <TableHeader>
          <TableRow>
            <TableHead>Insumo</TableHead>
            <TableHead>Stock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell data-label="Insumo">Guantes</TableCell>
            <TableCell data-label="Stock">20</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  it('cada celda declara de qué columna es', () => {
    renderTable();

    expect(screen.getByText('Guantes')).toHaveAttribute('data-label', 'Insumo');
    expect(screen.getByText('20')).toHaveAttribute('data-label', 'Stock');
  });

  it('la cabecera sigue siendo accesible aunque no se vea', () => {
    renderTable();

    // `sr-only`, no `hidden`: ocultarla de verdad dejaría la tabla sin
    // cabeceras de columna para quien la recorre con lector de pantalla.
    expect(
      screen.getByRole('columnheader', { name: 'Insumo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Stock' }),
    ).toBeInTheDocument();
  });

  it('sigue siendo una tabla de verdad para la accesibilidad', () => {
    renderTable();

    const table = screen.getByRole('table', { name: 'Insumos' });
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });
});
