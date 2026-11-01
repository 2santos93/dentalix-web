import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  PatientRetentionDialogs,
  PatientRetentionSection,
  formatCivilDate,
  retentionChip,
  retentionHint,
  type RetentionDialog,
} from './patient-retention-section';
import {
  archivePatient,
  getPatientLivePublicLinks,
  partiallySuppressPatient,
  setRetentionExtension,
  type Patient,
} from '@/lib/patients/patients-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  archivePatient: jest.fn(),
  getPatientLivePublicLinks: jest.fn(),
  setRetentionExtension: jest.fn(),
  partiallySuppressPatient: jest.fn(),
}));

const mockedArchive = archivePatient as jest.MockedFunction<typeof archivePatient>;
const mockedSetRetention = setRetentionExtension as jest.MockedFunction<
  typeof setRetentionExtension
>;
const mockedSuppress = partiallySuppressPatient as jest.MockedFunction<
  typeof partiallySuppressPatient
>;

const RETENTION_MESSAGE =
  'La historia clínica de este paciente está en retención hasta el 28/02/2039 (15 años desde la última atención): no se puede archivar ni borrar. Si necesitas retirar sus datos de contacto, usa la supresión parcial.';

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    tenantId: 't1',
    firstName: 'Ana',
    lastName: 'Gómez',
    docType: 'NATIONAL_ID',
    docNumber: '1002',
    birthDate: null,
    sex: 'F',
    phone: '3001112233',
    email: 'ana@example.com',
    address: null,
    notes: null,
    createdById: null,
    lastAttentionAt: '2024-02-29T15:00:00.000Z',
    retentionExtended: 'NONE',
    retentionUntil: '2039-02-28',
    underRetention: true,
    partiallySuppressedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    clinicRetentionYears: 15,
    retentionFromPreviousTerm: false,
    ...overrides,
  };
}

function renderSection(p: Patient) {
  render(<PatientRetentionSection patient={p} />);
}

/**
 * Los modales viven fuera de la sección (los abre el menú «⋯» de la
 * cabecera): el arnés hace de cabecera con un botón por acción.
 */
function renderDialogs(p: Patient) {
  const onUpdated = jest.fn();
  const onArchived = jest.fn();
  function Harness() {
    const [dialog, setDialog] = useState<RetentionDialog | null>(null);
    return (
      <>
        <button type="button" onClick={() => setDialog('retention')}>
          Cambiar retención
        </button>
        <button type="button" onClick={() => setDialog('suppress')}>
          Supresión parcial
        </button>
        <button type="button" onClick={() => setDialog('archive')}>
          Archivar paciente
        </button>
        <PatientRetentionDialogs
          patient={p}
          token="tok"
          dialog={dialog}
          onDialogChange={setDialog}
          onUpdated={onUpdated}
          onArchived={onArchived}
        />
      </>
    );
  }
  render(<Harness />);
  return { onUpdated, onArchived };
}

const mockedCount = getPatientLivePublicLinks as jest.MockedFunction<
  typeof getPatientLivePublicLinks
>;
const NO_LINKS = {
  slotOffers: 0,
  consentSignatures: 0,
  budgetSignatures: 0,
  signedPdfCopies: 0,
  anamnesis: 0,
  total: 0,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedCount.mockResolvedValue(NO_LINKS);
});

test('formatCivilDate no pasa por la zona del navegador', () => {
  expect(formatCivilDate('2039-02-28')).toBe('28/02/2039');
  expect(formatCivilDate('2026-10-16T23:30:00.000Z')).toBe('16/10/2026');
});

test('muestra la fecha hasta la que se conserva, sin controles en la sección', () => {
  renderSection(patient());
  expect(
    screen.getByRole('region', { name: 'Retención de la historia clínica' }),
  ).toHaveTextContent('Historia en retención hasta 28/02/2039');
  // Los controles viven en el menú «⋯» de la cabecera.
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('chip de la cabecera: corto y neutro, con la frase del plazo de ayuda', () => {
  expect(retentionChip(patient())).toEqual({
    text: 'Retención hasta 28/02/2039',
    hint: 'Se conserva 15 años desde la última atención. Mientras dure, el paciente no se puede archivar.',
  });
  expect(retentionChip(patient({ retentionExtended: 'PERMANENT', retentionUntil: null }))?.text).toBe(
    'Retención permanente',
  );
  expect(
    retentionChip(patient({ retentionUntil: '2020-01-01', underRetention: false })),
  ).toEqual({ text: 'Retención vencida el 01/01/2020', hint: null });
  expect(
    retentionChip(patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false })),
  ).toBeNull();
});

