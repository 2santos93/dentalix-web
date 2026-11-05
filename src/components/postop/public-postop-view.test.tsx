import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicPostOpView } from './public-postop-view';
import { ApiError } from '@/lib/api/api-error';
import { accentFamily, accentStyleSheet, ratio } from '@/lib/color/accent';
import {
  getPublicPostOp,
  markPublicPostOpOpened,
  type PublicPostOp,
} from '@/lib/postop/postop-api';

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  getPublicPostOp: jest.fn(),
  markPublicPostOpOpened: jest.fn(),
}));

const mockedGet = getPublicPostOp as jest.MockedFunction<typeof getPublicPostOp>;
const mockedOpened = markPublicPostOpOpened as jest.MockedFunction<typeof markPublicPostOpOpened>;

function publicFixture(overrides: Partial<PublicPostOp> = {}): PublicPostOp {
  return {
    clinic: { name: 'Clínica Sonrisas', logoUrl: null, primaryColor: '#7C3AED' },
    locationPhone: '601 555 0000',
    title: 'Tras una extracción',
    code: 'POI-EXO',
    version: 2,
    renderedText: 'Hola Ana:\n\nMuerde la gasa 30 minutos.',
    deliveredAt: '2026-10-16T15:00:00.000Z',
    ...overrides,
  };
}

describe('PublicPostOpView', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedOpened.mockReset();
    mockedOpened.mockResolvedValue(undefined);
  });

  it('muestra cargando, luego marca, título, texto, teléfono y pie; marca la apertura una sola vez', async () => {
    mockedGet.mockResolvedValue(publicFixture());
    const { rerender } = render(<PublicPostOpView linkToken="tok-1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);

    expect(await screen.findByRole('heading', { level: 1, name: 'Clínica Sonrisas' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(mockedGet).toHaveBeenCalledWith('tok-1');
    expect(screen.getByRole('heading', { level: 2, name: 'Tras una extracción' })).toBeInTheDocument();
    expect(screen.getByText(/Muerde la gasa 30 minutos\./)).toHaveClass('whitespace-pre-line');
    expect(screen.getByRole('link', { name: /601 555 0000/ })).toHaveAttribute('href', 'tel:6015550000');
    expect(screen.getByText('POI-EXO · v2')).toBeInTheDocument();

    await waitFor(() => expect(mockedOpened).toHaveBeenCalledTimes(1));
    expect(mockedOpened).toHaveBeenCalledWith('tok-1');
    rerender(<PublicPostOpView linkToken="tok-1" />);
    expect(mockedOpened).toHaveBeenCalledTimes(1);
  });

  it('si marcar la apertura falla, el paciente sigue viendo las indicaciones', async () => {
    mockedGet.mockResolvedValue(publicFixture());
    mockedOpened.mockRejectedValue(new ApiError(500, 'boom'));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByText(/Muerde la gasa/)).toBeInTheDocument();
    await waitFor(() => expect(mockedOpened).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Muerde la gasa/)).toBeInTheDocument();
  });

  it('sin teléfono de la sede no muestra la línea de llamada', async () => {
    mockedGet.mockResolvedValue(publicFixture({ locationPhone: null }));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByText(/Muerde la gasa/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('404 → enlace no válido, sin marcar apertura', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Enlace no encontrado'));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText(
        'No encontramos este enlace. Revisa que esté completo o pide a la clínica que te lo envíe de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(mockedOpened).not.toHaveBeenCalled();
  });

  it('410 → caducado, sin marcar apertura', async () => {
    mockedGet.mockRejectedValue(new ApiError(410, 'Este enlace ya no es válido'));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no es válido' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText('Caducó a los 30 días. Si necesitas las indicaciones, llama a la clínica.'),
    ).toBeInTheDocument();
    expect(mockedOpened).not.toHaveBeenCalled();
  });

  it('otro error → SectionError con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(publicFixture());
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las indicaciones.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Muerde la gasa/)).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

// DX-250: el teléfono (`text-primary-text`) sobre el lienzo da >= 4,5:1 en claro y
// en oscuro con cualquier color de marca. El layout raíz deriva las dos familias
// del host (`:root` y `.dark`, con !important); la página no debe pisarlas con la
// familia clara en línea, que en oscuro dejaba el texto del tema claro sobre el lienzo oscuro.
describe('PublicPostOpView: contraste del teléfono (DX-250)', () => {
  // Los lienzos salen de los tokens reales (`tokens.css`: el bloque base y `.dark`).
  const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const tokenIn = (block: 'light' | 'dark', name: string): string => {
    const start = block === 'dark' ? tokens.indexOf('\n.dark {') : 0;
    const end = block === 'dark' ? tokens.length : tokens.indexOf('\n.dark {');
    const match = new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens.slice(start, end));
    if (!match) throw new Error(`token --color-${name} (${block}) no encontrado`);
    return match[1];
  };
  const CANVAS = { light: tokenIn('light', 'canvas'), dark: tokenIn('dark', 'canvas') };
  const SURFACE = { light: tokenIn('light', 'surface'), dark: tokenIn('dark', 'surface') };

  it.each(['#0E7490', '#38BDF8', '#1E3A8A'])('con la marca %s, el color del teléfono pasa 4,5:1 en cada tema', (brand) => {
    const family = accentFamily(brand)!;
    for (const theme of ['light', 'dark'] as const) {
      expect(ratio(family[theme].primaryText, CANVAS[theme])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(family[theme].primaryText, SURFACE[theme])).toBeGreaterThanOrEqual(4.5);
    }
    // Y las dos familias llegan al documento por la hoja del layout raíz.
    const sheet = accentStyleSheet(brand)!;
    expect(sheet).toContain(`:root{`);
    expect(sheet).toContain(`.dark{`);
    expect(sheet).toContain(`--color-primary-text:${family.dark.primaryText} !important`);
  });

  it.each(['#0E7490', '#38BDF8', '#1E3A8A'])(
    'con la marca %s la página no fija en línea la familia clara: el tema decide',
    async (brand) => {
      mockedGet.mockResolvedValue(
        publicFixture({ clinic: { name: 'Clínica Sonrisas', logoUrl: null, primaryColor: brand } }),
      );
      const { container } = render(<PublicPostOpView linkToken="tok-1" />);
      const phone = await screen.findByRole('link', { name: /601 555 0000/ });
      expect(phone).toHaveClass('text-primary-text');
      expect((container.firstElementChild as HTMLElement).getAttribute('style')).toBeNull();
    },
  );
});
