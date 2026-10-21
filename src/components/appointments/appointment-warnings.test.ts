import { toast } from 'sonner';
import { announceAppointmentWarnings } from './appointment-warnings';

jest.mock('sonner', () => ({ toast: { warning: jest.fn() } }));
const warning = toast.warning as jest.Mock;

beforeEach(() => warning.mockClear());

describe('announceAppointmentWarnings (DX-122, DX-233)', () => {
  it('fuera del horario del profesional: aviso con título propio y el texto de la API', () => {
    announceAppointmentWarnings({
      warnings: [
        'Fuera del horario del profesional en Sede Norte (jueves 22/10: 14:00–19:00).',
        'La cita cae en un bloqueo que permite agendar: Almuerzo (13:00–14:00).',
      ],
      warningCodes: ['PROVIDER_OFF_SCHEDULE', 'SCHEDULE_BLOCK'],
    });
    expect(warning).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenNthCalledWith(1, 'Cita fuera del horario del profesional', {
      description: 'Fuera del horario del profesional en Sede Norte (jueves 22/10: 14:00–19:00).',
      duration: 10000,
    });
    expect(warning).toHaveBeenNthCalledWith(2, 'La cita cae en un bloqueo que permite agendar: Almuerzo (13:00–14:00).');
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