test('plazo doble: el aviso cita 30 años, no 15', () => {
  renderSection(patient({ retentionExtended: 'DOUBLE', retentionUntil: '2054-02-28' }));
  expect(screen.getByText('Historia en retención hasta 28/02/2054')).toBeInTheDocument();
  expect(screen.getByText(/Plazo doble: se conserva 30 años/)).toBeInTheDocument();
  expect(screen.queryByText(/15 años/)).not.toBeInTheDocument();
});

describe('DX-330: el plazo es el de la clínica', () => {
  const twenty = { clinicRetentionYears: 20, retentionUntil: '2044-02-28' } as const;

  test('con N = 20 la sección dice 20 y el plazo doble 40, nunca 15 ni «legal»', () => {
    const { unmount } = render(<PatientRetentionSection patient={patient(twenty)} />);
    expect(
      screen.getByText('Se conserva 20 años desde la última atención. Mientras dure, el paciente no se puede archivar.'),
    ).toBeInTheDocument();
    unmount();
    const { container } = render(
      <PatientRetentionSection
        patient={patient({ ...twenty, retentionExtended: 'DOUBLE', retentionUntil: '2064-02-28' })}
      />,
    );
    expect(screen.getByText('Plazo doble (40 años)')).toBeInTheDocument();
    expect(screen.getByText(/Plazo doble: se conserva 40 años/)).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/15 años|legal/i);
  });

  test('el modal ofrece las opciones con el plazo de la clínica', async () => {
    const user = userEvent.setup();
    renderDialogs(patient(twenty));
    await user.click(screen.getByRole('button', { name: 'Cambiar retención' }));
    const dialog = await screen.findByRole('dialog');
    const options = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      '20 años desde la última atención (plazo de la clínica)',
      '40 años (plazo doble)',
      'Permanente (nunca se libera)',
    ]);
    expect(dialog).not.toHaveTextContent(/15 años|legal|DD\. HH\./i);
  });

  test('con retentionFromPreviousTerm, la ayuda cita el plazo anterior con la fecha, en la sección y en el chip', () => {
    const previous = patient({ ...twenty, retentionUntil: '2039-02-28', retentionFromPreviousTerm: true });
    const hint =
      'Se conserva hasta el 28/02/2039 por el plazo anterior de la clínica. Mientras dure, el paciente no se puede archivar.';
    renderSection(previous);
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(retentionChip(previous)?.hint).toBe(hint);
    expect(retentionHint(previous)).toBe(hint);
  });

  it('without clinicRetentionYears no number is painted', () => {
    const old = patient({ retentionExtended: 'DOUBLE', clinicRetentionYears: undefined });
    const { container } = render(<PatientRetentionSection patient={old} />);
    expect(screen.getByText('Plazo doble')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\b(15|30|2\d|40)\s+años/);
    expect(retentionHint(patient({ clinicRetentionYears: undefined }))).toBe(
      'Se conserva el plazo de la clínica desde la última atención. Mientras dure, el paciente no se puede archivar.',
    );
  });
});

test('retención permanente, vencida y sin atenciones', () => {
  const { unmount } = render(
    <PatientRetentionSection patient={patient({ retentionExtended: 'PERMANENT', retentionUntil: null })} />,
  );
  expect(screen.getByText('Historia en retención permanente')).toBeInTheDocument();
  expect(
    screen.getByText('Se conserva sin fecha de fin: el paciente no se puede archivar.'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/15 años/)).not.toBeInTheDocument();
  unmount();
  renderSection(patient({ retentionUntil: '2020-01-01', underRetention: false }));
  expect(screen.getByText('Retención vencida el 01/01/2020')).toBeInTheDocument();
});

test('sin atenciones clínicas: lo dice', () => {
  renderSection(
    patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false }),
  );
  expect(screen.getByText('Sin atenciones clínicas: sin retención')).toBeInTheDocument();
});

