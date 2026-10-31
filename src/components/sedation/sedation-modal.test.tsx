import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SedationModal, availableActions, sedationCopy } from './sedation-modal';
import {
  assessSedation,
  dischargeSedation,
  getEntrySedation,
  recordSedationAgent,
  recordSedationChecklist,
  recordSedationVitals,
} from '@/lib/sedation/sedation-api';
import { ApiError } from '@/lib/api/api-error';
import { checkedSheet, platformTemplate, sedationSheet } from '@/lib/test/sedation-sheet';
import { testAgendaClock, utcSede } from '@/lib/test/sede-clock';

jest.mock('../../lib/sedation/sedation-api', () => ({
  ...jest.requireActual('../../lib/sedation/sedation-api'),
  getEntrySedation: jest.fn(),
  assessSedation: jest.fn(),
  recordSedationChecklist: jest.fn(),
  recordSedationVitals: jest.fn(),
  recordSedationAgent: jest.fn(),
  dischargeSedation: jest.fn(),
}));

const mocked = {
  entry: getEntrySedation as jest.Mock,
  assess: assessSedation as jest.Mock,
  checklist: recordSedationChecklist as jest.Mock,
  vitals: recordSedationVitals as jest.Mock,
  agent: recordSedationAgent as jest.Mock,
  discharge: dischargeSedation as jest.Mock,
};

const STAFF = [
  { userId: 'u-dent', fullName: 'Dra. Ana Ríos', email: 'a@x.co', role: 'DENTIST' as const, locationIds: null },
  { userId: 'u-asis', fullName: 'Luis Pérez', email: 'l@x.co', role: 'ASSISTANT' as const, locationIds: null },
  { userId: 'u-rec', fullName: 'Paola Recepción', email: 'p@x.co', role: 'RECEPTION' as const, locationIds: null },
];

// Revisión: otra asistente va ANTES en la lista; no debe salir por defecto.
const STAFF_TWO_ASSISTANTS = [
  { userId: 'u-otra', fullName: 'Ana Otra', email: 'o@x.co', role: 'ASSISTANT' as const, locationIds: null },
  ...STAFF,
];

