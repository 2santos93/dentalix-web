import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import {
  createRecallContact,
  getPatientRecalls,
  listRecallTypes,
  setPatientRecall,
  type PatientRecall,
  type PatientRecalls,
  type RecallType,
} from '@/lib/recall/recall-api';
import { PatientRecallSection } from './patient-recall-section';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/recall/recall-api', () => ({
  getPatientRecalls: jest.fn(),
  listRecallTypes: jest.fn(),
  setPatientRecall: jest.fn(),
  createRecallContact: jest.fn(),
}));
const mockedGet = getPatientRecalls as jest.MockedFunction<typeof getPatientRecalls>;
const mockedSet = setPatientRecall as jest.MockedFunction<typeof setPatientRecall>;
const mockedContact = createRecallContact as jest.MockedFunction<typeof createRecallContact>;
const mockedTypes = jest.mocked(listRecallTypes);

const type = (over: Partial<RecallType> & Pick<RecallType, 'id' | 'name'>): RecallType => ({
  defaultIntervalMonths: 6,
  active: true,
  sortOrder: 10,
  systemKey: null,
  exclusionGroup: null,
  triggerCatalogItemIds: [],
  ...over,
});
// Los tipos por defecto de la API (DX-015-bis), en su orden.
const TYPES: RecallType[] = [
  type({ id: 't-hyg', name: 'Higiene', systemKey: 'HYGIENE', sortOrder: 10, exclusionGroup: 'HYGIENE_PERIO' }),
  type({ id: 't-ctl', name: 'Control', systemKey: 'CHECKUP', sortOrder: 20, defaultIntervalMonths: 12 }),
  type({ id: 't-perio', name: 'Mantenimiento periodontal', sortOrder: 30, defaultIntervalMonths: 3 }),
];

const patient = { id: 'pat-1', fullName: 'Ana Pérez' };
const recall: PatientRecall = {
  id: 'r1',
  kind: 'CHECKUP',
  recallTypeId: 't-ctl',
  recallTypeName: 'Control',
  intervalMonths: 6,
  lastDoneAt: '2026-04-10',
  manualDoneAt: '2026-04-10',
  lastDoneItemId: null,
  source: 'MANUAL',
  preBackfillDoneAt: null,
  active: true,
  disabledUntil: null,
  disabledReason: null,
  locationId: 'l1',
  baseDate: '2026-04-10',
  dueAt: '2026-10-10',
  daysOverdue: 22,
  status: 'DUE',
  updatedAt: '2026-04-10T12:00:00.000Z',
  updatedBy: { id: 'u1', fullName: 'Dra. Ruiz' },
};
const data: PatientRecalls = {
  recalls: [recall],
  contacts: [
    {
      id: 'c1',
      recallId: 'r1',
      kind: 'CHECKUP',
      recallTypeId: 't-ctl',
      recallTypeName: 'Control',
      patientId: 'pat-1',
      locationId: null,
      channel: 'CALL',
      outcome: 'NO_ANSWER',
      note: 'Volver a llamar',
      appointmentId: null,
      author: { id: 'u2', fullName: 'Rita' },
      createdAt: '2026-10-20T15:00:00.000Z',
    },
  ],
};

