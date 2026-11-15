import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentsStep } from './appointments-step';
import { removeAppointments, uploadAppointments } from '@/lib/patient-imports/patient-imports-api';
import { appointmentsFixture, batchFixture } from '@/lib/test/patient-imports';
import { regionalFormat } from '@/lib/format/regional-format';
import { ApiError } from '@/lib/api/client';

jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/patient-imports/patient-imports-api', () => ({
  ...jest.requireActual('../../lib/patient-imports/patient-imports-api'),
  uploadAppointments: jest.fn(),
  removeAppointments: jest.fn(),
  downloadAppointmentTemplate: jest.fn().mockResolvedValue('csv'),
  downloadAppointmentErrorsCsv: jest.fn().mockResolvedValue('csv'),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));

const FMT = regionalFormat({ locale: 'es-VE', hourCycle: 'h23' });
const mockedUpload = uploadAppointments as jest.MockedFunction<typeof uploadAppointments>;
const mockedRemove = removeAppointments as jest.MockedFunction<typeof removeAppointments>;
const citas = () => new File(['numero_documento;fecha;hora\n1;2;3'], 'citas.csv', { type: 'text/csv' });

const validated = batchFixture({
  appointments: appointmentsFixture(),
  appointmentIssues: [
    {
      row: 3,
      column: null,
      kind: 'ERROR',
      message: 'Se solapa con la cita de la fila 2 del archivo: el profesional ya tiene una cita a esa hora.',
      value: null,
    },
    {
      row: 4,
      column: 'email_profesional',
      kind: 'ERROR',
      message: 'Nadie del equipo de la clínica tiene el email «x@y.com»: la cita no se asigna a otro profesional.',
      value: 'x@y.com',
    },
    {
      row: 5,
      column: 'duracion_min',
      kind: 'WARNING',
      message: 'Sin duración en el archivo: se usan los 45 minutos del tipo «Limpieza».',
      value: null,
    },
  ],
  appointmentIssuesTotal: 3,
});

beforeEach(() => jest.clearAllMocks());

function setup(batch = batchFixture()) {
  const onBatch = jest.fn();
  const onContinue = jest.fn();
  render(
    <AppointmentsStep
      token="tok"
      headingId="h"
      batch={batch}
      onBatch={onBatch}
      onBack={jest.fn()}
      onContinue={onContinue}
      fmt={FMT}
    />,
  );
  return { onBatch, onContinue };
}

it('sin hoja: explica las reglas y que no habrá recordatorios, y deja seguir sin citas', async () => {
  const user = userEvent.setup();
  const { onContinue } = setup();
  expect(screen.getByRole('heading', { name: 'Citas futuras (opcional)' })).toBeInTheDocument();
  expect(screen.getByText(/mismas reglas que al agendar a mano/)).toBeInTheDocument();
  expect(screen.getByText(/zona horaria de la sede/)).toBeInTheDocument();
  expect(screen.getByText(/no reciben recordatorios automáticos/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continuar sin citas' }));
  expect(onContinue).toHaveBeenCalled();
});

it('subir la hoja: la valida y enseña recuentos, errores por fila en español y avisos', async () => {
  const user = userEvent.setup();
  mockedUpload.mockResolvedValue(validated);
  const { onBatch } = setup();
  await user.upload(screen.getByLabelText('Hoja de citas (CSV o .xlsx)'), citas());
  expect(mockedUpload).toHaveBeenCalledWith('tok', 'batch-1', expect.any(File), expect.any(Function));
  expect(onBatch).toHaveBeenCalledWith(validated);
});

it('con la hoja validada: recuentos, tabla de errores y avisos, y quitarla', async () => {
  const user = userEvent.setup();
  mockedRemove.mockResolvedValue(batchFixture());
  const { onBatch } = setup(validated);
  expect(screen.getByText('citas.csv · 5 filas')).toBeInTheDocument();
  expect(screen.getByText('Citas a crear').nextSibling).toHaveTextContent('3');
  expect(screen.getByText('Filas rechazadas').nextSibling).toHaveTextContent('2');
  const issues = screen.getByRole('table', { name: 'Errores y avisos de la hoja de citas' });
  expect(within(issues).getByText(/el profesional ya tiene una cita a esa hora/)).toBeInTheDocument();
  expect(within(issues).getByText(/no se asigna a otro profesional/)).toBeInTheDocument();
  expect(within(issues).getByText('Aviso')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Quitar la hoja de citas' }));
  expect(mockedRemove).toHaveBeenCalledWith('tok', 'batch-1');
  expect(onBatch).toHaveBeenCalled();
});

it('un error de la API (columna que falta) se enseña junto al botón', async () => {
  const user = userEvent.setup();
  mockedUpload.mockRejectedValue(
    new ApiError(400, 'Bad Request', {
      messages: ['A la hoja de citas le falta la columna «Hora».'],
    }),
  );
  setup();
  await user.upload(screen.getByLabelText('Hoja de citas (CSV o .xlsx)'), citas());
  expect(await screen.findByText(/le falta la columna «Hora»/)).toBeInTheDocument();
});
