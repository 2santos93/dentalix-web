import { ApiError } from '@/lib/api/api-error';
import {
  POST_OP_OUTCOME_LABELS,
  POST_OP_OUTCOME_ORDER,
  canRegisterPostOpOutcome,
  countPostOpChecks,
  isPostOpCheckClosedError,
  listPostOpChecks,
  postOpAttemptsLabel,
  postOpDueLabel,
  registerPostOpAttempt,
} from './post-op-checks-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('post-op-checks-api (DX-566)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({} as never);
  });

  it('lista con la página y sin parámetros vacíos (la sede va en la cabecera)', async () => {
    await listPostOpChecks('tok');
    expect(mockedFetch).toHaveBeenLastCalledWith('/post-op-checks', { token: 'tok' });
    await listPostOpChecks('tok', { page: 2, pageSize: 25 });
    expect(mockedFetch).toHaveBeenLastCalledWith('/post-op-checks?page=2&pageSize=25', { token: 'tok' });
  });

  it('cuenta con el mismo alcance que la lista', async () => {
    await countPostOpChecks('tok', { include: 'today' });
    expect(mockedFetch).toHaveBeenLastCalledWith('/post-op-checks/count?include=today', { token: 'tok' });
  });

  it('registra un intento con su resultado y su nota', async () => {
    await registerPostOpAttempt('tok', 'c1', { outcome: 'NO_ANSWER', note: 'Buzón de voz' });
    expect(mockedFetch).toHaveBeenCalledWith('/post-op-checks/c1/attempts', {
      token: 'tok',
      method: 'POST',
      body: { outcome: 'NO_ANSWER', note: 'Buzón de voz' },
    });
  });

  it('solo los roles clínicos registran el resultado', () => {
    expect(canRegisterPostOpOutcome('DENTIST')).toBe(true);
    expect(canRegisterPostOpOutcome('ASSISTANT')).toBe(true);
    expect(canRegisterPostOpOutcome('ADMIN')).toBe(true);
    expect(canRegisterPostOpOutcome('RECEPTION')).toBe(false);
    expect(canRegisterPostOpOutcome(null)).toBe(false);
  });

  it('nombra los cuatro resultados en el orden del diálogo', () => {
    expect(POST_OP_OUTCOME_ORDER.map((o) => POST_OP_OUTCOME_LABELS[o])).toEqual([
      'Bien',
      'Molestias',
      'Necesita cita',
      'No contesta',
    ]);
  });

  it('el 409 de control cerrado sí; el de la sede sin formato regional, no', () => {
    expect(isPostOpCheckClosedError(new ApiError(409, 'Ya está cerrado'))).toBe(true);
    expect(isPostOpCheckClosedError(new ApiError(409, 'Sin formato', { code: 'LOCATION_LOCALE_REQUIRED' }))).toBe(false);
    expect(isPostOpCheckClosedError(new ApiError(404, 'No encontrado'))).toBe(false);
  });

  it('dice cuándo vence y cuántos intentos lleva', () => {
    expect(postOpDueLabel(0)).toBe('Vence hoy');
    expect(postOpDueLabel(1)).toBe('Vencido hace 1 día');
    expect(postOpDueLabel(4)).toBe('Vencido hace 4 días');
    expect(postOpAttemptsLabel(0)).toBe('Sin intentos');
    expect(postOpAttemptsLabel(1)).toBe('1 intento');
    expect(postOpAttemptsLabel(2)).toBe('2 intentos');
  });
});
