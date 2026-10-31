import { render, screen, within } from '@testing-library/react';
import { ImplantLotSearch } from './implant-lot-search';
import { downloadImplantLotCsv, searchImplantLots } from '@/lib/implants/implants-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeLotMatch } from '@/lib/test/implants';

jest.mock('../../lib/implants/implants-api', () => ({
  ...jest.requireActual('../../lib/implants/implants-api'),
  searchImplantLots: jest.fn(),
  downloadImplantLotCsv: jest.fn(),
}));

const mockedSearch = searchImplantLots as jest.MockedFunction<typeof searchImplantLots>;
const mockedCsv = downloadImplantLotCsv as jest.MockedFunction<typeof downloadImplantLotCsv>;

describe('ImplantLotSearch (DX-191)', () => {
  beforeEach(() => {
    mockedSearch.mockReset();
    mockedCsv.mockReset();
    URL.createObjectURL = jest.fn(() => 'blob:x');
    URL.revokeObjectURL = jest.fn();
  });

  it('sin rol ADMIN: aviso y nada de búsqueda', () => {
    render(<ImplantLotSearch token="t" allowed={false} />);
    expect(screen.getByText('Solo la administración busca implantes por lote.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lote')).not.toBeInTheDocument();
  });

  it('pide un lote o una REF antes de buscar', async () => {
    const user = setupUser();
    render(<ImplantLotSearch token="t" allowed />);
    expect(screen.getByText('Busca un lote o una referencia')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(screen.getByText('Escribe un lote o una referencia para buscar.')).toBeInTheDocument();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('busca un lote: los dos pacientes con fecha, diente y profesional; y exporta el CSV', async () => {
    const user = setupUser();
    mockedSearch.mockResolvedValue([
      makeLotMatch(),
      makeLotMatch({ implantId: 'i2', patientId: 'p2', patientName: 'Mario Pérez', toothNumber: '46', professionalName: 'Dr. Segundo' }),
    ]);
    mockedCsv.mockResolvedValue('csv');
    render(<ImplantLotSearch token="t" allowed />);
    await user.type(screen.getByLabelText('Lote'), 'LOT-AB12');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(mockedSearch).toHaveBeenCalledWith('t', { lot: 'LOT-AB12', reference: '' });
    const table = await screen.findByRole('table', { name: 'Pacientes que recibieron el lote o la referencia' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/patients/p1?tab=implants');
    expect(rows[1]).toHaveTextContent('Mario Pérez');
    expect(rows[1]).toHaveTextContent('Diente 46');
    expect(rows[1]).toHaveTextContent('Dr. Segundo');
    expect(screen.getByText('2 implantes encontrados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(mockedCsv).toHaveBeenCalledWith('t', { lot: 'LOT-AB12', reference: '' });
    expect(await screen.findByText('CSV descargado.')).toBeInTheDocument();
  });

  it('vacío y error con «Reintentar»', async () => {
    const user = setupUser();
    mockedSearch.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedSearch.mockResolvedValueOnce([]);
    render(<ImplantLotSearch token="t" allowed />);
    await user.type(screen.getByLabelText('Referencia (REF)'), '021.5310');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos hacer la búsqueda.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ningún paciente de la clínica recibió ese lote')).toBeInTheDocument();
    // Sin resultados no hay nada que exportar: el botón no se ofrece.
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });
});
