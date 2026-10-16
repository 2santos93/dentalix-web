import { ApiError, NetworkError } from '@/lib/api/client';
import { perioErrorMessage } from './perio-api';

describe('perioErrorMessage (QA DX-007: nada de errores crudos en inglés)', () => {
  it('usa el texto del servidor en 400 y 409, que el módulo redacta en español', () => {
    expect(perioErrorMessage(new ApiError(400, 'Sondaje fuera de rango'), 'x')).toBe(
      'Sondaje fuera de rango',
    );
    expect(perioErrorMessage(new ApiError(409, 'El examen ya está finalizado'), 'x')).toBe(
      'El examen ya está finalizado',
    );
  });

  it.each([500, 503])('cae en el texto propio con %i', (status) => {
    expect(
      perioErrorMessage(new ApiError(status, 'Internal server error'), 'No se pudo cargar'),
    ).toBe('No se pudo cargar');
  });

  it.each([
    [403, 'Insufficient role', /no tienes permiso/i],
    [404, 'Patient not found', /no encontramos/i],
  ])('un %i técnico se dice en español con el helper común (DX-063)', (status, raw, expected) => {
    const text = perioErrorMessage(new ApiError(status, raw), 'No se pudo cargar');
    expect(text).toMatch(expected);
    expect(text).not.toContain(raw);
  });

  it('un error de red dice que no hay conexión, en español', () => {
    expect(perioErrorMessage(new NetworkError(new TypeError('Failed to fetch')), 'No se pudo cargar')).toMatch(
      /no hay conexión/i,
    );
  });
});