function intraBy(authorId: string, name = 'Luis Pérez') {
  return {
    id: `v-${authorId}`,
    phase: 'INTRA' as const,
    takenAt: '2026-10-30T15:10:00.000Z',
    spo2: 98,
    heartRate: 90,
    systolic: 100,
    diastolic: 65,
    respiratoryRate: 18,
    etco2: null,
    sedationLevel: 'MINIMAL' as const,
    author: { id: authorId, name },
    createdAt: '2026-10-30T15:10:00.000Z',
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof SedationModal>> = {}) {
  const onSaved = jest.fn();
  render(
    <SedationModal
      open
      onOpenChange={jest.fn()}
      token="t"
      patientId="p1"
      entryId="ce-2"
      entryDateLabel="30/10/2026"
      role="DENTIST"
      userId="u-dent"
      staff={STAFF}
      clock={null}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onSaved };
}

beforeEach(() => {
  Object.values(mocked).forEach((m) => m.mockReset());
});

describe('availableActions (DX-407)', () => {
  it('sigue el orden de la hoja y el rol', () => {
    expect(availableActions(null, 'DENTIST')).toEqual(['ASSESS']);
    expect(availableActions(null, 'ASSISTANT')).toEqual([]);
    expect(availableActions(sedationSheet(), 'DENTIST')).toEqual(['CHECKLIST', 'VITALS']);
    expect(availableActions(sedationSheet(), 'ASSISTANT')).toEqual(['VITALS']);
    expect(availableActions(checkedSheet(), 'ADMIN')).toEqual(['VITALS', 'AGENT', 'DISCHARGE']);
    expect(availableActions(checkedSheet(), 'ASSISTANT')).toEqual(['VITALS']);
    expect(availableActions(checkedSheet(), 'RECEPTION')).toEqual([]);
  });
});

describe('SedationModal (DX-407)', () => {
  it('carga: esqueleto; error: lo dice y reintenta', async () => {
    mocked.entry.mockRejectedValueOnce(new Error('red'));
    mocked.entry.mockResolvedValueOnce({ template: platformTemplate(), sheet: null });
    renderModal();
    expect(screen.getByRole('status', { name: sedationCopy.loading })).toBeInTheDocument();
    expect(await screen.findByText(sedationCopy.loadError)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByLabelText(sedationCopy.grade)).toBeInTheDocument();
  });

  it('vacío para la asistente: lo dice y solo deja cerrar', async () => {
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: null });
    renderModal({ role: 'ASSISTANT' });
    expect(await screen.findByText(sedationCopy.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(sedationCopy.emptyReader)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: sedationCopy.submit.ASSESS })).not.toBeInTheDocument();
  });

  it('valoración: calcula IMC y reversores mientras escribe y envía lo anotado', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: null });
    mocked.assess.mockResolvedValue(sedationSheet());
    const { onSaved } = renderModal();
    await user.selectOptions(await screen.findByLabelText(sedationCopy.grade), 'MODERATE');
    await user.selectOptions(screen.getByLabelText(sedationCopy.asa), 'II');
    await user.type(screen.getByLabelText(sedationCopy.fastingLiquids), '2');
    await user.type(screen.getByLabelText(sedationCopy.fastingSolids), '6');
    await user.selectOptions(screen.getByLabelText(sedationCopy.mallampati), '2');
    await user.type(screen.getByLabelText(sedationCopy.weight), '15');
    await user.type(screen.getByLabelText(sedationCopy.height), '100');
    expect(screen.getByText('Naloxona 1,5 mg · Flumazenil 0,15 mg')).toBeInTheDocument();
    await user.type(screen.getByLabelText(sedationCopy.escortName), 'Laura Ortiz');
    await user.type(screen.getByLabelText(sedationCopy.escortRelationship), 'Madre');
    await user.click(screen.getByLabelText(sedationCopy.consent));
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.ASSESS }));

    await waitFor(() => expect(mocked.assess).toHaveBeenCalled());
    expect(mocked.assess.mock.calls[0][3]).toEqual({
      grade: 'MODERATE',
      asaClass: 'II',
      asaEmergency: false,
      fastingClearLiquidsHours: 2,
      fastingSolidsHours: 6,
      mallampati: 2,
      weightKg: 15,
      heightCm: 100,
      escortName: 'Laura Ortiz',
      escortRelationship: 'Madre',
      consentConfirmed: true,
    });
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByText(sedationCopy.saved.ASSESS)).toBeInTheDocument();
    // La hoja devuelta se pinta: ya se puede hacer el checklist.
    expect(screen.getByText(sedationCopy.checklistPending)).toBeInTheDocument();
  });

  it('ASA III pide interconsulta o justificación; el 400 del servidor se enseña', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: null });
    mocked.assess.mockRejectedValue(
      new ApiError(
        400,
        'Con ASA III registra la interconsulta médica o una justificación (mínimo 10 caracteres) antes de sedar.',
      ),
    );
    renderModal();
    await user.selectOptions(await screen.findByLabelText(sedationCopy.asa), 'III');
    expect(screen.getByLabelText(sedationCopy.interconsultation)).toBeInTheDocument();
    expect(screen.getByLabelText(sedationCopy.justification)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.ASSESS }));
    expect(await screen.findByText(/registra la interconsulta médica/i)).toBeInTheDocument();
  });

  it('un número mal escrito se marca y no se envía', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: null });
    renderModal();
    await user.type(await screen.findByLabelText(sedationCopy.weight), 'quince');
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.ASSESS }));
    expect(screen.getByLabelText(sedationCopy.weight)).toHaveAttribute('aria-invalid', 'true');
    expect(mocked.assess).not.toHaveBeenCalled();
  });

  it('checklist: enseña los reversores por peso y envía cada ítem marcado', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: sedationSheet() });
    mocked.checklist.mockResolvedValue(checkedSheet());
    renderModal();
    const legend = await screen.findByText(sedationCopy.actionLegend);
    expect(legend).toBeInTheDocument();
    // Reversores en la valoración y junto al ítem del checklist.
    expect(screen.getAllByText('Naloxona 1,5 mg · Flumazenil 0,15 mg').length).toBe(2);
    for (const item of platformTemplate().checklist.slice(0, 5)) {
      await user.click(screen.getByRole('checkbox', { name: (name) => name.startsWith(item.label) }));
    }
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.CHECKLIST }));
    await waitFor(() => expect(mocked.checklist).toHaveBeenCalled());
    const items = mocked.checklist.mock.calls[0][3] as { code: string; checked: boolean }[];
    expect(items.filter((i) => i.checked)).toHaveLength(5);
    expect(items.find((i) => i.code === 'TWO_ADULTS_TRANSPORT')?.checked).toBe(false);
  });

  it('la asistente solo registra tomas: intraoperatoria con lo anotado', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: checkedSheet() });
    mocked.vitals.mockResolvedValue(checkedSheet({ status: 'IN_PROGRESS' }));
    renderModal({ role: 'ASSISTANT', userId: 'u-asis' });
    expect(await screen.findByText(sedationCopy.readOnly)).toBeInTheDocument();
    expect(screen.queryByText(sedationCopy.actionLegend)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(sedationCopy.spo2), '98');
    await user.type(screen.getByLabelText(sedationCopy.heartRate), '96');
    await user.type(screen.getByLabelText(sedationCopy.systolic), '98');
    await user.type(screen.getByLabelText(sedationCopy.diastolic), '60');
    await user.type(screen.getByLabelText(sedationCopy.respiratoryRate), '22');
    await user.selectOptions(screen.getByLabelText(sedationCopy.level), 'MINIMAL');
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.VITALS }));
    await waitFor(() => expect(mocked.vitals).toHaveBeenCalled());
    expect(mocked.vitals.mock.calls[0][3]).toEqual({
      phase: 'INTRA',
      spo2: 98,
      heartRate: 96,
      systolic: 98,
      diastolic: 60,
      respiratoryRate: 22,
      sedationLevel: 'MINIMAL',
    });
  });

  it('aviso: pasado el intervalo sin toma, una alerta lo dice', async () => {
    mocked.entry.mockResolvedValue({
      template: platformTemplate(),
      sheet: checkedSheet({
        status: 'IN_PROGRESS',
        watch: {
          intervalMinutes: 5,
          active: true,
          startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
          lastTakenAt: new Date(Date.now() - 16 * 60_000).toISOString(),
          nextDueAt: new Date(Date.now() - 11 * 60_000).toISOString(),
          overdue: true,
          overdueMinutes: 11,
          missedIntervals: 0,
        },
      }),
    });
    renderModal();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Pasó el intervalo de 5 min sin toma: 11 min de retraso');
  });

  it('egreso en sedación moderada con el operador como monitor: pide justificación y envía criterios y monitor', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({
      template: platformTemplate(),
      sheet: checkedSheet({ status: 'IN_PROGRESS', vitals: [intraBy('u-asis')] }),
    });
    mocked.discharge.mockResolvedValue(checkedSheet({ status: 'DISCHARGED' }));
    renderModal({ staff: STAFF_TWO_ASSISTANTS });
    await user.click(await screen.findByRole('radio', { name: sedationCopy.actions.DISCHARGE }));
    // Por defecto, quien registró las tomas (no la primera asistente de la
    // lista); recepción no aparece.
    const monitor = screen.getByLabelText(sedationCopy.monitor);
    expect(monitor).toHaveValue('u-asis');
    expect(within(monitor).queryByText('Paola Recepción')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(sedationCopy.sameMonitorLabel)).not.toBeInTheDocument();
    await user.selectOptions(monitor, 'u-dent');
    await user.type(screen.getByLabelText(sedationCopy.sameMonitorLabel), 'Auxiliar en otra urgencia');
    for (const c of platformTemplate().dischargeCriteria) {
      await user.click(screen.getByRole('checkbox', { name: c.label }));
    }
    await user.click(screen.getByLabelText(sedationCopy.instructions));
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.DISCHARGE }));
    await waitFor(() => expect(mocked.discharge).toHaveBeenCalled());
    expect(mocked.discharge.mock.calls[0][3]).toMatchObject({
      monitorId: 'u-dent',
      sameMonitorJustification: 'Auxiliar en otra urgencia',
      handedOverToName: 'Laura Ortiz',
      handedOverToRelationship: 'Madre',
      instructionsDelivered: true,
      criteria: expect.arrayContaining([{ code: 'HYDRATION', met: true }]),
    });
  });

  it('egreso sin tomas de otra persona: no da por monitor a nadie que no se elija', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: checkedSheet({ status: 'IN_PROGRESS' }) });
    renderModal({ staff: STAFF_TWO_ASSISTANTS });
    await user.click(await screen.findByRole('radio', { name: sedationCopy.actions.DISCHARGE }));
    const monitor = screen.getByLabelText(sedationCopy.monitor);
    expect(monitor).toHaveValue('');
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.DISCHARGE }));
    expect(await screen.findByText(sedationCopy.monitorRequired)).toBeInTheDocument();
    expect(monitor).toHaveAttribute('aria-invalid', 'true');
    expect(mocked.discharge).not.toHaveBeenCalled();
  });

  it('409 (otro firmó el egreso a la vez): lo dice y recarga la hoja', async () => {
    const user = userEvent.setup();
    const closed = checkedSheet({
      status: 'DISCHARGED',
      discharge: {
        id: 'dc-1',
        criteria: platformTemplate().dischargeCriteria.map((c) => ({ ...c, met: true })),
        aldreteScore: null,
        vitalsId: 'v-9',
        dischargedAt: '2026-10-30T16:00:00.000Z',
        handedOverToName: 'Laura Ortiz',
        handedOverToRelationship: 'Madre',
        instructionsDelivered: true,
        operator: { id: 'u-otro', name: 'Dr. Otro' },
        monitor: { id: 'u-asis', name: 'Luis Pérez' },
        sameMonitorJustification: null,
        createdAt: '2026-10-30T16:00:00.000Z',
      },
    });
    mocked.entry
      .mockResolvedValueOnce({ template: platformTemplate(), sheet: checkedSheet({ status: 'IN_PROGRESS' }) })
      .mockResolvedValueOnce({ template: platformTemplate(), sheet: closed });
    mocked.vitals.mockRejectedValue(
      new ApiError(409, 'La hoja de sedación ya tiene el egreso firmado: no admite más registros.'),
    );
    renderModal();
    await user.click(await screen.findByRole('radio', { name: sedationCopy.actions.VITALS }));
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.VITALS }));
    expect(await screen.findByText(/ya tiene el egreso firmado/)).toBeInTheDocument();
    expect(await screen.findByText(sedationCopy.closed)).toBeInTheDocument();
    expect(mocked.entry).toHaveBeenCalledTimes(2);
  });

  it('con el egreso firmado la hoja es de solo lectura', async () => {
    mocked.entry.mockResolvedValue({
      template: platformTemplate(),
      sheet: checkedSheet({
        status: 'DISCHARGED',
        discharge: {
          id: 'dc-1',
          criteria: platformTemplate().dischargeCriteria.map((c) => ({ ...c, met: true })),
          aldreteScore: null,
          vitalsId: 'v-9',
          dischargedAt: '2026-10-30T16:00:00.000Z',
          handedOverToName: 'Laura Ortiz',
          handedOverToRelationship: 'Madre',
          instructionsDelivered: true,
          operator: { id: 'u-dent', name: 'Dra. Ana Ríos' },
          monitor: { id: 'u-asis', name: 'Luis Pérez' },
          sameMonitorJustification: null,
          createdAt: '2026-10-30T16:00:00.000Z',
        },
      }),
    });
    renderModal();
    expect(await screen.findByText(sedationCopy.closed)).toBeInTheDocument();
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: sedationCopy.submit.VITALS })).not.toBeInTheDocument();
  });
});

