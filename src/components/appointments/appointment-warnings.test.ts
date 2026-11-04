import { toast } from 'sonner';
import { announceAppointmentWarnings } from './appointment-warnings';

jest.mock('sonner', () => ({ toast: { warning: jest.fn() } }));
const warning = toast.warning as jest.Mock;

beforeEach(() => warning.mockClear());

describe('announceAppointmentWarnings (DX-122, DX-233)', () => {
  it('fuera del horario del profesional: aviso con título propio y el texto de la API', () => {
    announceAppointmentWarnings({
      warnings: [
        'Fuera del horario del profesional en Sede Norte (jueves 22 de octubre: 2:00 p. m.–7:00 p. m.).',
        'La cita cae en un bloqueo que permite agendar: Almuerzo (13:00–14:00).',
      ],
      warningCodes: ['PROVIDER_OFF_SCHEDULE', 'SCHEDULE_BLOCK'],
    });
    expect(warning).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenNthCalledWith(1, 'Cita fuera del horario del profesional', {
      description: 'Fuera del horario del profesional en Sede Norte (jueves 22 de octubre: 2:00 p. m.–7:00 p. m.).',
      duration: 10000,
    });
    expect(warning).toHaveBeenNthCalledWith(2, 'La cita cae en un bloqueo que permite agendar: Almuerzo (13:00–14:00).');
  });

  // DX-354b (T26, DX-520-bis): el texto lo escribe la API con las palabras y el reloj de la sede; la web no lo rehace con dígitos.
  it.each([
    ['12 h (Caracas)', 'Fuera del horario del profesional en Sede B (jueves 5 de noviembre: 9:00 a. m.–1:00 p. m.).'],
    ['24 h (Berlín)', 'Fuera del horario del profesional en Sede B (jueves 5 de noviembre: 09:00–13:00).'],
  ])('el toast muestra el texto de la API tal cual: %s', (_clock, message) => {
    announceAppointmentWarnings({ warnings: [message], warningCodes: ['PROVIDER_OFF_SCHEDULE'] });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('Cita fuera del horario del profesional', {
      description: message,
      duration: 10000,
    });
    // Sin reescribir dígitos: ni dd/mm ni una hora recompuesta.
    expect((warning.mock.calls[0][1] as { description: string }).description).not.toMatch(/\d{2}\/\d{2}/);
  });

  it('sin códigos (API anterior) enseña el texto tal cual; sin avisos, nada', () => {
    announceAppointmentWarnings({ warnings: ['Aviso'] });
    expect(warning).toHaveBeenCalledWith('Aviso');
    warning.mockClear();
    announceAppointmentWarnings(null);
    announceAppointmentWarnings({});
    expect(warning).not.toHaveBeenCalled();
  });
});