test('archivar con la HC en retención: el 409 se muestra en español en el modal', async () => {
  const user = userEvent.setup();
  mockedArchive.mockRejectedValue(new ApiError(409, RETENTION_MESSAGE));
  const { onArchived } = renderDialogs(patient());
  await user.click(screen.getByRole('button', { name: /archivar paciente/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Archivar' }));
  expect(await within(dialog).findByText(RETENTION_MESSAGE)).toBeInTheDocument();
  expect(mockedArchive).toHaveBeenCalledWith('tok', 'p1');
  expect(onArchived).not.toHaveBeenCalled();
});

test('archivar con citas abiertas: el 409 de la API se muestra en el modal', async () => {
  const user = userEvent.setup();
  const message =
    'Este paciente tiene 1 cita programada o confirmada: cancélala o márcala como atendida o no asistida antes de archivarlo.';
  mockedArchive.mockRejectedValue(new ApiError(409, message));
  const { onArchived } = renderDialogs(
    patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false }),
  );
  await user.click(screen.getByRole('button', { name: /archivar paciente/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Archivar' }));
  expect(await within(dialog).findByText(message)).toBeInTheDocument();
  expect(onArchived).not.toHaveBeenCalled();
});

test('archivar sin retención cierra el modal y avisa al padre', async () => {
  const user = userEvent.setup();
  mockedArchive.mockResolvedValue(undefined);
  const { onArchived } = renderDialogs(
    patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false }),
  );
  await user.click(screen.getByRole('button', { name: /archivar paciente/i }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archivar' }));
  await waitFor(() => expect(onArchived).toHaveBeenCalled());
});

test('DX-461: el diálogo de archivar avisa de los enlaces enviados que se anularán', async () => {
  const user = userEvent.setup();
  mockedCount.mockResolvedValue({ ...NO_LINKS, slotOffers: 1, consentSignatures: 2, total: 3 });
  mockedArchive.mockResolvedValue(undefined);
  const { onArchived } = renderDialogs(
    patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false }),
  );
  // Solo se cuentan al abrir el diálogo.
  expect(mockedCount).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /archivar paciente/i }));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Se anularán 3 enlaces enviados')).toBeInTheDocument();
  expect(mockedCount).toHaveBeenCalledWith('tok', 'p1');
  await user.click(within(dialog).getByRole('button', { name: 'Archivar' }));
  await waitFor(() => expect(onArchived).toHaveBeenCalled());
});

test('cambiar la retención exige motivo y envía el valor elegido', async () => {
  const user = userEvent.setup();
  const updated = patient({ retentionExtended: 'PERMANENT', retentionUntil: null });
  let resolve: (p: Patient) => void = () => undefined;
  mockedSetRetention.mockReturnValue(new Promise((r) => (resolve = r)));
  const { onUpdated } = renderDialogs(patient());
  await user.click(screen.getByRole('button', { name: 'Cambiar retención' }));
  const dialog = await screen.findByRole('dialog');
  await user.selectOptions(within(dialog).getByLabelText('Plazo'), 'PERMANENT');
  await user.type(within(dialog).getByLabelText('Motivo'), 'corto');
  await user.click(within(dialog).getByRole('button', { name: 'Guardar retención' }));
  expect(
    within(dialog).getByText('El motivo debe tener al menos 10 caracteres.'),
  ).toBeInTheDocument();
  expect(mockedSetRetention).not.toHaveBeenCalled();

  await user.type(within(dialog).getByLabelText('Motivo'), ' víctima del conflicto');
  await user.click(within(dialog).getByRole('button', { name: 'Guardar retención' }));
  expect(mockedSetRetention).toHaveBeenCalledWith('tok', 'p1', {
    retentionExtended: 'PERMANENT',
    reason: 'corto víctima del conflicto',
  });
  // Estado de carga: el envío queda deshabilitado mientras viaja.
  expect(within(dialog).getByRole('button', { name: /guardar retención/i })).toBeDisabled();
  resolve(updated);
  await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('supresión parcial: error de la API visible y el modal sigue abierto', async () => {
  const user = userEvent.setup();
  mockedSuppress.mockRejectedValue(new ApiError(403, 'Forbidden'));
  renderDialogs(patient());
  await user.click(screen.getByRole('button', { name: 'Supresión parcial' }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Motivo'), 'Reclamo del titular de los datos');
  await user.click(within(dialog).getByRole('button', { name: 'Suprimir datos' }));
  expect(await within(dialog).findByText(/no tienes permiso/i)).toBeInTheDocument();
  expect(mockedSuppress).toHaveBeenCalledWith('tok', 'p1', {
    reason: 'Reclamo del titular de los datos',
  });
});
