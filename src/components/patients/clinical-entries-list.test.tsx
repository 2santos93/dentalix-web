import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalEntriesList } from './clinical-entries-list';
import {
  listClinicalEntries,
  createClinicalEntry,
  createClinicalEntryAddendum,
} from '@/lib/patients/clinical-api';
import { listStaff } from '@/lib/staff/staff-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform — use a relative path (same convention as the other tests).
// DX-378: el día de la cita sale con la zona y el formato de la sede (Caracas, es-VE).
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(() => Promise.resolve([jest.requireActual('../../lib/test/sede-clock').caracasSede()])),
}));
jest.mock('../../lib/patients/clinical-api', () => ({
  ...jest.requireActual('../../lib/patients/clinical-api'),
  listClinicalEntries: jest.fn(),
  createClinicalEntry: jest.fn(),
  createClinicalEntryAddendum: jest.fn(),
}));
// El autor de cada evolución se resuelve contra el personal de la clínica.
jest.mock('../../lib/staff/staff-api', () => ({
  listStaff: jest.fn(),
}));
// DX-170: el modal «Nueva evolución» pide las plantillas al abrirse.
jest.mock('../../lib/clinical-notes/note-templates-api', () => ({
  listNoteTemplates: jest.fn().mockResolvedValue([]),
}));

const mockedList = listClinicalEntries as jest.MockedFunction<typeof listClinicalEntries>;
const mockedCreate = createClinicalEntry as jest.MockedFunction<typeof createClinicalEntry>;
const mockedCreateAddendum = createClinicalEntryAddendum as jest.MockedFunction<
  typeof createClinicalEntryAddendum
>;
const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;

const staff = [
  { userId: 'u1', fullName: 'Dra. Ana Ríos', email: 'ana@demo.com', role: 'DENTIST' as const, locationIds: null },
];

const entries = [
  {
    id: 'ce-2',
    tenantId: 't1',
    patientId: 'p1',
    entryDate: '2026-02-01T00:00:00.000Z',
    reason: 'Control',
    notes: 'Todo en orden',
    performedById: 'u1',
    createdAt: '2026-02-01T00:00:00.000Z',
    addenda: [],
  },
  {
    id: 'ce-1',
    tenantId: 't1',
    patientId: 'p1',
    entryDate: '2026-01-01T00:00:00.000Z',
    reason: 'Consulta inicial',
    notes: 'Primera visita',
    performedById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    addenda: [],
  },
];