describe('SedationModal · correcciones de la QA (DX-407)', () => {
  /** jsdom no maqueta: el ancho del contenido y del marco se fingen. */
  function fakeWidths(scrollWidth: number, clientWidth: number) {
    const sw = jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
    const cw = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
    return () => {
      sw.mockRestore();
      cw.mockRestore();
    };
  }

  const withVitals = () =>
    checkedSheet({ status: 'IN_PROGRESS', vitals: [intraBy('u-asis')] });

  it('bug 1: la tabla de constantes que no cabe se desplaza en su marco, que es una región con nombre y foco', async () => {
    const restore = fakeWidths(594, 356);
    try {
      mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: withVitals() });
      renderModal();
      const region = await screen.findByRole('region', { name: sedationCopy.vitalsTable });
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region).toHaveClass('overflow-x-auto');
      expect(within(region).getByRole('table')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('bug 1: si la tabla cabe, el marco no es región ni parada de tabulador', async () => {
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: withVitals() });
    renderModal();
    expect(await screen.findByRole('table', { name: sedationCopy.vitalsHeading })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: sedationCopy.vitalsTable })).not.toBeInTheDocument();
  });

  it('bug 1: en móvil los campos de la toma van en una columna (dos o tres desde sm)', async () => {
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: withVitals() });
    renderModal({ role: 'ASSISTANT', userId: 'u-asis' });
    for (const label of [sedationCopy.phase, sedationCopy.spo2, sedationCopy.heartRate]) {
      const grid = (await screen.findByLabelText(label)).closest('.grid');
      expect(grid).toHaveClass('grid-cols-1');
      expect(grid?.className).not.toMatch(/(^|\s)grid-cols-[23]/);
    }
  });

  it('bug 2: cuenta intervalos vencidos sin toma, con el intervalo', async () => {
    mocked.entry.mockResolvedValue({
      template: platformTemplate(),
      sheet: checkedSheet({
        status: 'IN_PROGRESS',
        vitals: [intraBy('u-asis')],
        watch: { ...sedationSheet().watch, missedIntervals: 3 },
      }),
    });
    renderModal();
    expect(await screen.findByText('3 intervalos de 5 min vencidos sin toma.')).toBeInTheDocument();
    expect(sedationCopy.missed(1, 5)).toBe('1 intervalo de 5 min vencido sin toma.');
  });

  it('bug 3: con reloj de sede, la valoración y el checklist envían su hora y la lectura la usa', async () => {
    const user = userEvent.setup();
    const clock = testAgendaClock([utcSede()]);
    mocked.entry.mockResolvedValue({
      template: platformTemplate(),
      sheet: sedationSheet({ assessedAt: '2026-10-30T14:07:00.000Z', createdAt: '2026-10-30T15:00:00.000Z' }),
    });
    mocked.checklist.mockResolvedValue(checkedSheet());
    renderModal({ clock });
    // La lectura dice la hora de la valoración, no la del registro.
    expect(await screen.findByText('Dra. Ana Ríos · 14:07')).toBeInTheDocument();
    // TimeField por segmentos (UX v2): hora y minutos se escriben seguidos.
    const [hour] = within(screen.getByRole('group', { name: sedationCopy.checklistTime })).getAllByRole('spinbutton');
    await user.click(hour);
    await user.keyboard('1410');
    for (const item of platformTemplate().checklist.slice(0, 5)) {
      await user.click(screen.getByRole('checkbox', { name: (name) => name.startsWith(item.label) }));
    }
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.CHECKLIST }));
    await waitFor(() => expect(mocked.checklist).toHaveBeenCalled());
    expect(new Date(mocked.checklist.mock.calls[0][4] as string).toISOString()).toMatch(/T14:10:00\.000Z$/);
  });

  it('bug 3: la valoración con reloj envía la hora anotada', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: null });
    mocked.assess.mockResolvedValue(sedationSheet());
    renderModal({ clock: testAgendaClock([utcSede()]) });
    const [hour] = within(await screen.findByRole('group', { name: sedationCopy.assessedAt })).getAllByRole('spinbutton');
    await user.click(hour);
    await user.keyboard('0905');
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.ASSESS }));
    await waitFor(() => expect(mocked.assess).toHaveBeenCalled());
    expect(mocked.assess.mock.calls[0][3].assessedAt).toMatch(/T09:05:00\.000Z$/);
  });

  it('bug 4: un valor fuera de rango dice el rango permitido', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: checkedSheet() });
    renderModal();
    await user.click(await screen.findByRole('radio', { name: sedationCopy.actions.AGENT }));
    await user.type(screen.getByLabelText(sedationCopy.n2oPercent), '80');
    await user.click(screen.getByRole('button', { name: sedationCopy.submit.AGENT }));
    expect(await screen.findByText('Escribe un número entero entre 10 y 70 %.')).toBeInTheDocument();
    expect(screen.getByLabelText(sedationCopy.n2oPercent)).toHaveAttribute('aria-invalid', 'true');
    expect(mocked.agent).not.toHaveBeenCalled();
  });

  it('bug 4: el mensaje dice también los decimales que admite el campo', () => {
    expect(sedationCopy.outOfRange({ min: 0.1, max: 399, decimals: 1 }, 'kg')).toBe(
      'Escribe un número entre 0,1 y 399 kg, con 1 decimal como mucho.',
    );
    expect(sedationCopy.outOfRange({ min: 0, max: 10 })).toBe('Escribe un número entero entre 0 y 10.');
  });

  it('bug 6: el radio «Fármaco» y el campo del nombre del fármaco se llaman distinto', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue({ template: platformTemplate(), sheet: checkedSheet() });
    renderModal();
    await user.click(await screen.findByRole('radio', { name: 'Fármaco' }));
    await user.selectOptions(screen.getByLabelText(sedationCopy.agentKind), 'ORAL');
    expect(screen.getByRole('textbox', { name: 'Nombre del fármaco' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Fármaco$/)).toHaveLength(1);
  });
});
