import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientLinksView } from './patient-links-view';
import {
  getPatientLinks,
  type PatientLinkMetrics,
  type PatientLinkType,
  type PatientLinksReport,
} from '@/lib/reports/patient-links-api';
import { ApiError } from '@/lib/api/client';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { regionalFormat } from '@/lib/format/regional-format';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=enlaces-paciente');
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/reportes',
  useSearchParams: () => search,
}));
jest.mock('../../lib/reports/patient-links-api', () => ({
  ...jest.requireActual('../../lib/reports/patient-links-api'),
  getPatientLinks: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-11-12',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = getPatientLinks as jest.MockedFunction<typeof getPatientLinks>;
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

const SIGNALS: Record<PatientLinkType, { opened: boolean; completed: boolean }> = {
  ANAMNESIS: { opened: true, completed: true },
  CONSENT_SIGNATURE: { opened: true, completed: true },
  BUDGET_SIGNATURE: { opened: true, completed: true },
  APPOINTMENT_CONFIRMATION: { opened: false, completed: true },
  POST_OP_INSTRUCTIONS: { opened: true, completed: false },
};

function metrics(linkType: PatientLinkType, sent = 0): PatientLinkMetrics {
  const s = SIGNALS[linkType];
  const rate = (n: number) => (sent === 0 ? null : Math.round((n * 1000) / sent) / 10);
  return {
    linkType,
    tracksOpened: s.opened,
    tracksCompleted: s.completed,
    sent,
    opened: s.opened ? Math.floor(sent * 0.7) : null,
    completed: s.completed ? Math.floor(sent * 0.5) : null,
    expiredUnopened: s.opened ? Math.floor(sent * 0.2) : null,
    openedRate: s.opened ? rate(Math.floor(sent * 0.7)) : null,
    completedRate: s.completed ? rate(Math.floor(sent * 0.5)) : null,
    expiredUnopenedRate: s.opened ? rate(Math.floor(sent * 0.2)) : null,
    medianHoursToComplete: s.completed && sent > 0 ? 5.5 : null,
  };
}

const TYPES: PatientLinkType[] = [
  'ANAMNESIS',
  'CONSENT_SIGNATURE',
  'BUDGET_SIGNATURE',
  'APPOINTMENT_CONFIRMATION',
  'POST_OP_INSTRUCTIONS',
];
const rows = (sent: Partial<Record<PatientLinkType, number>>) => TYPES.map((t) => metrics(t, sent[t] ?? 0));

function report(overrides: Partial<PatientLinksReport> = {}): PatientLinksReport {
  return {
    from: '2026-11-01',
    to: '2026-11-12',
    locationId: null,
    restrictedToLocations: false,
    asOf: '2026-11-12T15:00:00.000Z',
    totals: rows({ ANAMNESIS: 10, CONSENT_SIGNATURE: 40, APPOINTMENT_CONFIRMATION: 20, POST_OP_INSTRUCTIONS: 10 }),
    locations: [
      {
        locationId: 'loc-1',
        locationName: 'Sede Chacao',
        timeZone: 'America/Caracas',
        rows: rows({ ANAMNESIS: 10, CONSENT_SIGNATURE: 30, APPOINTMENT_CONFIRMATION: 20, POST_OP_INSTRUCTIONS: 10 }),
      },
      {
        locationId: 'loc-2',
        locationName: 'Sede Norte',
        timeZone: 'America/Caracas',
        rows: rows({ ANAMNESIS: 3, CONSENT_SIGNATURE: 10 }),
      },
    ],
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

describe('PatientLinksView (DX-424)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=enlaces-paciente');
    jest.mocked(useSedeFormat).mockReturnValue({
      status: 'ready',
      fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }),
    } as ReturnType<typeof useSedeFormat>);
    jest.mocked(listLocations).mockResolvedValue([
      clinicLocation({ id: 'loc-1', name: 'Sede Chacao' }),
      clinicLocation({ id: 'loc-2', name: 'Sede Norte' }),
    ]);
    mockedGet.mockResolvedValue(report());
  });

  it('pide el mes en curso de la sede y pinta el total y una tabla por sede, un tipo por fila', async () => {
    render(<PatientLinksView token="t" />);
    const total = await screen.findByRole('table', { name: 'Uso de los enlaces del paciente: Todas tus sedes' });
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-11-01', to: '2026-11-12' });
    expect(screen.getByRole('table', { name: 'Uso de los enlaces del paciente: Sede Chacao' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Uso de los enlaces del paciente: Sede Norte' })).toBeInTheDocument();
    const [header, ...body] = within(total).getAllByRole('row');
    expect(flat(header.textContent)).toContain('Caducados sin abrir');
    expect(body).toHaveLength(5);
    const consent = body[1];
    expect(flat(consent.textContent)).toContain('Firma de consentimiento');
    expect(flat(consent.textContent)).toMatch(/28 · 70\s?%/);
    expect(flat(consent.textContent)).toMatch(/20 · 50\s?%/);
    expect(flat(consent.textContent)).toMatch(/8 · 20\s?%/);
    expect(flat(consent.textContent)).toMatch(/5[,.]5 h/);
    // Una tasa con decimal: 2 de 3 anamnesis abiertas en la Norte.
    const norte = screen.getByRole('table', { name: 'Uso de los enlaces del paciente: Sede Norte' });
    expect(flat(within(norte).getAllByRole('row')[1].textContent)).toMatch(/2 · 66[,.]7\s?%/);
  });

  it('«—» donde no hay dato: la confirmación sin apertura, las indicaciones sin completar, sin envíos sin porcentaje; con leyenda', async () => {
    render(<PatientLinksView token="t" />);
    const total = await screen.findByRole('table', { name: 'Uso de los enlaces del paciente: Todas tus sedes' });
    const [, , , budget, confirmation, postOp] = within(total).getAllByRole('row');
    expect(flat(confirmation.textContent)).toContain('Confirmación de cita');
    expect(within(confirmation).getAllByText('—')).toHaveLength(2);
    expect(within(postOp).getAllByText('—')).toHaveLength(2);
    // Presupuesto sin envíos: ceros sin porcentaje y sin mediana.
    expect(flat(budget.textContent)).not.toMatch(/%/);
    expect(within(budget).getAllByText('—')).toHaveLength(1);
    expect(screen.getByTestId('patient-links-legend')).toHaveTextContent('la confirmación de cita no registra si el paciente abrió el enlace');
  });

  it('una sola sede (filtro): una tabla con su nombre, sin «Todas tus sedes»', async () => {
    search = new URLSearchParams('tab=enlaces-paciente&sede=loc-2');
    const one = report();
    mockedGet.mockResolvedValue({ ...one, locationId: 'loc-2', totals: one.locations[1].rows, locations: [one.locations[1]] });
    render(<PatientLinksView token="t" />);
    await screen.findByRole('table', { name: 'Uso de los enlaces del paciente: Sede Norte' });
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-11-01', to: '2026-11-12', locationId: 'loc-2' });
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('«Cómo se calcula» explica la base de los porcentajes y que un anulado no caduca', async () => {
    render(<PatientLinksView token="t" />);
    await screen.findAllByRole('table');
    const how = screen.getByTestId('patient-links-how');
    expect(how).toHaveTextContent('Cada porcentaje es sobre los enlaces enviados en el período.');
    await userEvent.click(within(how).getByRole('button', { name: /Cómo se calcula/ }));
    expect(how).toHaveTextContent('Un enlace anulado o reemplazado por otro no cuenta');
    expect(how).toHaveTextContent('Sin nombres, teléfonos ni emails de pacientes.');
  });

  it('a 390 px cada tipo es una tarjeta (sin tabla) y los «—» no se pintan', async () => {
    const restore = mockPhone(true);
    try {
      render(<PatientLinksView token="t" />);
      const list = await screen.findByRole('list', { name: 'Uso de los enlaces del paciente: Todas tus sedes' });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const [, consent, , confirmation] = within(list).getAllByRole('listitem');
      expect(flat(consent.textContent)).toContain('40 enviados');
      expect(flat(consent.textContent)).toMatch(/Abiertos 28 · 70\s?%/);
      expect(flat(consent.textContent)).toMatch(/Mediana 5[,.]5 h/);
      expect(flat(confirmation.textContent)).not.toContain('Abiertos');
      expect(flat(confirmation.textContent)).not.toContain('—');
    } finally {
      restore();
    }
  });

  it('atajos de período y sede en la URL conservando la pestaña', async () => {
    render(<PatientLinksView token="t" />);
    await screen.findAllByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Enviados en'), 'last_month');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=enlaces-paciente&periodo=last_month', { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText('Enviados en'), 'custom');
    expect(replace).toHaveBeenLastCalledWith(
      '/reportes?tab=enlaces-paciente&periodo=custom&desde=2026-11-01&hasta=2026-11-12',
      { scroll: false },
    );
    const sede = screen.getByLabelText('Sede');
    await waitFor(() => expect(sede).toBeEnabled());
    await userEvent.selectOptions(sede, 'loc-2');
    expect(replace).toHaveBeenLastCalledWith('/reportes?tab=enlaces-paciente&sede=loc-2', { scroll: false });
  });

  it('personalizado de más de 366 días: error junto a las fechas, sin pedir nada', async () => {
    search = new URLSearchParams('tab=enlaces-paciente&periodo=custom&desde=2025-01-01&hasta=2026-01-02');
    render(<PatientLinksView token="t" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El período no es válido');
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('vacío: ningún enlace enviado', async () => {
    mockedGet.mockResolvedValue(report({ totals: rows({}), locations: [] }));
    render(<PatientLinksView token="t" />);
    expect(await screen.findByText('Sin enlaces enviados')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('cargando: esqueleto', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    render(<PatientLinksView token="t" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('error: escalón de sección con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom'));
    render(<PatientLinksView token="t" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el uso de los enlaces del paciente.');
    await userEvent.click(within(alert).getByRole('button'));
    await screen.findAllByRole('table');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('403 sin sede: aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Prohibido'));
    render(<PatientLinksView token="t" />);
    expect(await screen.findByText('Tu rol no tiene acceso al uso de los enlaces del paciente.')).toBeInTheDocument();
  });

  it('miembro restringido: «Solo incluye tus sedes.»', async () => {
    mockedGet.mockResolvedValue(report({ restrictedToLocations: true }));
    render(<PatientLinksView token="t" />);
    expect(await screen.findByTestId('patient-links-restricted')).toHaveTextContent('Solo incluye tus sedes.');
  });
});
