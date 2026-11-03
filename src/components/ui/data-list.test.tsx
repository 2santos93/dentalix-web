import { render, screen, within } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { DataList, type DataListColumn } from './data-list';

/**
 * El contrato de `DataList`: una declaración de columnas, tabla de verdad en
 * tablet/escritorio y lista de tarjetas compactas en el teléfono. jsdom no
 * aplica media queries; el modo teléfono se fuerza simulando `matchMedia`.
 */
interface Row {
  id: string;
  name: string;
  doc: string | null;
  phone: string | null;
  amount: string;
  note: string;
}

const rows: Row[] = [
  { id: '1', name: 'Ana García', doc: 'V-123', phone: '0414 555 0101', amount: '12,00 USD', note: 'x' },
  { id: '2', name: 'Luis Pérez', doc: null, phone: null, amount: '0,00 USD', note: 'y' },
];

const columns: DataListColumn<Row>[] = [
  { id: 'name', header: 'Nombre', mobile: 'primary', cell: (r) => r.name },
  { id: 'doc', header: 'Documento', cell: (r) => r.doc ?? '—', mobileCell: (r) => r.doc },
  { id: 'phone', header: 'Teléfono', cell: (r) => r.phone ?? '—', mobileCell: (r) => r.phone },
  { id: 'amount', header: 'Saldo', mobile: 'trailing', numeric: true, cell: (r) => r.amount },
  { id: 'note', header: 'Nota', mobile: 'hidden', cell: (r) => r.note },
];