describe('PatientRecallSection (DX-015)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSet.mockReset();
    mockedContact.mockReset();
    mockedTypes.mockReset();
    mockedTypes.mockResolvedValue(TYPES);
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([clinicLocation({ id: 'l1' })]);
  });

  it('DX-354b: el vencimiento y el contacto salen con la sede de cada uno (recall de Berlín, contacto sin sede con la de la pantalla)', async () => {
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([
      { ...STAMP_SEDES.caracas, id: 'l1' },
      STAMP_SEDES.berlin,
    ]);
    mockedGet.mockResolvedValue({
      ...data,
      recalls: data.recalls.map((r) => ({ ...r, locationId: STAMP_SEDES.berlin.id })),
    });
    render(<PatientRecallSection token="tok" patient={patient} canSet={false} canContact={false} />);
    const row = await screen.findByTestId('recall-row-CHECKUP');
    await waitFor(() => expect(row).toHaveTextContent(`Vence el ${STAMP_FORMATS.berlin.civilDate('2026-10-10')}`));
    const contact = data.contacts[0];
    expect(screen.getByTestId('recall-contact-row')).toHaveTextContent(
      STAMP_FORMATS.caracas.dateTime(new Date(contact.createdAt), 'America/Caracas'),
    );
  });

  it('un renglón por tipo con estado y vencimiento, y el historial de contactos', async () => {
    mockedGet.mockResolvedValue(data);
    render(<PatientRecallSection token="tok" patient={patient} canSet={false} canContact={false} />);
    const row = await screen.findByTestId('recall-row-CHECKUP');
    expect(within(row).getByText('Por llamar')).toBeInTheDocument();
    expect(within(row).getByText(/Cada 6 meses · Vence el/)).toBeInTheDocument();
    expect(within(screen.getByTestId('recall-row-HYGIENE')).getByText('Sin recall')).toBeInTheDocument();
    expect(within(screen.getByTestId('recall-contact-row')).getByText('Control · Llamada · No contesta')).toBeInTheDocument();
    // Solo lectura: sin acciones.
    expect(screen.queryByRole('button', { name: /Fijar|Cambiar|Registrar/ })).not.toBeInTheDocument();
  });

  it('error con «Reintentar»', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(data);
    render(<PatientRecallSection token="tok" patient={patient} canSet canContact />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('recall-contact-row')).toBeInTheDocument();
  });

  it('el clínico fija «cada 3 meses»; al cambiar solo el intervalo no manda fecha (la API conserva lo fijado)', async () => {
    mockedGet.mockResolvedValue(data);
    mockedSet.mockResolvedValue(data);
    render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar recall de control' }));
    await userEvent.selectOptions(await screen.findByLabelText('Intervalo'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar recall' }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith('tok', 'pat-1', 't-ctl', {
        intervalMonths: 3,
        active: true,
        disabledUntil: null,
        disabledReason: null,
      }),
    );
    expect(await screen.findByText('Recall guardado.')).toBeInTheDocument();
  });

  it('el mostrador registra un contacto y exige canal y resultado', async () => {
    mockedGet.mockResolvedValue(data);
    mockedContact.mockResolvedValue(data.contacts[0]);
    render(<PatientRecallSection token="tok" patient={patient} canSet={false} canContact />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar contacto de control' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar contacto' }));
    expect(await screen.findByText('Elige el canal del contacto.')).toBeInTheDocument();
    expect(mockedContact).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Canal'), 'CALL');
    await userEvent.selectOptions(screen.getByLabelText('Resultado'), 'NO_ANSWER');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto' }));
    await waitFor(() => expect(mockedContact).toHaveBeenCalledWith('tok', 'r1', { channel: 'CALL', outcome: 'NO_ANSWER' }));
  });

  describe('DX-015-bis: tipos de la clínica', () => {
    it('un renglón por tipo de GET /recall-types, en su orden; uno nuevo nace con el intervalo de su tipo', async () => {
      mockedGet.mockResolvedValue(data);
      mockedSet.mockResolvedValue(data);
      render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
      await screen.findByTestId('recall-row-CHECKUP');
      const rows = screen.getAllByTestId(/^recall-row-/).map((r) => r.getAttribute('data-testid'));
      expect(rows).toEqual(['recall-row-HYGIENE', 'recall-row-CHECKUP', 'recall-row-t-perio']);
      const perio = screen.getByTestId('recall-row-t-perio');
      expect(within(perio).getByText('Mantenimiento periodontal')).toBeInTheDocument();
      expect(within(perio).getByText('Sin recall')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Fijar recall de mantenimiento periodontal' }));
      expect(await screen.findByRole('dialog', { name: 'Recall de mantenimiento periodontal' })).toBeInTheDocument();
      expect(screen.getByLabelText('Intervalo')).toHaveValue('3');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar recall' }));
      await waitFor(() =>
        expect(mockedSet).toHaveBeenCalledWith('tok', 'pat-1', 't-perio', expect.objectContaining({ intervalMonths: 3 })),
      );
    });

    it('si GET /recall-types falla, Higiene y Control por su clave (respaldo)', async () => {
      mockedTypes.mockRejectedValue(new ApiError(500, 'boom'));
      mockedGet.mockResolvedValue(data);
      mockedSet.mockResolvedValue(data);
      render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
      const row = await screen.findByTestId('recall-row-CHECKUP');
      expect(within(row).getByText('Control')).toBeInTheDocument();
      expect(within(screen.getByTestId('recall-row-HYGIENE')).getByText('Higiene')).toBeInTheDocument();
      expect(screen.queryByTestId('recall-row-t-perio')).not.toBeInTheDocument();
      // Ningún error a la vista: la sección se lee igual.
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Cambiar recall de control' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar recall' }));
      await waitFor(() => expect(mockedSet).toHaveBeenCalledWith('tok', 'pat-1', 'CHECKUP', expect.anything()));
    });

    it('cambiar solo el intervalo no manda fecha: ni el día del procedimiento ni lo fijado (revisión 1, MAJOR-1)', async () => {
      // Fijado en enero; una profilaxis de junio da la base.
      const both = { ...recall, manualDoneAt: '2026-01-10', lastDoneAt: '2026-06-10', lastDoneItemId: 'item-1' };
      mockedGet.mockResolvedValue({ recalls: [both], contacts: [] });
      mockedSet.mockResolvedValue(data);
      render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Cambiar recall de control' }));
      // El campo muestra lo fijado a mano (enero), no la base (junio).
      const field = await screen.findByRole('group', { name: 'Fecha fijada a mano' });
      expect(within(field).getAllByRole('spinbutton').map((x) => x.textContent)).toEqual(['10', '01', '2026']);
      expect(screen.getByText(/Si no la cambias, se conserva/)).toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText('Intervalo'), '3');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar recall' }));
      await waitFor(() => expect(mockedSet).toHaveBeenCalled());
      const [, , , body] = mockedSet.mock.calls[0];
      expect(body).toMatchObject({ intervalMonths: 3 });
      expect(body).not.toHaveProperty('lastDoneAt');
    });

    it('un recall nacido de un procedimiento abre con la fecha vacía y, sin tocarla, no la manda', async () => {
      const born = { ...recall, manualDoneAt: null, lastDoneAt: '2026-06-10', lastDoneItemId: 'item-1', source: 'PROCEDURE' as const };
      mockedGet.mockResolvedValue({ recalls: [born], contacts: [] });
      mockedSet.mockResolvedValue(data);
      render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Cambiar recall de control' }));
      const field = await screen.findByRole('group', { name: 'Fecha fijada a mano' });
      expect(within(field).getAllByRole('spinbutton').map((x) => x.textContent)).not.toContain('2026');
      expect(screen.queryByText(/queda fijada a mano/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Guardar recall' }));
      await waitFor(() => expect(mockedSet).toHaveBeenCalled());
      expect(mockedSet.mock.calls[0][3]).not.toHaveProperty('lastDoneAt');
    });

    it('si el clínico cambia la fecha, se manda', async () => {
      const born = { ...recall, manualDoneAt: null, lastDoneAt: '2026-06-10', lastDoneItemId: 'item-1', source: 'PROCEDURE' as const };
      mockedGet.mockResolvedValue({ recalls: [born], contacts: [] });
      mockedSet.mockResolvedValue(data);
      const user = userEvent.setup();
      render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
      await user.click(await screen.findByRole('button', { name: 'Cambiar recall de control' }));
      const field = await screen.findByRole('group', { name: 'Fecha fijada a mano' });
      await user.click(within(field).getAllByRole('spinbutton')[0]);
      await user.keyboard('05032026');
      await user.click(screen.getByRole('button', { name: 'Guardar recall' }));
      await waitFor(() =>
        expect(mockedSet).toHaveBeenCalledWith('tok', 'pat-1', 't-ctl', expect.objectContaining({ lastDoneAt: '2026-03-05' })),
      );
    });

    it('un recall nuevo sin fecha no la manda (la API pone hoy); con fecha, sí', async () => {
      mockedGet.mockResolvedValue({ recalls: [], contacts: [] });
      mockedSet.mockResolvedValue({ recalls: [], contacts: [] });
      const user = userEvent.setup();
      render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
      await user.click(await screen.findByRole('button', { name: 'Fijar recall de higiene' }));
      expect(await screen.findByText(/Vacío: hoy/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Guardar recall' }));
      await waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(1));
      expect(mockedSet.mock.calls[0][3]).not.toHaveProperty('lastDoneAt');
      await user.click(await screen.findByRole('button', { name: 'Fijar recall de control' }));
      const field = await screen.findByRole('group', { name: 'Fecha fijada a mano' });
      await user.click(within(field).getAllByRole('spinbutton')[0]);
      await user.keyboard('05032026');
      await user.click(screen.getByRole('button', { name: 'Guardar recall' }));
      await waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(2));
      expect(mockedSet.mock.calls[1][3]).toMatchObject({ lastDoneAt: '2026-03-05' });
    });

    it('un recall de un tipo que ya no existe se ve, pero sin «Cambiar» (revisión 1, MINOR-3)', async () => {
      mockedTypes.mockResolvedValue([TYPES[0], TYPES[1]]);
      mockedGet.mockResolvedValue({
        recalls: [{ ...recall, id: 'r9', kind: null, recallTypeId: 't-gone', recallTypeName: 'Ortodoncia' }],
        contacts: [],
      });
      render(<PatientRecallSection token="tok" patient={patient} canSet canContact={false} />);
      const row = await screen.findByTestId('recall-row-t-gone');
      expect(within(row).getByText('Ortodoncia')).toBeInTheDocument();
      expect(within(row).getByText(/ya no existe en la clínica/)).toBeInTheDocument();
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
      // Los tipos vivos sí se fijan.
      expect(screen.getByRole('button', { name: 'Fijar recall de control' })).toBeInTheDocument();
    });

    it('un recall de un tipo desactivado sigue a la vista con su nombre', async () => {
      mockedTypes.mockResolvedValue([TYPES[0], TYPES[1], { ...TYPES[2], active: false }]);
      mockedGet.mockResolvedValue({
        recalls: [{ ...recall, id: 'r9', kind: null, recallTypeId: 't-perio', recallTypeName: 'Mantenimiento periodontal' }],
        contacts: [],
      });
      render(<PatientRecallSection token="tok" patient={patient} canSet={false} canContact={false} />);
      const row = await screen.findByTestId('recall-row-t-perio');
      expect(within(row).getByText('Mantenimiento periodontal')).toBeInTheDocument();
      expect(within(row).getByText('Por llamar')).toBeInTheDocument();
    });

    it.each([
      [
        'el procedimiento realizado',
        { lastDoneItemId: 'item-1', source: 'PROCEDURE', manualDoneAt: null } as const,
        'Cuenta desde el procedimiento realizado el',
      ],
      [
        'la última visita congelada en el despliegue (no «fijado a mano»)',
        { preBackfillDoneAt: '2025-12-01', source: 'MANUAL' } as const,
        'Cuenta desde la última visita atendida, el',
      ],
      ['lo fijado a mano', {}, 'Cuenta desde el'],
    ])('dice de dónde cuenta el plazo: %s', async (_name, over, text) => {
      (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([{ ...STAMP_SEDES.caracas, id: 'l1' }]);
      mockedGet.mockResolvedValue({ recalls: [{ ...recall, ...over }], contacts: [] });
      render(<PatientRecallSection token="tok" patient={patient} canSet={false} canContact={false} />);
      const row = await screen.findByTestId('recall-row-CHECKUP');
      const day = STAMP_FORMATS.caracas.civilDate('2026-04-10');
      await waitFor(() => expect(within(row).getByTestId('recall-basis')).toHaveTextContent(`${text}`));
      expect(within(row).getByTestId('recall-basis')).toHaveTextContent(day);
      const manual = over === undefined || Object.keys(over).length === 0;
      expect(within(row).getByTestId('recall-basis').textContent?.includes('fijado a mano')).toBe(manual);
    });
  });
});