describe('ClinicalEntriesList', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedCreateAddendum.mockReset();
    mockedListStaff.mockReset();
    mockedListStaff.mockResolvedValue(staff);
  });

  it('carga con esqueleto, nunca con un «Cargando…» pelado', () => {
    // Contrato de `AsyncSection`, documentado en el propio componente: el
    // estado de carga es un esqueleto con la forma del contenido, no una
    // cadena suelta.
    mockedList.mockReturnValue(new Promise(() => {}));
    // También el personal queda pendiente: si resolviera después de terminar
    // el test, su `setState` caería fuera de `act()`.
    mockedListStaff.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ClinicalEntriesList token="tok" patientId="p1" />);
    // El esqueleto se ANUNCIA como carga (`role="status"` + `aria-label`) pero
    // no imprime la palabra en pantalla: la forma la da el bloque pulsante.
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument();
  });

  it('nombra al autor y la fecha en que el SERVIDOR registró la evolución', async () => {
    // El dato médico-legal: `entryDate` la escribe el usuario y puede ser
    // retroactiva; `createdAt` + `performedById` los pone el servidor. Un
    // revisor busca lo segundo.
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    const rows = await screen.findAllByText(/Dra\. Ana Ríos/);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('si el personal no carga, la evolución conserva su marca de tiempo', async () => {
    mockedListStaff.mockRejectedValue(new Error('sin red'));
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    // Fail soft: no se oculta el registro por no poder nombrar a quien lo hizo.
    expect((await screen.findAllByText(/todo en orden/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Dra\. Ana Ríos/)).not.toBeInTheDocument();
  });

  it('distingue la fecha de atención del registro con dos encabezados propios', async () => {
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    const table = await screen.findByRole('table', { name: /evoluciones del paciente/i });
    expect(within(table).getByRole('columnheader', { name: /fecha de atención/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /^registro$/i })).toBeInTheDocument();
  });

  /** Abre «Nueva evolución» (DX-170: el formulario vive en un modal). */
  async function openNewEntry(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /nueva evolución/i }));
    return screen.findByRole('dialog', { name: /nueva evolución/i });
  }

  it('no acepta una atención en el futuro', async () => {
    mockedList.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);
    const dialog = await openNewEntry(user);

    const date = within(dialog).getByLabelText(/fecha de atención/i);
    // El `max` del input lo bloquea en el navegador; el guard cubre teclado y
    // pegado, así que se comprueba que el atributo existe.
    expect(date).toHaveAttribute('max');

    await user.type(within(dialog).getByLabelText(/texto de la evolución/i), 'algo');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no entries', async () => {
    mockedList.mockResolvedValue([]);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    expect(await screen.findByText(/no hay evoluciones/i)).toBeInTheDocument();
  });

  it('renders the entries (reason + notes), most recent first', async () => {
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    // Rendered twice — desktop table + mobile cards (same convention as
    // PatientsTable).
    expect(await screen.findAllByText('Control')).toHaveLength(2);
    expect(screen.getAllByText('Todo en orden')).toHaveLength(2);
    expect(screen.getAllByText('Consulta inicial')).toHaveLength(2);
    expect(screen.getAllByText('Primera visita')).toHaveLength(2);
  });

  // DX-318: sin indicador de preparación por evolución (ni su chip ni su
  // petición): toda la API está simulada, así que cualquier fetch sobra.
  it('DX-318: la ficha no muestra chips de estado ni hace peticiones propias', async () => {
    const fetchSpy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() => new Promise(() => {}));
    const realFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      mockedList.mockResolvedValue(entries);
      render(<ClinicalEntriesList token="tok" patientId="p1" />);
      expect(await screen.findAllByText('Todo en orden')).toHaveLength(2);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /faltan|listo/i })).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });

  it('«Nueva evolución» abre el formulario en un modal con sus etiquetas', async () => {
    mockedList.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);
    const dialog = await openNewEntry(user);

    expect(within(dialog).getByLabelText(/fecha de atención/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/motivo/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/texto de la evolución/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /guardar evolución/i })).toBeInTheDocument();
  });

  it('guarda con createClinicalEntry, cierra el modal y muestra la nueva evolución', async () => {
    mockedList.mockResolvedValue([]);
    const created = {
      id: 'ce-3',
      tenantId: 't1',
      patientId: 'p1',
      entryDate: '2026-03-01T00:00:00.000Z',
      reason: null,
      notes: 'Nueva evolución registrada',
      performedById: 'u1',
      createdAt: '2026-03-01T00:00:00.000Z',
      addenda: [],
    };
    mockedCreate.mockResolvedValue(created);

    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);
    const dialog = await openNewEntry(user);

    await user.type(within(dialog).getByLabelText(/texto de la evolución/i), 'Nueva evolución registrada');
    await user.click(within(dialog).getByRole('button', { name: /guardar evolución/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({ notes: 'Nueva evolución registrada' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Rendered twice — desktop table + mobile cards.
    expect(await screen.findAllByText('Nueva evolución registrada')).toHaveLength(2);
  });

  it('sin texto no guarda y lo dice junto al campo', async () => {
    mockedList.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);
    const dialog = await openNewEntry(user);
    await user.click(within(dialog).getByRole('button', { name: /guardar evolución/i }));
    expect(await within(dialog).findByText(/escribe el texto de la evolución/i)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('DX-170: una evolución ligada a una cita dice de qué cita es y con quién', async () => {
    const start = new Date(2026, 1, 1, 9, 30).toISOString();
    mockedList.mockResolvedValue([
      {
        ...entries[0],
        appointmentId: 'apt-1',
        templateId: 'tpl-1',
        appointment: { id: 'apt-1', start, providerId: 'u1', providerName: 'Dra. Ana Ríos' },
      },
      entries[1],
    ]);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    // Tabla + tarjeta; la evolución suelta no lleva la línea.
    expect(await screen.findAllByText('Cita del 1/2 · Dra. Ana Ríos')).toHaveLength(2);
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedList.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las evoluciones.');
  });

  it('shows an alert with the API error message when creating fails', async () => {
    mockedList.mockResolvedValue([]);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedCreate.mockRejectedValue(new ApiError(400, 'La cita no es de este paciente'));

    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);
    const dialog = await openNewEntry(user);
    await user.type(within(dialog).getByLabelText(/texto de la evolución/i), 'x');
    await user.click(within(dialog).getByRole('button', { name: /guardar evolución/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La cita no es de este paciente');
  });

  describe('adendas (DX-038)', () => {
    const addendum = {
      id: 'ad-1',
      tenantId: 't1',
      patientId: 'p1',
      clinicalEntryId: 'ce-1',
      reason: 'Pieza mal transcrita',
      text: 'Es la 36, no la 46.',
      authorId: 'u1',
      createdAt: '2026-01-02T15:00:00.000Z',
    };

    it('no ofrece editar ni borrar una evolución', async () => {
      mockedList.mockResolvedValue(entries);
      render(<ClinicalEntriesList token="tok" patientId="p1" />);
      await screen.findAllByText('Primera visita');
      expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).toBeNull();
    });

    it('muestra las adendas debajo del original intacto, con motivo, autor y fecha', async () => {
      mockedList.mockResolvedValue([entries[0], { ...entries[1], addenda: [addendum] }]);
      render(<ClinicalEntriesList token="tok" patientId="p1" />);

      const lists = await screen.findAllByRole('list', { name: /adendas de la evolución/i });
      expect(lists).toHaveLength(2); // tabla + tarjetas
      const first = lists[0];
      expect(within(first).getByText('Es la 36, no la 46.')).toBeInTheDocument();
      expect(within(first).getByText(/Pieza mal transcrita/)).toBeInTheDocument();
      expect(within(first).getByText(/Dra\. Ana Ríos/)).toBeInTheDocument();
      expect(screen.getAllByText('Primera visita')).toHaveLength(2);
    });

    it('valida motivo y texto en el modal sin llamar a la API', async () => {
      mockedList.mockResolvedValue(entries);
      const user = userEvent.setup();
      render(<ClinicalEntriesList token="tok" patientId="p1" />);
      const buttons = await screen.findAllByRole('button', { name: /añadir adenda a la evolución/i });
      await user.click(buttons[0]);

      const dialog = await screen.findByRole('dialog', { name: /añadir adenda/i });
      await user.type(within(dialog).getByLabelText(/motivo de la corrección/i), 'corto');
      await user.click(within(dialog).getByRole('button', { name: /guardar adenda/i }));

      expect(await within(dialog).findByText(/al menos 10 caracteres/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/escribe el texto de la adenda/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/motivo de la corrección/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(mockedCreateAddendum).not.toHaveBeenCalled();
    });

    it('crea la adenda, cierra el modal y la muestra bajo su evolución', async () => {
      mockedList.mockResolvedValue(entries);
      mockedCreateAddendum.mockResolvedValue(addendum);
      const user = userEvent.setup();
      render(<ClinicalEntriesList token="tok" patientId="p1" />);
      const buttons = await screen.findAllByRole('button', {
        name: /añadir adenda a la evolución/i,
      });
      // ce-1 es la segunda fila de la tabla.
      await user.click(buttons[1]);

      const dialog = await screen.findByRole('dialog', { name: /añadir adenda/i });
      await user.type(
        within(dialog).getByLabelText(/motivo de la corrección/i),
        '  Pieza mal transcrita ',
      );
      await user.type(within(dialog).getByLabelText(/texto de la adenda/i), 'Es la 36, no la 46.');
      await user.click(within(dialog).getByRole('button', { name: /guardar adenda/i }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockedCreateAddendum).toHaveBeenCalledWith('tok', 'p1', 'ce-1', {
        reason: 'Pieza mal transcrita',
        text: 'Es la 36, no la 46.',
      });
      expect(await screen.findAllByText('Es la 36, no la 46.')).toHaveLength(2);
    });

    it('si la API falla, el modal sigue abierto con el error y lo escrito', async () => {
      const { ApiError } = jest.requireActual('../../lib/api/client');
      mockedList.mockResolvedValue(entries);
      mockedCreateAddendum.mockRejectedValue(
        new ApiError(404, 'Evolución no encontrada en la historia clínica de este paciente'),
      );
      const user = userEvent.setup();
      render(<ClinicalEntriesList token="tok" patientId="p1" />);
      const buttons = await screen.findAllByRole('button', {
        name: /añadir adenda a la evolución/i,
      });
      await user.click(buttons[0]);
      const dialog = await screen.findByRole('dialog', { name: /añadir adenda/i });
      await user.type(
        within(dialog).getByLabelText(/motivo de la corrección/i),
        'Pieza mal transcrita',
      );
      await user.type(within(dialog).getByLabelText(/texto de la adenda/i), 'Texto');
      await user.click(within(dialog).getByRole('button', { name: /guardar adenda/i }));

      expect(await within(dialog).findByText(/evolución no encontrada/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/texto de la adenda/i)).toHaveValue('Texto');
    });
  });
});