function mockPhone(matches: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('DataList', () => {
  describe('tablet y escritorio (sin matchMedia → tabla)', () => {
    it('es una tabla con nombre, cabeceras y una fila por registro', () => {
      render(<DataList label="Pacientes" rows={rows} columns={columns} getRowKey={(r) => r.id} />);

      const table = screen.getByRole('table', { name: 'Pacientes' });
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
        'Nombre',
        'Documento',
        'Teléfono',
        'Saldo',
        'Nota',
      ]);
      expect(within(table).getAllByRole('row')).toHaveLength(3);
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('con href, la celda principal es UN enlace por fila (estirado a toda la fila)', () => {
      render(
        <DataList
          label="Pacientes"
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/patients/${r.id}`}
        />,
      );

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      expect(screen.getByRole('link', { name: 'Ana García' })).toHaveAttribute('href', '/patients/1');
      expect(links[0].className).toContain('after:absolute');
    });

    it('las cifras van a la derecha y tabulares', () => {
      render(<DataList label="Pacientes" rows={rows} columns={columns} getRowKey={(r) => r.id} />);
      const cell = screen.getByText('12,00 USD').closest('td')!;
      expect(cell).toHaveClass('text-right', 'tabular-nums');
    });

    it('las acciones van en «⋯» con el nombre de la fila y una cabecera solo para lectores', () => {
      render(
        <DataList
          label="Pacientes"
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          getRowLabel={(r) => r.name}
          rowActions={() => [{ label: 'Archivar', onSelect: () => {} }]}
        />,
      );
      expect(screen.getByRole('button', { name: 'Acciones de Ana García' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Acciones' }).querySelector('.sr-only')).not.toBeNull();
    });
  });

  describe('teléfono (<640px)', () => {
    let restore: () => void;
    beforeEach(() => {
      restore = mockPhone(true);
    });
    afterEach(() => restore());

    it('es una lista con nombre, no una tabla, y sin etiquetas «columna: valor»', () => {
      render(<DataList label="Pacientes" rows={rows} columns={columns} getRowKey={(r) => r.id} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const list = screen.getByRole('list', { name: 'Pacientes' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(2);
      expect(screen.queryByText('Documento')).not.toBeInTheDocument();
      expect(screen.queryByText(/acciones/i)).not.toBeInTheDocument();
    });

    it('línea 1 = principal + dato clave; línea 2 = meta unida con « · », sin vacíos ni ocultas', () => {
      render(<DataList label="Pacientes" rows={rows} columns={columns} getRowKey={(r) => r.id} />);

      const [ana, luis] = screen.getAllByRole('listitem');
      expect(ana).toHaveTextContent('Ana García12,00 USDV-123 · 0414 555 0101');
      // Sin documento ni teléfono no hay línea 2 (ni «—» ni separadores sueltos).
      expect(luis).toHaveTextContent(/^Luis Pérez0,00 USD$/);
      // `hidden` no sale en el teléfono.
      expect(screen.queryByText('x')).not.toBeInTheDocument();
    });

    it('con href, toda la tarjeta es un enlace (≥56px) con chevron', () => {
      render(
        <DataList
          label="Pacientes"
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/patients/${r.id}`}
        />,
      );
      const link = screen.getByRole('link', { name: /Ana García/ });
      expect(link).toHaveAttribute('href', '/patients/1');
      expect(link).toHaveClass('min-h-14');
      expect(link.querySelector('svg')).not.toBeNull();
    });

    it('el «⋯» va fuera del enlace (nunca un botón dentro de un enlace)', () => {
      render(
        <DataList
          label="Pacientes"
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/patients/${r.id}`}
          getRowLabel={(r) => r.name}
          rowActions={() => [{ label: 'Archivar', onSelect: () => {} }]}
        />,
      );
      const trigger = screen.getByRole('button', { name: 'Acciones de Ana García' });
      expect(trigger.closest('a')).toBeNull();
    });

    it('la línea 1 se parte hasta dos líneas (no se recorta a una) y el «⋯» sigue en 44px', () => {
      render(
        <DataList
          label="Pacientes"
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          getRowLabel={(r) => r.name}
          rowActions={() => [{ label: 'Archivar', onSelect: () => {} }]}
        />,
      );
      const primary = screen.getByText('Ana García').closest('[data-slot="primary"]')!;
      expect(primary).toHaveClass('line-clamp-2', 'break-words');
      expect(primary).not.toHaveClass('truncate');
      expect(screen.getByRole('button', { name: 'Acciones de Ana García' })).toHaveClass('size-11');
    });

    it('con onRowClick, la tarjeta es un botón', async () => {
      const user = setupUser();
      const onRowClick = jest.fn();
      render(
        <DataList label="Pacientes" rows={rows} columns={columns} getRowKey={(r) => r.id} onRowClick={onRowClick} />,
      );
      await user.click(screen.getByRole('button', { name: /Luis Pérez/ }));
      expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    });

    it('phone="scroll" mantiene la tabla, con la primera columna fija', () => {
      render(<DataList label="Caja" rows={rows} columns={columns} getRowKey={(r) => r.id} phone="scroll" />);
      expect(screen.getByRole('table', { name: 'Caja' })).toBeInTheDocument();
      expect(screen.getByText('Ana García').closest('td')).toHaveClass('sticky', 'left-0');
      // La tabla de comparación no se apila: la cabecera se ve.
      expect(screen.getByRole('table').querySelector('thead')).not.toHaveClass('max-sm:sr-only');
    });
  });

  it('cargando: estado para lectores y sin filas', () => {
    render(
      <DataList label="Pacientes" rows={[]} columns={columns} getRowKey={(r) => r.id} loading loadingLabel="Cargando pacientes…" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pacientes…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('vacío: pinta lo que le dan', () => {
    render(
      <DataList label="Pacientes" rows={[]} columns={columns} getRowKey={(r) => r.id} empty={<p>Nada</p>} />,
    );
    expect(screen.getByText('Nada')).toBeInTheDocument();
  });
  describe('«—» de una sede sin formato (DX-354b, E7.1)', () => {
    const when = [{ id: 'a', at: '—', note: 'Hasta el —' }, { id: 'b', at: '05/11/2026', note: 'x' }];
    const whenColumns: DataListColumn<(typeof when)[number]>[] = [
      { id: 'at', header: 'Fecha', mobile: 'primary', cell: (r) => r.at, mobileCell: (r) => (r.at === '—' ? null : r.at) },
      { id: 'note', header: 'Nota', cell: (r) => r.note },
    ];

    it('una celda que es exactamente «—» dice «Sin dato» a lectores de pantalla y oculta el guion', () => {
      render(<DataList label="Fechas" rows={when} columns={whenColumns} getRowKey={(r) => r.id} />);
      const sr = screen.getByText('Sin dato');
      expect(sr).toHaveClass('sr-only');
      expect(sr.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
      expect(sr.previousElementSibling).toHaveTextContent('—');
    });

    it('un texto distinto de «—» no se envuelve, ni una frase que contiene «—»', () => {
      render(<DataList label="Fechas" rows={when} columns={whenColumns} getRowKey={(r) => r.id} />);
      expect(screen.getAllByText('Sin dato')).toHaveLength(1);
      expect(screen.getByText('05/11/2026')).not.toHaveAttribute('aria-hidden');
      expect(screen.getByText('Hasta el —')).toBeInTheDocument();
    });

    it('en el teléfono, un mobileCell null no pinta nada (ni «—» ni «Sin dato»)', () => {
      const restore = mockPhone(true);
      render(<DataList label="Fechas" rows={[when[0]]} columns={[{ ...whenColumns[0], mobile: 'meta' }, { id: 'n', header: 'N', mobile: 'primary', cell: () => 'Fila' }]} getRowKey={(r) => r.id} />);
      expect(screen.queryByText('Sin dato')).not.toBeInTheDocument();
      expect(screen.queryByText('—')).not.toBeInTheDocument();
      restore();
    });

    it('en el teléfono, un «—» como celda móvil también lleva «Sin dato»', () => {
      const restore = mockPhone(true);
      render(<DataList label="Fechas" rows={when} columns={[{ id: 'at', header: 'Fecha', mobile: 'primary', cell: (r) => r.at }]} getRowKey={(r) => r.id} />);
      expect(screen.getByText('Sin dato')).toBeInTheDocument();
      restore();
    });
  });
});
