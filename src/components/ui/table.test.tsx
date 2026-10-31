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

  describe('cuando no cabe en su hueco', () => {
    function mockWidths(scrollWidth: number, clientWidth: number) {
      const scroll = jest
        .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
        .mockReturnValue(scrollWidth);
      const client = jest
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockReturnValue(clientWidth);
      return () => {
        scroll.mockRestore();
        client.mockRestore();
      };
    }

    it('el marco que se desplaza es una región enfocable y con nombre', () => {
      const restore = mockWidths(900, 520);
      try {
        renderTable();

        // Sin esto, las últimas columnas son inalcanzables sin ratón (WCAG 2.1.1).
        const region = screen.getByRole('region', { name: 'Insumos' });
        expect(region).toHaveAttribute('tabindex', '0');
        expect(region).toHaveClass('scroll-x-shadows');
      } finally {
        restore();
      }
    });

    it('si cabe, no añade región ni parada de tabulador', () => {
      // jsdom no maqueta: sin simular anchos, `scrollWidth` y `clientWidth`
      // valen 0 y la tabla se considera "cabe", que es el caso normal.
      renderTable();

      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });
  });

  it('stack={false} (tabla de comparación) no se apila: la cabecera se ve en el teléfono', () => {
    render(
      <Table aria-label="Caja" stack={false}>
        <TableHeader>
          <TableRow>
            <TableHead>Paciente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Ana</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const table = screen.getByRole('table', { name: 'Caja' });
    expect(table).not.toHaveClass('max-sm:block');
    expect(table.querySelector('thead')).not.toHaveClass('max-sm:sr-only');
    expect(screen.getByText('Ana')).not.toHaveClass('max-sm:flex');
  });
});

describe('Cabeceras en tipo frase (DESIGN.md → Typography)', () => {
  it('la cabecera y la etiqueta apilada usan Label muted, sin mayúsculas espaciadas', () => {
    render(
      <Table aria-label="t">
        <TableHeader>
          <TableRow>
            <TableHead>Paciente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell data-label="Paciente">Ana</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const th = screen.getByRole('columnheader', { name: 'Paciente' });
    expect(th).toHaveClass('t-label', 'text-muted');
    expect(th.className).not.toMatch(/uppercase|tracking-wide/);
    expect(screen.getByRole('cell').className).not.toMatch(/uppercase|tracking-wide/);
  });
});
