import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { AcquisitionView } from './acquisition-view';
import {
  downloadAcquisitionCsv,
  getAcquisitionReport,
  type AcquisitionReport,
  type AcquisitionRow,
} from '@/lib/reports/acquisition-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { regionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=captacion');
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/reportes',
  useSearchParams: () => search,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('../../lib/reports/acquisition-api', () => ({
  ...jest.requireActual('../../lib/reports/acquisition-api'),
  getAcquisitionReport: jest.fn(),
  downloadAcquisitionCsv: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-11-16',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = jest.mocked(getAcquisitionReport);
const mockedCsv = jest.mocked(downloadAcquisitionCsv);
const mockedSave = jest.mocked(saveCsv);
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');
const money = (n: number, c: string) => flat(moneyWithCode(n, c, fmt));
const NOV = { from: '2026-11-01', to: '2026-11-16' };

async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function row(overrides: Partial<AcquisitionRow>): AcquisitionRow {
  return {
    sourceId: 's-ig',
    name: 'Instagram',
    kind: 'CHANNEL',
    isActive: true,
    newPatients: 0,
    payingPatients: 0,
    collected: [],
    ...overrides,
  };
}

function report(overrides: Partial<AcquisitionReport> = {}): AcquisitionReport {
  return {
    period: NOV,
    filters: { locationId: null, locationName: null },
    options: {
      locations: [
        { id: 'loc-1', name: 'Sede Altamira', isActive: true },
        { id: 'loc-2', name: 'Sede Chacao', isActive: false },
      ],
    },
    rows: [
      row({
        sourceId: 's-ref',
        name: 'Recomendación de paciente',
        kind: 'PATIENT',
        newPatients: 3,
        payingPatients: 2,
        collected: [
          { currency: 'USD', amount: 150 },
          { currency: 'VES', amount: 3600.5 },
        ],
      }),
      row({ newPatients: 5, payingPatients: 1, collected: [{ currency: 'USD', amount: 40 }] }),
      row({ sourceId: 's-radio', name: 'Radio', isActive: false, newPatients: 1 }),
      row({ sourceId: null, name: 'Sin dato', kind: null, isActive: null, newPatients: 2 }),
    ],
    totals: {
      newPatients: 11,
      payingPatients: 3,
      collected: [
        { currency: 'USD', amount: 190 },
        { currency: 'VES', amount: 3600.5 },
      ],
    },
    topReferrers: [
      {
        patientId: 'p-ref',
        fullName: 'Luisa Márquez',
        patientCode: '1001',
        referred: 2,
        collected: [{ currency: 'USD', amount: 150 }],
      },
    ],
    currencies: ['USD', 'VES'],
    hasActivity: true,
    ...overrides,
  };
}

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

describe('AcquisitionView (DX-172)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=captacion');
    jest.mocked(useSedeFormat).mockReturnValue({ status: 'ready', fmt } as ReturnType<typeof useSedeFormat>);
    mockedGet.mockResolvedValue(report());
  });

  it('pide este mes de la sede y pinta el resumen, las barras por fuente y la tabla con una columna por moneda', async () => {
    const { container } = render(<AcquisitionView token="t" isAdmin />);
    expect(flat((await screen.findByTestId('acquisition-new')).textContent)).toContain('11');
    expect(mockedGet).toHaveBeenCalledWith('t', NOV);
    expect(flat(screen.getByTestId('acquisition-paying').textContent)).toMatch(/27\s?% de los nuevos/);
    const collected = flat(screen.getByTestId('acquisition-collected').textContent);
    expect(collected).toContain(money(190, 'USD'));
    expect(collected).toContain(money(3600.5, 'VES'));

    const figure = screen.getByRole('figure', { name: 'Pacientes nuevos por fuente' });
    const names = within(figure)
      .getAllByTestId('ranked-bar')
      .map((li) => li.firstElementChild?.textContent);
    expect(names).toEqual(['Instagram', 'Recomendación de paciente', 'Sin dato', 'Radio (desactivada)']);

    const table = screen.getByRole('table', { name: 'Captación por fuente' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => flat(h.firstElementChild?.firstChild?.textContent ?? h.textContent));
    expect(headers).toEqual(['Fuente', 'Pacientes nuevos', 'Con abonos', 'Cobrado USD', 'Cobrado VES']);
    expect(within(table).getByRole('button', { name: 'Cómo se calcula: Cobrado USD' })).toBeInTheDocument();
    const ref = within(table).getByText('Recomendación de paciente').closest('tr') as HTMLElement;
    expect(flat(ref.textContent)).toContain(money(3600.5, 'VES'));
    expect(within(table).getByText('Sin dato')).toBeInTheDocument();
    expect(await violations(container)).toEqual([]);
  });

  it('el top de pacientes que recomiendan enlaza a su ficha', async () => {
    render(<AcquisitionView token="t" isAdmin />);
    const table = await screen.findByRole('table', { name: 'Pacientes que más recomiendan' });
    expect(within(table).getByRole('link', { name: /Luisa Márquez/ })).toHaveAttribute('href', '/patients/p-ref');
  });

  it('a 390 px la tabla son tarjetas apiladas con lo cobrado de todas las monedas (nunca se oculta dinero)', async () => {
    const restore = mockPhone(true);
    try {
      const { container } = render(<AcquisitionView token="t" isAdmin />);
      const list = await screen.findByRole('list', { name: 'Captación por fuente' });
      const card = within(list).getByText('Recomendación de paciente').closest('li') as HTMLElement;
      expect(flat(card.textContent)).toContain('3 nuevos');
      expect(flat(card.textContent)).toContain(`${money(150, 'USD')} · ${money(3600.5, 'VES')}`);
      expect(screen.queryByRole('table', { name: 'Captación por fuente' })).not.toBeInTheDocument();
      expect(await violations(container)).toEqual([]);
    } finally {
      restore();
    }
  });

  it('la sede va en `locationId` y se lee de la URL', async () => {
    search = new URLSearchParams('tab=captacion&sede=loc-1');
    render(<AcquisitionView token="t" isAdmin />);
    await screen.findByTestId('acquisition-new');
    expect(mockedGet).toHaveBeenCalledWith('t', { ...NOV, locationId: 'loc-1' });
    expect(flat(screen.getByTestId('acquisition-scope').textContent)).toBe(
      'Pacientes nuevos de la clínica · captados en la sede Sede Altamira',
    );
    await userEvent.selectOptions(screen.getByLabelText('Sede de captación'), '');
    expect(replace).toHaveBeenCalledWith('/reportes?tab=captacion', { scroll: false });
  });

  it('CSV solo para ADMIN, con los mismos filtros', async () => {
    mockedCsv.mockResolvedValue('Fuente;Pacientes nuevos\n');
    const { unmount } = render(<AcquisitionView token="t" isAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(mockedCsv).toHaveBeenCalledWith('t', NOV));
    expect(mockedSave).toHaveBeenCalledWith(
      'Fuente;Pacientes nuevos\n',
      'captacion-de-pacientes-2026-11-01-2026-11-16.csv',
      {
        bom: true,
      },
    );
    unmount();
    render(<AcquisitionView token="t" isAdmin={false} />);
    await screen.findByTestId('acquisition-new');
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
  });

  it('sin pacientes nuevos: el vacío', async () => {
    mockedGet.mockResolvedValue(report({ hasActivity: false }));
    render(<AcquisitionView token="t" isAdmin />);
    expect(await screen.findByText('Sin pacientes nuevos en el período')).toBeInTheDocument();
  });

  it('si falla, el error con «Reintentar» vuelve a pedirlo', async () => {
    mockedGet.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(report());
    render(<AcquisitionView token="t" isAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('acquisition-new')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('un 403 sin sede: el aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Sin acceso'));
    render(<AcquisitionView token="t" isAdmin={false} />);
    expect(await screen.findByText('Tu rol no tiene acceso a la captación de pacientes.')).toBeInTheDocument();
  });

  it('un período de más de 24 meses no se pide', async () => {
    search = new URLSearchParams('tab=captacion&periodo=custom&desde=2023-01-01&hasta=2026-11-16');
    render(<AcquisitionView token="t" isAdmin />);
    expect(await screen.findByText(/elige fechas de hasta 24 meses/)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
